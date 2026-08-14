(function () {
  "use strict";
  window.BluephonePeerWebRtcConfig = {
  _test_only_mdnsHostFallbackToLoopback: true,
  rtcConfig: {
    iceServers: []
  }
};
  var state = document.getElementById("state"), events = document.getElementById("events"), session = document.getElementById("session");
  function secret() { var b = new Uint8Array(32); crypto.getRandomValues(b); return BluephonePeerCore.toBase64(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
  function log(type, detail) { events.textContent = (type + " " + JSON.stringify(detail) + "\n" + events.textContent).slice(0, 4000); state.textContent = type; }
  function start(value) { location.hash = "invite=" + value; session.hidden = false; BluephonePeerCore.join(value, {event: log}, window.BluephonePeerWebRtcConfig); }
  document.getElementById("create").onclick = function () { var value=secret(), url=location.href.split("#")[0]+"#invite="+value; document.getElementById("invite").innerHTML="Invitation: "+url+"<br><a href=\"bluephone-lab://peer#invite="+value+"\">Open Bluephone Lab Gateway</a>"; start(value); };
  document.getElementById("send").onclick = function () { var bytes=new TextEncoder().encode(document.getElementById("payload").value); BluephonePeerCore.send(BluephonePeerCore.toBase64(bytes)); };
  var match = location.hash.match(/^#invite=([A-Za-z0-9_-]{43,})$/); if (match) start(match[1]);
}());
