"use strict";

var MASK_64 = (1n << 64n) - 1n;

function encodeCounter(value) {
  var out = new Uint8Array(8), i;
  for (i = 7; i >= 0; i -= 1) {
    out[i] = Number(value & 255n);
    value >>= 8n;
  }
  return out;
}

function decodeCounter(bytes) {
  var value = 0n, i;
  for (i = 0; i < 8; i += 1) value = (value << 8n) | BigInt(bytes[i]);
  return value;
}

function makeIv(prefix, counterBytes) {
  var iv = new Uint8Array(12);
  iv.set(prefix, 0);
  iv.set(counterBytes, 4);
  return iv;
}

function makeReplayWindow() {
  var highest = -1n;
  var mask = 0n;
  return function (counter) {
    var delta, bit;
    if (highest < 0n) {
      highest = counter;
      mask = 1n;
      return true;
    }
    if (counter > highest) {
      delta = counter - highest;
      mask = delta >= 64n ? 1n : (mask << delta | 1n) & MASK_64;
      highest = counter;
      return true;
    }
    delta = highest - counter;
    if (delta >= 64n) return false;
    bit = 1n << delta;
    if (mask & bit) return false;
    mask |= bit;
    return true;
  };
}

self.onrtctransform = function (event) {
  var transformer = event.transformer;
  var options = transformer.options || {};
  var operation = options.operation;
  var callId = String(options.callId || "");
  var kind = String(options.kind || "audio");
  var keyBytes = new Uint8Array(options.key || []);
  var noncePrefix = new Uint8Array(options.noncePrefix || []);
  var additionalData = new Uint8Array(options.aad || []);
  var counter = 0n;
  var acceptCounter = makeReplayWindow();
  var reportedError = false;
  var usage = operation === "encrypt" ? ["encrypt"] : ["decrypt"];
  var keyPromise;

  if ((operation !== "encrypt" && operation !== "decrypt") || keyBytes.length !== 32 || noncePrefix.length !== 4) {
    self.postMessage({type: "media-error", callId: callId, kind: kind, message: "invalid media transform configuration"});
    return;
  }

  keyPromise = crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, usage);

  function report(error) {
    if (reportedError) return;
    reportedError = true;
    self.postMessage({type: "media-error", callId: callId, kind: kind, message: String(error && error.message || error || "media encryption failed").slice(0, 160)});
  }

  var transform = new TransformStream({
    transform: async function (frame, controller) {
      var key, clear, counterBytes, iv, sealed, packet, incomingCounter;
      try {
        key = await keyPromise;
        if (operation === "encrypt") {
          counter += 1n;
          if (counter > MASK_64) throw new Error("media frame counter exhausted");
          counterBytes = encodeCounter(counter);
          iv = makeIv(noncePrefix, counterBytes);
          clear = new Uint8Array(frame.data);
          sealed = new Uint8Array(await crypto.subtle.encrypt({name: "AES-GCM", iv: iv, additionalData: additionalData, tagLength: 128}, key, clear));
          packet = new Uint8Array(8 + sealed.length);
          packet.set(counterBytes, 0);
          packet.set(sealed, 8);
          frame.data = packet.buffer;
          controller.enqueue(frame);
          return;
        }

        packet = new Uint8Array(frame.data);
        if (packet.length < 24) return;
        counterBytes = packet.slice(0, 8);
        incomingCounter = decodeCounter(counterBytes);
        iv = makeIv(noncePrefix, counterBytes);
        clear = new Uint8Array(await crypto.subtle.decrypt({name: "AES-GCM", iv: iv, additionalData: additionalData, tagLength: 128}, key, packet.slice(8)));
        if (!acceptCounter(incomingCounter)) return;
        frame.data = clear.buffer;
        controller.enqueue(frame);
      } catch (error) {
        report(error);
      }
    }
  });

  transformer.readable.pipeThrough(transform).pipeTo(transformer.writable).catch(report);
};
