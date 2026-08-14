(function () {
  "use strict";
  var state = document.getElementById("state"), stages = document.getElementById("stages"), session = document.getElementById("session");
  var startup = document.getElementById("startup"), messages = document.getElementById("messages"), loopback = document.getElementById("loopback");
  var labels = {
    invitation: "invitation accepted", active: "Trystero admission complete — peer ACTIVE", replay: "invitation already active", left: "peer left", sent: "application bytes sent",
    received: "application bytes received", error: "connection stopped"
  };
  function secret() { var b = new Uint8Array(32); crypto.getRandomValues(b); return BluephonePeerCore.toBase64(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,""); }
  function shortPeer(value) { return value && value.length > 9 ? value.slice(0,4) + "…" + value.slice(-4) : value || ""; }
  function row(text, status) { var item = document.createElement("li"); item.textContent = text; item.className = status || "done"; stages.appendChild(item); while (stages.children.length > 14) stages.removeChild(stages.firstChild); }
  function bubble(text, mine) { var item = document.createElement("p"); item.className = "bubble " + (mine ? "mine" : "theirs"); item.textContent = text; messages.appendChild(item); messages.scrollTop = messages.scrollHeight; }
  function log(type, detail) {
    detail = detail || {};
    var label = labels[type] || type;
    if (type === "relay") label = "querying [" + (detail.domain || "relay") + "] — " + (detail.state || "unknown");
    if (type === "active" && detail.peer) label += " [" + shortPeer(detail.peer) + "]";
    if (type === "error") label += " at " + (detail.stage || "unknown stage") + ": " + (detail.message || "bounded error");
    state.textContent = label;
    row(label, type === "error" || type === "relay" && (detail.state === "failed" || detail.state === "closed") ? "failed" : type === "relay" && detail.state === "connecting" ? "working" : "done");
    if (type === "received" && detail.data) bubble(new TextDecoder().decode(BluephonePeerCore.fromBase64(detail.data)), false);
    if (type === "active") { startup.open = false; startup.classList.add("retired"); document.getElementById("payload").focus(); }
  }
  function testConfig(enabled) { return enabled ? {_test_only_mdnsHostFallbackToLoopback: true, rtcConfig: {iceServers: []}} : undefined; }
  function start(value, useLoopback) {
    session.hidden = false;
    loopback.checked = Boolean(useLoopback);
    loopback.disabled = true;
    BluephonePeerCore.join(value, {event: log}, testConfig(useLoopback)).catch(function (error) { log("error", {stage: "join", message: String(error.message || error).slice(0,160)}); });
  }
  document.getElementById("create").onclick = function () {
    var value = secret(), flag = loopback.checked ? "&loopback=1" : "", url = location.href.split("#")[0] + "#invite=" + value + flag;
    location.hash = "invite=" + value + flag;
    document.getElementById("invite").textContent = "Invitation: " + url;
    var link = document.createElement("a"); link.href = "bluephone-lab://peer#invite=" + value + flag; link.textContent = "Open Bluephone Lab Gateway";
    document.getElementById("invite").appendChild(document.createElement("br")); document.getElementById("invite").appendChild(link);
    start(value, loopback.checked);
  };
  document.getElementById("composer").onsubmit = function (event) {
    event.preventDefault(); var input = document.getElementById("payload"), value = input.value; if (!value) return;
    BluephonePeerCore.send(BluephonePeerCore.toBase64(new TextEncoder().encode(value))); bubble(value, true); input.value = "";
  };
  var params = new URLSearchParams(location.hash.slice(1)), invitation = params.get("invite");
  if (invitation && /^[A-Za-z0-9_-]{43,}$/.test(invitation)) start(invitation, params.get("loopback") === "1");
}());
