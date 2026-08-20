(function () {
  "use strict";

  var state = document.getElementById("state"), chatState = document.getElementById("chat-state"), statusDot = document.getElementById("status-dot");
  var stages = document.getElementById("stages"), session = document.getElementById("session"), landing = document.getElementById("landing");
  var startup = document.getElementById("startup"), messages = document.getElementById("messages"), loopback = document.getElementById("loopback");
  var composer = document.getElementById("composer"), input = document.getElementById("payload"), empty = document.getElementById("empty");
  var sessionActions = document.getElementById("session-actions"), voiceCall = document.getElementById("voice-call"), attach = document.getElementById("attach");
  var fileInput = document.getElementById("file-input"), callPanel = document.getElementById("call-panel"), callStatus = document.getElementById("call-status");
  var callRate = document.getElementById("call-rate"), hangup = document.getElementById("hangup"), resumeAudio = document.getElementById("resume-audio");
  var remoteAudio = document.getElementById("remote-audio"), incomingCall = document.getElementById("incoming-call");
  var acceptCall = document.getElementById("accept-call"), declineCall = document.getElementById("decline-call");
  var protectedEpisode = null, protectedPromise = null, protectedReady = false, pendingPeer = "", labMode = false;
  var currentCall = null, mediaWorker = null, statsTimer = null, lastStats = null;
  var incomingFiles = Object.create(null), objectUrls = [];
  var MAX_FILE_BYTES = 16 * 1024 * 1024, FILE_CHUNK_BYTES = 48 * 1024;
  var labels = {
    invitation: "Invitation accepted", active: "Trystero admission complete — peer ACTIVE", replay: "Invitation already active", left: "Peer left", sent: "Application bytes sent",
    received: "Application bytes received", error: "Connection stopped"
  };

  function secretBytes(length) { var b = new Uint8Array(length); crypto.getRandomValues(b); return b; }
  function toUrl64(bytes) { return BluephonePeerCore.toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
  function fromUrl64(value) { value = value.replace(/-/g, "+").replace(/_/g, "/"); while (value.length % 4) value += "="; return BluephonePeerCore.fromBase64(value); }
  function secret() { return toUrl64(secretBytes(32)); }
  function shortPeer(value) { return value && value.length > 9 ? value.slice(0, 4) + "…" + value.slice(-4) : value || ""; }
  function row(text, status) { var item = document.createElement("li"); item.textContent = text; item.className = status || "done"; stages.appendChild(item); while (stages.children.length > 14) stages.removeChild(stages.firstChild); }
  function clearEmpty() { if (empty) { empty.remove(); empty = null; } }
  function bubble(text, mine) { var item = document.createElement("p"); clearEmpty(); item.className = "bubble " + (mine ? "mine" : "theirs"); item.textContent = text; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; return item; }
  function transferBubble(text, mine) { var item = document.createElement("div"); clearEmpty(); item.className = "bubble attachment " + (mine ? "mine" : "theirs"); item.textContent = text; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; return item; }
  function formatBytes(value) { if (value < 1024) return value + " B"; if (value < 1024 * 1024) return (value / 1024).toFixed(value < 10 * 1024 ? 1 : 0) + " KB"; return (value / (1024 * 1024)).toFixed(1) + " MB"; }
  function attachmentBubble(name, mime, size, url, mine, existing) {
    var item = existing || transferBubble("", mine), image, link, meta;
    item.textContent = "";
    if (mime && mime.indexOf("image/") === 0) {
      image = document.createElement("img"); image.className = "attachment-preview"; image.src = url; image.alt = name; item.appendChild(image);
    }
    link = document.createElement("a"); link.href = url; link.download = name || "Hullo file"; link.textContent = "📎 " + (name || "File"); item.appendChild(link);
    meta = document.createElement("small"); meta.textContent = formatBytes(size); item.appendChild(meta);
    messages.scrollTop = messages.scrollHeight;
    return item;
  }
  function connection(label, kind) { chatState.textContent = label; statusDot.className = "status-dot " + kind; }
  function log(type, detail) {
    detail = detail || {};
    var label = labels[type] || type;
    if (type === "relay") label = "querying [" + (detail.domain || "relay") + "] — " + (detail.state || "unknown");
    if (type === "active" && detail.peer) label += " [" + shortPeer(detail.peer) + "]";
    if (type === "error") label += " at " + (detail.stage || "unknown stage") + ": " + (detail.message || "bounded error");
    state.textContent = label;
    row(label, type === "error" || type === "relay" && (detail.state === "failed" || detail.state === "closed") ? "failed" : type === "relay" && detail.state === "connecting" ? "working" : "done");
  }

  function testConfig(enabled) { return enabled ? {_test_only_mdnsHostFallbackToLoopback: true, rtcConfig: {iceServers: []}} : undefined; }
  function mediaCryptoSupported() { return typeof window.RTCRtpScriptTransform === "function" && typeof window.Worker === "function"; }

  function setReady() {
    if (protectedReady) return;
    protectedReady = true;
    connection("Connected", "active");
    startup.open = false;
    startup.classList.add("retired");
    composer.hidden = false;
    sessionActions.hidden = false;
    voiceCall.disabled = !mediaCryptoSupported();
    voiceCall.title = mediaCryptoSupported() ? "Voice call" : "This browser cannot apply Hullo media encryption";
    input.focus();
  }

  async function sendPacket(packetPromise) {
    var packet = await packetPromise;
    return BluephonePeerCore.send(BluephonePeerCore.toBase64(packet), pendingPeer);
  }

  function sendControl(value) {
    if (!protectedReady || !protectedEpisode) return Promise.reject(new Error("protected episode is not ready"));
    return sendPacket(protectedEpisode.encryptControl(value));
  }

  async function handleProtectedReceived(detail) {
    var packet = BluephonePeerCore.fromBase64(detail.data), decoded, control;
    if (!protectedEpisode && protectedPromise) protectedEpisode = await protectedPromise;
    if (!protectedEpisode) throw new Error("invitation has no protected episode key");

    if (packet[0] === 1 && typeof protectedEpisode.acceptHello === "function") {
      await protectedEpisode.acceptHello(packet);
      await sendPacket(protectedEpisode.ready());
      return;
    }

    decoded = await protectedEpisode.decrypt(packet);
    if (decoded.type === 2 && decoded.text === "ready") {
      setReady();
      return;
    }
    if (!protectedReady) throw new Error("protected episode data arrived before ready");
    if (decoded.type === 3) {
      bubble(decoded.text, false);
      return;
    }
    if (decoded.type === 4) {
      control = JSON.parse(decoded.text);
      await handleControl(control);
      return;
    }
    if (decoded.type === 5) {
      await handleFileChunk(decoded.bytes);
      return;
    }
    throw new Error("unexpected protected episode packet");
  }

  function coreEvent(type, detail) {
    detail = detail || {};
    log(type, detail);
    if (type === "received" && detail.data) {
      handleProtectedReceived(detail).catch(function (error) { log("error", {stage: "security", message: String(error.message || error).slice(0, 160)}); });
      return;
    }
    if (type === "active") {
      pendingPeer = detail.peer || "";
      connection("Securing…", "connecting");
      if (!protectedPromise) {
        log("error", {stage: "security", message: "Handset public key missing from invitation"});
        return;
      }
      protectedPromise.then(function (value) {
        protectedEpisode = value;
        return BluephonePeerCore.send(BluephonePeerCore.toBase64(value.hello()), pendingPeer);
      }).catch(function () { log("error", {stage: "security", message: "invalid protected episode key"}); });
      return;
    }
    if (type === "track") {
      handlePeerTrack(detail).catch(function (error) { failCall("Couldn’t decrypt call media", error); });
      return;
    }
    if (type === "left") {
      connection("Disconnected", "disconnected"); composer.hidden = true; sessionActions.hidden = true; cleanupCall();
      return;
    }
    if (type === "error") {
      connection("Couldn’t connect", "disconnected"); composer.hidden = true; sessionActions.hidden = true; startup.open = true; cleanupCall();
    }
  }

  function start(value, useLoopback, episode, handsetKey, useLab) {
    landing.hidden = true;
    session.hidden = false;
    connection("Connecting…", "connecting");
    loopback.checked = Boolean(useLoopback);
    labMode = Boolean(useLab);
    protectedReady = false;
    composer.hidden = true;
    sessionActions.hidden = true;
    protectedEpisode = null;
    cleanupCall();
    protectedPromise = labMode ? HulloEpisodeCrypto.createLab(value) : episode && handsetKey ? HulloEpisodeCrypto.create(episode, handsetKey) : null;
    BluephonePeerCore.join(value, {event: coreEvent}, testConfig(useLoopback)).catch(function (error) { log("error", {stage: "join", message: String(error.message || error).slice(0, 160)}); });
  }

  function renderInvitation(value, useLoopback, useLab) {
    var flag = useLoopback ? "&loopback=1" : "";
    var labFlag = useLab ? "&lab=1" : "";
    var url = location.href.split("#")[0] + "#invite=" + value + flag + labFlag;
    var invite = document.getElementById("invite"), title, link, copy, copyResult, gateway;
    location.hash = "invite=" + value + flag + labFlag;
    invite.className = "invitation ready"; invite.textContent = "";
    title = document.createElement("strong"); title.textContent = useLab ? "Protected browser test link" : "Invitation link"; invite.appendChild(title);
    link = document.createElement("a"); link.href = url; link.textContent = url; invite.appendChild(link);
    copy = document.createElement("button"); copyResult = document.createElement("span"); copy.type = "button"; copy.className = "secondary copy-link"; copy.textContent = "Copy link"; copyResult.className = "copy-result"; copyResult.setAttribute("aria-live", "polite");
    copy.onclick = function () { if (!navigator.clipboard || !navigator.clipboard.writeText) { copyResult.textContent = "Select and copy the link above."; return; } navigator.clipboard.writeText(url).then(function () { copyResult.textContent = "Copied."; }, function () { copyResult.textContent = "Couldn’t copy. Select and copy the link above."; }); };
    invite.appendChild(copy); invite.appendChild(copyResult);
    if (!useLab) {
      gateway = document.createElement("a"); gateway.href = "bluephone-lab://peer#invite=" + value + flag; gateway.className = "gateway"; gateway.textContent = "Open Bluephone Lab Gateway";
      invite.appendChild(document.createElement("br")); invite.appendChild(gateway);
    }
    return url;
  }

  document.getElementById("create").onclick = function () {
    var value = secret();
    renderInvitation(value, loopback.checked, false);
    start(value, loopback.checked, "", "", false);
  };

  document.getElementById("create-lab").onclick = function () {
    var value = secret();
    renderInvitation(value, loopback.checked, true);
    start(value, loopback.checked, "", "", true);
  };

  composer.onsubmit = function (event) {
    event.preventDefault(); var value = input.value;
    if (!value.trim() || !protectedReady || !protectedEpisode) return;
    sendPacket(protectedEpisode.encrypt(value)).then(function () { bubble(value, true); }, function () { log("error", {stage: "security", message: "encryption failed"}); });
    input.value = ""; input.style.height = ""; input.focus();
  };
  input.onkeydown = function (event) { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); composer.requestSubmit(); } };
  input.oninput = function () { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 131) + "px"; };

  function callId() { return toUrl64(secretBytes(16)); }
  function validCallId(value) { return typeof value === "string" && /^[A-Za-z0-9_-]{16,96}$/.test(value); }
  function showCallPanel(label) { callPanel.hidden = false; callStatus.textContent = label; callRate.textContent = ""; resumeAudio.hidden = true; }
  function scheduleCallTimeout(call) {
    call.timer = setTimeout(function () {
      if (currentCall !== call || call.state !== "ringing") return;
      sendControl({type: call.direction === "outgoing" ? "call-cancel" : "call-decline", callId: call.id, reason: "timeout"}).catch(function () {});
      cleanupCall();
    }, 45000);
  }
  function clearCallTimer(call) { if (call && call.timer) { clearTimeout(call.timer); call.timer = null; } }

  async function startOutgoingCall() {
    var call;
    if (!protectedReady || currentCall) return;
    if (!mediaCryptoSupported()) { bubble("This browser can’t apply Hullo’s call-media encryption.", true); return; }
    call = {id: callId(), direction: "outgoing", state: "ringing", media: "audio", timer: null, mediaKeys: null, localStream: null, localTrack: null};
    currentCall = call;
    showCallPanel("Calling…");
    scheduleCallTimeout(call);
    try {
      await sendControl({type: "call-offer", callId: call.id, media: ["audio"]});
    } catch (error) {
      failCall("Couldn’t place call", error);
    }
  }

  function showIncoming(call) {
    currentCall = call;
    scheduleCallTimeout(call);
    document.getElementById("incoming-call-label").textContent = "Incoming voice call";
    if (!incomingCall.open) incomingCall.showModal();
  }

  async function acceptIncomingCall() {
    var call = currentCall;
    if (!call || call.direction !== "incoming" || call.state !== "ringing") return;
    clearCallTimer(call);
    incomingCall.close();
    call.state = "connecting";
    showCallPanel("Connecting…");
    try {
      await sendControl({type: "call-accept", callId: call.id, media: ["audio"]});
      await beginMedia(call);
    } catch (error) {
      failCall("Couldn’t start call", error);
    }
  }

  async function declineIncomingCall() {
    var call = currentCall;
    if (!call || call.direction !== "incoming" || call.state !== "ringing") return;
    clearCallTimer(call);
    incomingCall.close();
    await sendControl({type: "call-decline", callId: call.id}).catch(function () {});
    cleanupCall();
  }

  async function handleCallOffer(control) {
    var incoming;
    if (!validCallId(control.callId) || !Array.isArray(control.media) || control.media.indexOf("audio") < 0) return;
    if (!mediaCryptoSupported()) {
      await sendControl({type: "call-decline", callId: control.callId, reason: "media-encryption-unsupported"}).catch(function () {});
      return;
    }
    if (currentCall && currentCall.id === control.callId) return;
    if (currentCall && currentCall.state === "ringing" && currentCall.direction === "outgoing") {
      if (control.callId < currentCall.id) {
        await sendControl({type: "call-cancel", callId: currentCall.id, reason: "crossed-call"}).catch(function () {});
        cleanupCall();
      } else {
        await sendControl({type: "call-decline", callId: control.callId, reason: "crossed-call"}).catch(function () {});
        return;
      }
    } else if (currentCall) {
      await sendControl({type: "call-decline", callId: control.callId, reason: "busy"}).catch(function () {});
      return;
    }
    incoming = {id: control.callId, direction: "incoming", state: "ringing", media: "audio", timer: null, mediaKeys: null, localStream: null, localTrack: null};
    showIncoming(incoming);
  }

  async function handleCallControl(control) {
    var call = currentCall;
    if (control.type === "call-offer") { await handleCallOffer(control); return; }
    if (!call || !validCallId(control.callId) || control.callId !== call.id) return;
    if (control.type === "call-accept" && call.direction === "outgoing" && call.state === "ringing") {
      clearCallTimer(call); call.state = "connecting"; showCallPanel("Connecting…"); await beginMedia(call); return;
    }
    if (control.type === "call-decline" && call.direction === "outgoing" && call.state === "ringing") {
      clearCallTimer(call); showCallPanel("Call declined"); setTimeout(function () { if (currentCall === call) cleanupCall(); }, 900); return;
    }
    if (control.type === "call-cancel" && call.direction === "incoming" && call.state === "ringing") {
      clearCallTimer(call); if (incomingCall.open) incomingCall.close(); cleanupCall(); return;
    }
    if (control.type === "call-hangup" || control.type === "call-error") {
      if (incomingCall.open) incomingCall.close(); cleanupCall();
    }
  }

  function getMediaWorker() {
    if (mediaWorker) return mediaWorker;
    mediaWorker = new Worker("media-crypto-worker.js");
    mediaWorker.onmessage = function (event) {
      var detail = event.data || {};
      if (detail.type !== "media-error" || !currentCall || detail.callId !== currentCall.id) return;
      failCall("Call-media encryption stopped", new Error(detail.message || "media transform failed"));
    };
    return mediaWorker;
  }

  function makeMediaTransform(operation, call, material) {
    return new RTCRtpScriptTransform(getMediaWorker(), {
      operation: operation,
      callId: call.id,
      kind: "audio",
      key: material.key,
      noncePrefix: material.noncePrefix,
      aad: call.mediaKeys.aad
    });
  }

  async function ensureMediaKeys(call) {
    if (!call.mediaKeys) call.mediaKeys = await protectedEpisode.deriveMedia(call.id, "audio");
    return call.mediaKeys;
  }

  async function beginMedia(call) {
    var stream, track, sender;
    if (currentCall !== call || call.mediaStarted) return;
    call.mediaStarted = true;
    await ensureMediaKeys(call);
    stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}, video: false});
    if (currentCall !== call) { stream.getTracks().forEach(function (item) { item.stop(); }); return; }
    track = stream.getAudioTracks()[0];
    if (!track) throw new Error("microphone did not provide an audio track");
    call.localStream = stream;
    call.localTrack = track;
    sender = await BluephonePeerCore.addTrack(track, stream, pendingPeer, {kind: "bluephone-call", callId: call.id, media: "audio"});
    if (!("transform" in sender)) throw new Error("browser does not expose encoded sender transforms");
    sender.transform = makeMediaTransform("encrypt", call, call.mediaKeys.outbound);
    showCallPanel("Connecting…");
  }

  async function handlePeerTrack(detail) {
    var call = currentCall, meta = detail.metadata || {}, pc, receiver;
    if (!call || meta.kind !== "bluephone-call" || meta.callId !== call.id || meta.media !== "audio") return;
    await ensureMediaKeys(call);
    pc = BluephonePeerCore.getPeerConnection(detail.peer || pendingPeer);
    if (!pc) throw new Error("peer connection disappeared during call");
    receiver = pc.getReceivers().find(function (item) { return item.track === detail.track; });
    if (!receiver || !("transform" in receiver)) throw new Error("browser does not expose encoded receiver transforms");
    receiver.transform = makeMediaTransform("decrypt", call, call.mediaKeys.inbound);
    remoteAudio.srcObject = detail.stream;
    call.remoteTrack = detail.track;
    call.state = "active";
    showCallPanel("Voice call");
    startStats();
    remoteAudio.play().then(function () { resumeAudio.hidden = true; }, function () { resumeAudio.hidden = false; callStatus.textContent = "Voice call — tap to hear"; });
  }

  function stopStats() { if (statsTimer) clearInterval(statsTimer); statsTimer = null; lastStats = null; callRate.textContent = ""; }
  async function updateStats() {
    var pc, report, pair = null, now = performance.now(), tx, rx, seconds;
    if (!currentCall) return;
    pc = BluephonePeerCore.getPeerConnection(pendingPeer);
    if (!pc) return;
    try { report = await pc.getStats(); } catch (_) { return; }
    report.forEach(function (item) { if (item.type === "candidate-pair" && item.state === "succeeded" && item.nominated) pair = item; });
    if (!pair || typeof pair.bytesSent !== "number" || typeof pair.bytesReceived !== "number") return;
    if (lastStats) {
      seconds = (now - lastStats.time) / 1000;
      if (seconds > 0) {
        tx = Math.max(0, pair.bytesSent - lastStats.sent) / seconds / 1024;
        rx = Math.max(0, pair.bytesReceived - lastStats.received) / seconds / 1024;
        callRate.textContent = "RTC ↑ " + tx.toFixed(1) + " KB/s · ↓ " + rx.toFixed(1) + " KB/s";
      }
    }
    lastStats = {time: now, sent: pair.bytesSent, received: pair.bytesReceived};
  }
  function startStats() { stopStats(); updateStats(); statsTimer = setInterval(updateStats, 2000); }

  function cleanupCall() {
    var call = currentCall;
    clearCallTimer(call);
    stopStats();
    if (incomingCall.open) incomingCall.close();
    if (call && call.localTrack) BluephonePeerCore.removeTrack(call.localTrack, pendingPeer);
    if (call && call.localStream) call.localStream.getTracks().forEach(function (track) { track.stop(); });
    remoteAudio.srcObject = null;
    callPanel.hidden = true;
    resumeAudio.hidden = true;
    currentCall = null;
  }

  function failCall(label, error) {
    var call = currentCall;
    log("error", {stage: "call", message: String(error && error.message || error || label).slice(0, 160)});
    if (call && protectedReady) sendControl({type: "call-error", callId: call.id, reason: label}).catch(function () {});
    cleanupCall();
  }

  async function endCall() {
    var call = currentCall;
    if (!call) return;
    await sendControl({type: call.state === "ringing" && call.direction === "outgoing" ? "call-cancel" : "call-hangup", callId: call.id}).catch(function () {});
    cleanupCall();
  }

  voiceCall.onclick = startOutgoingCall;
  acceptCall.onclick = acceptIncomingCall;
  declineCall.onclick = declineIncomingCall;
  hangup.onclick = endCall;
  resumeAudio.onclick = function () { remoteAudio.play().then(function () { resumeAudio.hidden = true; callStatus.textContent = "Voice call"; }, function () {}); };

  function validFileControl(control) {
    return typeof control.id === "string" && /^[A-Za-z0-9_-]{22}$/.test(control.id) && typeof control.name === "string" && control.name.length > 0 && control.name.length <= 180 &&
      typeof control.mime === "string" && control.mime.length <= 120 && Number.isInteger(control.size) && control.size >= 0 && control.size <= MAX_FILE_BYTES &&
      Number.isInteger(control.chunks) && control.chunks >= 1 && control.chunks <= Math.ceil(MAX_FILE_BYTES / FILE_CHUNK_BYTES) + 1 && typeof control.sha256 === "string" && /^[A-Za-z0-9_-]{43}$/.test(control.sha256);
  }

  async function handleFileOffer(control) {
    if (!validFileControl(control) || incomingFiles[control.id]) return;
    incomingFiles[control.id] = {
      id: control.id, name: control.name, mime: control.mime || "application/octet-stream", size: control.size, chunks: control.chunks, sha256: control.sha256,
      parts: new Array(control.chunks), received: 0, bytes: 0, bubble: transferBubble("Receiving 📎 " + control.name + "…", false)
    };
  }

  function encodeFileChunk(id, index, bytes) {
    var idBytes = fromUrl64(id), out = new Uint8Array(20 + bytes.length), view = new DataView(out.buffer);
    if (idBytes.length !== 16) throw new Error("invalid file id");
    out.set(idBytes, 0); view.setUint32(16, index, false); out.set(bytes, 20); return out;
  }

  async function handleFileChunk(bytes) {
    var id, index, transfer, part, full, offset, digest, url;
    if (!(bytes instanceof Uint8Array) || bytes.length < 20) throw new Error("invalid protected file chunk");
    id = toUrl64(bytes.slice(0, 16));
    index = new DataView(bytes.buffer, bytes.byteOffset + 16, 4).getUint32(0, false);
    transfer = incomingFiles[id];
    if (!transfer || index >= transfer.chunks || transfer.parts[index]) return;
    part = bytes.slice(20);
    if (transfer.bytes + part.length > transfer.size) throw new Error("file transfer exceeded declared size");
    transfer.parts[index] = part; transfer.received += 1; transfer.bytes += part.length;
    transfer.bubble.textContent = "Receiving 📎 " + transfer.name + " — " + Math.floor(transfer.received / transfer.chunks * 100) + "%";
    if (transfer.received !== transfer.chunks) return;
    if (transfer.bytes !== transfer.size) throw new Error("file transfer size mismatch");
    full = new Uint8Array(transfer.size); offset = 0;
    transfer.parts.forEach(function (chunk) { full.set(chunk, offset); offset += chunk.length; });
    digest = toUrl64(new Uint8Array(await crypto.subtle.digest("SHA-256", full)));
    if (digest !== transfer.sha256) { transfer.bubble.textContent = "File authentication failed: " + transfer.name; delete incomingFiles[id]; return; }
    url = URL.createObjectURL(new Blob([full], {type: transfer.mime})); objectUrls.push(url);
    attachmentBubble(transfer.name, transfer.mime, transfer.size, url, false, transfer.bubble);
    delete incomingFiles[id];
  }

  async function sendFile(file) {
    var buffer, bytes, id, digest, chunks, item, i, startAt, part, packet, url;
    if (!protectedReady || !file) return;
    if (file.size > MAX_FILE_BYTES) { bubble("That file is larger than Hullo’s 16 MB transfer limit.", true); return; }
    attach.disabled = true;
    try {
      buffer = await file.arrayBuffer(); bytes = new Uint8Array(buffer); id = toUrl64(secretBytes(16));
      digest = toUrl64(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
      chunks = Math.max(1, Math.ceil(bytes.length / FILE_CHUNK_BYTES));
      item = transferBubble("Sending 📎 " + (file.name || "File") + "…", true);
      await sendControl({type: "file-offer", id: id, name: (file.name || "File").slice(0, 180), mime: (file.type || "application/octet-stream").slice(0, 120), size: bytes.length, chunks: chunks, sha256: digest});
      for (i = 0; i < chunks; i += 1) {
        startAt = i * FILE_CHUNK_BYTES; part = bytes.slice(startAt, Math.min(bytes.length, startAt + FILE_CHUNK_BYTES));
        packet = await protectedEpisode.encryptBinary(encodeFileChunk(id, i, part));
        await BluephonePeerCore.send(BluephonePeerCore.toBase64(packet), pendingPeer);
        item.textContent = "Sending 📎 " + (file.name || "File") + " — " + Math.floor((i + 1) / chunks * 100) + "%";
      }
      url = URL.createObjectURL(file); objectUrls.push(url);
      attachmentBubble(file.name || "File", file.type || "application/octet-stream", file.size, url, true, item);
    } catch (error) {
      log("error", {stage: "file", message: String(error.message || error).slice(0, 160)});
    } finally {
      attach.disabled = false; fileInput.value = "";
    }
  }

  async function handleControl(control) {
    if (!control || typeof control !== "object" || Array.isArray(control) || typeof control.type !== "string") return;
    if (control.type.indexOf("call-") === 0) { await handleCallControl(control); return; }
    if (control.type === "file-offer") await handleFileOffer(control);
  }

  attach.onclick = function () { if (protectedReady) fileInput.click(); };
  fileInput.onchange = function () { if (fileInput.files && fileInput.files[0]) sendFile(fileInput.files[0]); };

  var about = document.getElementById("about-dialog");
  document.getElementById("about").onclick = function () { about.showModal(); };
  document.getElementById("close-about").onclick = function () { about.close(); };
  about.onclick = function (event) { if (event.target === about) about.close(); };
  var consoleButton = document.getElementById("console");
  if (window.eruda) { consoleButton.hidden = false; consoleButton.onclick = function () { window.eruda.init(); consoleButton.hidden = true; }; }

  window.addEventListener("beforeunload", function () {
    cleanupCall();
    if (mediaWorker) mediaWorker.terminate();
    objectUrls.forEach(function (url) { URL.revokeObjectURL(url); });
  });

  var params = new URLSearchParams(location.hash.slice(1)), invitation = params.get("invite");
  if (invitation && /^[A-Za-z0-9_-]{43,}$/.test(invitation)) start(invitation, params.get("loopback") === "1", params.get("episode"), params.get("handset"), params.get("lab") === "1");
}());
