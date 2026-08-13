import {joinRoom} from "./vendor/trystero/nostr/index.mjs";

(function (root) {
  "use strict";
  var room = null;
  var sendOpaque = null;
  var handlers = null;

  function emit(type, detail) {
    if (handlers && handlers.event) handlers.event(type, detail || {});
  }

  function join(invitation, host, webRtcConfig) {
    leave();
    handlers = host;
    if (!/^[A-Za-z0-9_-]{43,}$/.test(invitation)) throw new Error("invitation must contain at least 256 bits of URL-safe entropy");
    emit("pending", {});
    var config = Object.assign({}, webRtcConfig || {}, {appId: "bluephone-peer-cp1"});
    room = joinRoom(config, invitation, {
      onJoinError: function (detail) { emit("error", {message: String(detail.error || "join failed").slice(0, 160)}); }
    });
    room.onPeerJoin = function (peerId) { emit("active", {peer: peerId}); };
    room.onPeerLeave = function (peerId) { emit("left", {peer: peerId}); };
    var action = room.makeAction("bp-opaque-v1");
    sendOpaque = action.send;
    action.onMessage = function (bytes, context) {
      var exact = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      emit("received", {peer: context.peerId, bytes: exact.byteLength, data: toBase64(exact)});
    };
    emit("joined", {});
  }

  function leave() {
    if (room) room.leave().catch(function () {});
    room = null;
    sendOpaque = null;
  }

  function send(base64, peerId) {
    if (!sendOpaque) throw new Error("room is not joined");
    var bytes = fromBase64(base64);
    sendOpaque(bytes, {target: peerId || null}).catch(function (error) {
      emit("error", {message: String(error && error.message || error).slice(0, 160)});
    });
    emit("sent", {bytes: bytes.byteLength});
  }

  function fromBase64(value) {
    var raw = atob(value), out = new Uint8Array(raw.length), i;
    for (i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  }

  function toBase64(bytes) {
    var raw = "", i;
    for (i = 0; i < bytes.length; i += 1) raw += String.fromCharCode(bytes[i]);
    return btoa(raw);
  }

  root.BluephonePeerCore = {join: join, leave: leave, send: send, fromBase64: fromBase64, toBase64: toBase64};
}(window));
