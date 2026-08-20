(function (root) {
  "use strict";

  var enc = new TextEncoder();
  var dec = new TextDecoder("utf-8", {fatal: true});
  var context = enc.encode("Bluephone/Hullo/v1 episode keys");
  var mediaContext = enc.encode("Bluephone/Hullo/v1 media keys");
  var salt = enc.encode("Bluephone/Hullo/v1 HKDF salt");

  function join(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  }

  function compareBytes(a, b) {
    var i;
    if (a.length !== b.length) return a.length < b.length ? -1 : 1;
    for (i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
    }
    return 0;
  }

  function urlBytes(value) {
    value = value.replace(/-/g, "+").replace(/_/g, "/");
    while (value.length % 4) value += "=";
    return BluephonePeerCore.fromBase64(value);
  }

  function aad(episode, type) {
    return join(enc.encode("Bluephone/Hullo/v1\n" + episode + "\n"), new Uint8Array([type]));
  }

  function parseHello(packet) {
    var length;
    if (!(packet instanceof Uint8Array) || packet.length < 4 || packet[0] !== 1) throw new Error("invalid protected episode hello");
    length = packet[1] << 8 | packet[2];
    if (length < 1 || packet.length !== 3 + length) throw new Error("invalid protected episode hello");
    return packet.slice(3);
  }

  async function importBase(shared) {
    return crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  }

  async function buildEpisode(episode, base, publicKey, outboundFirst) {
    var info = join(context, enc.encode("\n" + episode));
    var material = new Uint8Array(await crypto.subtle.deriveBits({name: "HKDF", hash: "SHA-256", salt: salt, info: info}, base, 512));
    var outboundRaw = outboundFirst ? material.slice(0, 32) : material.slice(32);
    var inboundRaw = outboundFirst ? material.slice(32) : material.slice(0, 32);
    var outbound = await crypto.subtle.importKey("raw", outboundRaw, "AES-GCM", false, ["encrypt"]);
    var inbound = await crypto.subtle.importKey("raw", inboundRaw, "AES-GCM", false, ["decrypt"]);
    var seen = Object.create(null);

    async function encryptPacket(type, clear) {
      var nonce = crypto.getRandomValues(new Uint8Array(12));
      var sealed = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv: nonce, additionalData: aad(episode, type), tagLength: 128}, outbound, clear));
      var out = new Uint8Array(13 + sealed.length);
      out[0] = type;
      out.set(nonce, 1);
      out.set(sealed, 13);
      return out;
    }

    return {
      hello: function () {
        var out = new Uint8Array(3 + publicKey.length);
        out[0] = 1;
        out[1] = publicKey.length >>> 8;
        out[2] = publicKey.length;
        out.set(publicKey, 3);
        return out;
      },
      ready: function () {
        return encryptPacket(2, enc.encode("ready"));
      },
      decrypt: async function (packet) {
        var type, nonce, id, clear;
        if (packet.length < 29 || (packet[0] !== 2 && packet[0] !== 3 && packet[0] !== 4 && packet[0] !== 5)) throw new Error("invalid protected episode packet");
        type = packet[0];
        nonce = packet.slice(1, 13);
        id = BluephonePeerCore.toBase64(nonce);
        if (seen[id]) throw new Error("replayed protected episode nonce");
        clear = new Uint8Array(await crypto.subtle.decrypt({name: "AES-GCM", iv: nonce, additionalData: aad(episode, type), tagLength: 128}, inbound, packet.slice(13)));
        seen[id] = true;
        return type === 5 ? {type: type, bytes: clear} : {type: type, text: dec.decode(clear)};
      },
      encrypt: function (text) {
        return encryptPacket(3, enc.encode(text));
      },
      encryptControl: function (value) {
        return encryptPacket(4, enc.encode(JSON.stringify(value)));
      },
      encryptBinary: function (bytes) {
        return encryptPacket(5, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      },
      deriveMedia: async function (callId, kind) {
        var label, mediaInfo, bits, first, second, outPart, inPart;
        if (!/^[A-Za-z0-9_-]{16,96}$/.test(callId)) throw new Error("invalid call id");
        if (kind !== "audio" && kind !== "video") throw new Error("invalid media kind");
        label = "Bluephone/Hullo/v1 media\n" + episode + "\n" + callId + "\n" + kind;
        mediaInfo = join(mediaContext, enc.encode("\n" + episode + "\n" + callId + "\n" + kind));
        bits = new Uint8Array(await crypto.subtle.deriveBits({name: "HKDF", hash: "SHA-256", salt: salt, info: mediaInfo}, base, 576));
        first = bits.slice(0, 36);
        second = bits.slice(36, 72);
        outPart = outboundFirst ? first : second;
        inPart = outboundFirst ? second : first;
        return {
          aad: enc.encode(label),
          outbound: {key: outPart.slice(0, 32), noncePrefix: outPart.slice(32, 36)},
          inbound: {key: inPart.slice(0, 32), noncePrefix: inPart.slice(32, 36)}
        };
      }
    };
  }

  async function create(episode, handsetSpki) {
    var pair = await crypto.subtle.generateKey({name: "ECDH", namedCurve: "P-256"}, false, ["deriveBits"]);
    var handset = await crypto.subtle.importKey("spki", urlBytes(handsetSpki), {name: "ECDH", namedCurve: "P-256"}, false, []);
    var shared = await crypto.subtle.deriveBits({name: "ECDH", public: handset}, pair.privateKey, 256);
    var base = await importBase(shared);
    var publicKey = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    return buildEpisode(episode, base, publicKey, true);
  }

  async function createLab(episode) {
    var pair = await crypto.subtle.generateKey({name: "ECDH", namedCurve: "P-256"}, false, ["deriveBits"]);
    var publicKey = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    var established = null;
    var accepting = null;

    return {
      hello: function () {
        var out = new Uint8Array(3 + publicKey.length);
        out[0] = 1;
        out[1] = publicKey.length >>> 8;
        out[2] = publicKey.length;
        out.set(publicKey, 3);
        return out;
      },
      acceptHello: function (packet) {
        if (established) return Promise.resolve(established);
        if (accepting) return accepting;
        accepting = (async function () {
          var remotePublic = parseHello(packet);
          var order = compareBytes(publicKey, remotePublic);
          var remote, shared, base;
          if (!order) throw new Error("lab peer reflected its own episode key");
          remote = await crypto.subtle.importKey("spki", remotePublic, {name: "ECDH", namedCurve: "P-256"}, false, []);
          shared = await crypto.subtle.deriveBits({name: "ECDH", public: remote}, pair.privateKey, 256);
          base = await importBase(shared);
          established = await buildEpisode(episode, base, publicKey, order < 0);
          return established;
        }());
        return accepting;
      },
      ready: function () {
        if (!established) return Promise.reject(new Error("lab episode key exchange incomplete"));
        return established.ready();
      },
      decrypt: function (packet) {
        if (!established) return Promise.reject(new Error("lab episode key exchange incomplete"));
        return established.decrypt(packet);
      },
      encrypt: function (text) {
        if (!established) return Promise.reject(new Error("lab episode key exchange incomplete"));
        return established.encrypt(text);
      },
      encryptControl: function (value) {
        if (!established) return Promise.reject(new Error("lab episode key exchange incomplete"));
        return established.encryptControl(value);
      },
      encryptBinary: function (bytes) {
        if (!established) return Promise.reject(new Error("lab episode key exchange incomplete"));
        return established.encryptBinary(bytes);
      },
      deriveMedia: function (callId, kind) {
        if (!established) return Promise.reject(new Error("lab episode key exchange incomplete"));
        return established.deriveMedia(callId, kind);
      },
      isEstablished: function () { return Boolean(established); }
    };
  }

  root.HulloEpisodeCrypto = {create: create, createLab: createLab};
}(window));
