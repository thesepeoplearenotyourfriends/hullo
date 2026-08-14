(function () {
  "use strict";
  var state = document.getElementById("state"), chatState = document.getElementById("chat-state"), statusDot = document.getElementById("status-dot");
  var stages = document.getElementById("stages"), session = document.getElementById("session"), landing = document.getElementById("landing");
  var startup = document.getElementById("startup"), messages = document.getElementById("messages"), loopback = document.getElementById("loopback");
  var composer = document.getElementById("composer"), input = document.getElementById("payload"), empty = document.getElementById("empty");
  var labels = {
    invitation: "Invitation accepted", active: "Trystero admission complete — peer ACTIVE", replay: "Invitation already active", left: "Peer left", sent: "Application bytes sent",
    received: "Application bytes received", error: "Connection stopped"
  };
  function secret() { var b = new Uint8Array(32); crypto.getRandomValues(b); return BluephonePeerCore.toBase64(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
  function shortPeer(value) { return value && value.length > 9 ? value.slice(0,4) + "…" + value.slice(-4) : value || ""; }
  function row(text, status) { var item = document.createElement("li"); item.textContent = text; item.className = status || "done"; stages.appendChild(item); while (stages.children.length > 14) stages.removeChild(stages.firstChild); }
  function bubble(text, mine) { var item = document.createElement("p"); if (empty) { empty.remove(); empty = null; } item.className = "bubble " + (mine ? "mine" : "theirs"); item.textContent = text; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }
  function connection(label, kind) { chatState.textContent = label; statusDot.className = "status-dot " + kind; }
  function log(type, detail) {
    detail = detail || {};
    var label = labels[type] || type;
    if (type === "relay") label = "querying [" + (detail.domain || "relay") + "] — " + (detail.state || "unknown");
    if (type === "active" && detail.peer) label += " [" + shortPeer(detail.peer) + "]";
    if (type === "error") label += " at " + (detail.stage || "unknown stage") + ": " + (detail.message || "bounded error");
    state.textContent = label;
    row(label, type === "error" || type === "relay" && (detail.state === "failed" || detail.state === "closed") ? "failed" : type === "relay" && detail.state === "connecting" ? "working" : "done");
    if (type === "received" && detail.data) bubble(new TextDecoder().decode(BluephonePeerCore.fromBase64(detail.data)), false);
    if (type === "active") { connection("Connected", "active"); startup.open = false; startup.classList.add("retired"); composer.hidden = false; input.focus(); }
    if (type === "left") { connection("Disconnected", "disconnected"); composer.hidden = true; }
    if (type === "error") { connection("Couldn’t connect", "disconnected"); composer.hidden = true; startup.open = true; }
  }
  function testConfig(enabled) { return enabled ? {_test_only_mdnsHostFallbackToLoopback: true, rtcConfig: {iceServers: []}} : undefined; }
  function start(value, useLoopback) {
    landing.hidden = true; session.hidden = false; connection("Connecting…", "connecting");
    loopback.checked = Boolean(useLoopback);
    BluephonePeerCore.join(value, {event: log}, testConfig(useLoopback)).catch(function (error) { log("error", {stage: "join", message: String(error.message || error).slice(0,160)}); });
  }
  document.getElementById("create").onclick = function () {
    var value = secret(), flag = loopback.checked ? "&loopback=1" : "", url = location.href.split("#")[0] + "#invite=" + value + flag;
    location.hash = "invite=" + value + flag;
    var invite = document.getElementById("invite"); invite.className = "invitation ready"; invite.textContent = "";
    var title = document.createElement("strong"); title.textContent = "Invitation link"; invite.appendChild(title);
    var link = document.createElement("a"); link.href = url; link.textContent = url; invite.appendChild(link);
    var copy = document.createElement("button"), copyResult = document.createElement("span"); copy.type = "button"; copy.className = "secondary copy-link"; copy.textContent = "Copy link"; copyResult.className = "copy-result"; copyResult.setAttribute("aria-live", "polite");
    copy.onclick = function () { if (!navigator.clipboard || !navigator.clipboard.writeText) { copyResult.textContent = "Select and copy the link above."; return; } navigator.clipboard.writeText(url).then(function () { copyResult.textContent = "Copied."; }, function () { copyResult.textContent = "Couldn’t copy. Select and copy the link above."; }); };
    invite.appendChild(copy); invite.appendChild(copyResult);
    var gateway = document.createElement("a"); gateway.href = "bluephone-lab://peer#invite=" + value + flag; gateway.className = "gateway"; gateway.textContent = "Open Bluephone Lab Gateway";
    invite.appendChild(document.createElement("br")); invite.appendChild(gateway);
    startup.insertBefore(invite, stages);
    start(value, loopback.checked);
  };
  composer.onsubmit = function (event) {
    event.preventDefault(); var value = input.value; if (!value.trim()) return;
    BluephonePeerCore.send(BluephonePeerCore.toBase64(new TextEncoder().encode(value))); bubble(value, true); input.value = ""; input.style.height = ""; input.focus();
  };
  input.onkeydown = function (event) { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); composer.requestSubmit(); } };
  input.oninput = function () { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 131) + "px"; };
  var about = document.getElementById("about-dialog");
  document.getElementById("about").onclick = function () { about.showModal(); };
  document.getElementById("close-about").onclick = function () { about.close(); };
  about.onclick = function (event) { if (event.target === about) about.close(); };
  var consoleButton = document.getElementById("console");
  if (window.eruda) { consoleButton.hidden = false; consoleButton.onclick = function () { window.eruda.init(); consoleButton.hidden = true; }; }
  var params = new URLSearchParams(location.hash.slice(1)), invitation = params.get("invite");
  if (invitation && /^[A-Za-z0-9_-]{43,}$/.test(invitation)) start(invitation, params.get("loopback") === "1");
}());
