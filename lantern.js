// Lantern visuals for Now Playing. Smooth by design: only transforms, opacity and two small canvases change per frame
// (no CSS variables or shadows animated, which was what made the first version choppy).
// Beat: "Listen" mode hears the real song through the Mac's microphone (works with YouTube too);
// otherwise a gentle simulated groove. On the TV there is no microphone, so it always uses the groove.
(function () {
  var vm = document.getElementById("v-music"), aw = document.getElementById("artwrap"), now = document.getElementById("ms-now");
  if (!vm || !aw || !now) return;
  var $ = function (id) { return document.getElementById(id); };

  // layers
  var aur = document.createElement("canvas"), rg = document.createElement("canvas"), glow = document.createElement("div");
  aur.id = "lan-aur"; aur.width = 320; aur.height = 180; rg.id = "lan-rings"; glow.id = "lan-glow";
  vm.insertBefore(aur, $("gfx")); vm.insertBefore(rg, $("gfx")); aw.insertBefore(glow, aw.firstChild);
  var ac = aur.getContext("2d"), rc = rg.getContext("2d"), flow = $("flow"), disc = $("b-play");

  // Listen mode (Mac only: needs a web address and a microphone)
  var canListen = /^https?:$/.test(location.protocol) && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  var pill = document.createElement("div"); pill.id = "lan-listen"; pill.innerHTML = "<i></i><span>Listen</span>";
  if (canListen) now.appendChild(pill);
  var mic = null, an = null, buf = null, peak = .2, floor = 0, listening = false;
  function setPill(t, on) { pill.querySelector("span").textContent = t; pill.classList.toggle("on", !!on); }
  function startListen() {
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then(function (s) {
      var A = window.AudioContext || window.webkitAudioContext, ctx = new A();
      mic = { s: s, ctx: ctx }; an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = .5;
      ctx.createMediaStreamSource(s).connect(an); buf = new Uint8Array(an.frequencyBinCount);
      listening = true; peak = .2; floor = 0; setPill("Listening", true);
      try { localStorage.setItem("lan_listen", "1"); } catch (e) {}
    }).catch(function () { setPill("Mic blocked", false); setTimeout(function () { setPill("Listen", false); }, 2500); });
  }
  function stopListen() {
    if (mic) { mic.s.getTracks().forEach(function (t) { t.stop(); }); try { mic.ctx.close(); } catch (e) {} }
    mic = an = null; listening = false; setPill("Listen", false);
    try { localStorage.removeItem("lan_listen"); } catch (e) {}
  }
  function toggleListen() { if (!canListen) return; if (listening) stopListen(); else startListen(); }
  pill.addEventListener("click", function (e) { e.stopPropagation(); toggleListen(); });
  window.addEventListener("lantern-listen", toggleListen);
  try { if (canListen && localStorage.getItem("lan_listen")) setTimeout(startListen, 800); } catch (e) {}

  function heard() {                                  // 0..1 bass energy from the room, self-calibrating
    an.getByteFrequencyData(buf);
    var hz = mic.ctx.sampleRate / an.fftSize, lo = Math.max(1, Math.floor(35 / hz)), hi = Math.ceil(150 / hz), s = 0;
    for (var i = lo; i <= hi; i++) s += buf[i];
    var v = s / (hi - lo + 1) / 255;
    peak = Math.max(peak * .9985, v); floor = floor + (Math.min(floor, v) - floor) * .2 + (v - floor) * .002;
    return Math.max(0, Math.min(1, (v - floor) / Math.max(.08, peak - floor)));
  }
  function groove(t) {
    var beat = 60 / 100, ph = (t % beat) / beat, n = Math.floor(t / beat);
    return Math.exp(-ph * 6.5) * (n % 4 === 0 || n % 4 === 2 ? 1 : .55) * (.35 + .65 * (.5 + .5 * Math.sin(t / 9)));
  }

  // colours: from the living background when readable, else the profile's theme
  var pal = ["255,42,61", "139,92,246", "255,42,61"], palAt = -9;
  function cssRgb(n, f) { var v = getComputedStyle(vm).getPropertyValue(n).trim(); return v || f; }
  function samplePal(t) {
    if (t - palAt < 2) return; palAt = t;
    var base = [cssRgb("--a-rgb", "255,42,61"), cssRgb("--b-rgb", "139,92,246")];
    try {
      var x = document.createElement("canvas"); x.width = x.height = 8; var cx = x.getContext("2d");
      cx.drawImage(flow, 0, 0, 8, 8); var d = cx.getImageData(0, 0, 8, 8).data, cs = [];
      for (var i = 0; i < d.length; i += 4) { var r = d[i], g = d[i+1], b = d[i+2], mx = Math.max(r,g,b), mn = Math.min(r,g,b);
        if (mx > 60 && mx - mn > 40) cs.push({ c: Math.min(255, r * 1.3 | 0) + "," + Math.min(255, g * 1.3 | 0) + "," + Math.min(255, b * 1.3 | 0), s: (mx - mn) * mx }); }
      cs.sort(function (a, b) { return b.s - a.s; });
      pal = cs.length >= 3 ? [cs[0].c, base[1], cs[Math.floor(cs.length / 2)].c] : [base[0], base[1], base[0]];
    } catch (e) { pal = [base[0], base[1], base[0]]; }
    glow.style.background = "radial-gradient(closest-side, rgba(" + pal[0] + ",.85), rgba(" + pal[1] + ",.35) 55%, transparent)";
  }

  // lyric sweep: the current line fills left to right over its share of the song
  var lyBox = $("ly-lines"), lastCur = null;
  function durSec() { var m = /(\d+):(\d+)/.exec(($("m-dur") || {}).textContent || ""); return m ? (+m[1]) * 60 + (+m[2]) : 0; }
  function lyricTick() {
    var c = lyBox && lyBox.querySelector(".ly.cur"); if (c === lastCur) return; lastCur = c; if (!c) return;
    var lines = lyBox.querySelectorAll(".ly:not(.gap)"), tot = 0, me = 0;
    for (var i = 0; i < lines.length; i++) { var w = Math.max(12, lines[i].textContent.length); tot += w; if (lines[i] === c) me = w; }
    var d = durSec(), sec = d && tot ? Math.max(1.2, Math.min(12, d * me / tot)) : 4;
    c.style.animationDuration = sec.toFixed(2) + "s";
    var past = true; for (var j = 0; j < lines.length; j++) { if (lines[j] === c) past = false; lines[j].classList.toggle("past", past); }
  }

  // Side lyrics: always on the right of Now Playing (behind the controls) whenever the song has lyrics.
  // Mirrors the lines the app already renders, so timing stays the app's own.
  var side = document.createElement("div"), sideTrack = document.createElement("div"), sideLines = [], sideCur = -1;
  side.id = "lan-lyr"; sideTrack.className = "track"; side.appendChild(sideTrack); now.insertBefore(side, now.firstChild);
  function sideBuild() {
    sideTrack.innerHTML = ""; sideLines = []; sideCur = -1;
    var src = lyBox ? lyBox.querySelectorAll(".ly:not(.gap)") : [];
    for (var i = 0; i < src.length; i++) { var d = document.createElement("div"); d.className = "sl"; d.textContent = src[i].textContent; sideTrack.appendChild(d); sideLines.push(d); }
    now.classList.toggle("has-lyr", sideLines.length > 0);
    sideSync();
  }
  function sideSync() {
    if (!sideLines.length) return;
    var src = lyBox.querySelectorAll(".ly:not(.gap)"), ci = -1;
    for (var i = 0; i < src.length; i++) if (src[i].classList.contains("cur")) { ci = i; break; }
    if (ci === sideCur) return;
    if (sideCur >= 0 && sideLines[sideCur]) sideLines[sideCur].classList.remove("cur");
    sideCur = ci; if (ci < 0) return;
    var el = sideLines[ci]; el.classList.add("cur");
    for (var j = 0; j < sideLines.length; j++) sideLines[j].classList.toggle("past", j < ci);
    var c = src[ci]; el.style.animationDuration = c.style.animationDuration || "4s";
    sideTrack.style.transform = "translateY(" + (-(el.offsetTop - side.clientHeight * .42)) + "px)";
  }
  if (lyBox && window.MutationObserver) {
    new MutationObserver(function (m) {
      var rebuilt = false;
      m.forEach(function (r) { if (r.type === "childList" && r.target === lyBox && !rebuilt) { rebuilt = true; sideBuild(); } });
      if (!rebuilt) setTimeout(sideSync, 0);
    }).observe(lyBox, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    sideBuild();
  }

  var level = 0, last = 0, lastRing = -9, rings = [], drewRings = false, t0 = performance.now(), on = 0;
  function frame(ts) {
    if (vm.hidden || !vm.classList.contains("now")) { setTimeout(function () { requestAnimationFrame(frame); }, 250); return; }   // idle off-screen
    requestAnimationFrame(frame);
    var t = (ts - t0) / 1000;
    samplePal(t); lyricTick(); sideSync();
    var playing = aw.classList.contains("playing");
    on += ((playing ? 1 : 0) - on) * .05;
    var b = (listening && an ? heard() : groove(t)) * on;
    level += (b - level) * (b > level ? .6 : .14);

    // cheap per-frame moves: transforms + opacity only
    glow.style.transform = "scale(" + (1 + level * .18).toFixed(3) + ")"; glow.style.opacity = (.35 + level * .6).toFixed(3);
    if (flow) flow.style.transform = "scale(" + (1.03 + level * .06).toFixed(3) + ")";
    if (disc) disc.style.setProperty("--lan-k", level.toFixed(3));

    ac.clearRect(0, 0, 320, 180); ac.globalCompositeOperation = "lighter";
    for (var k = 0; k < 3; k++) {
      var amp = 10 + level * 36, yb = 76 + k * 33;
      ac.beginPath(); ac.moveTo(0, 180);
      for (var x = 0; x <= 320; x += 8) ac.lineTo(x, yb + Math.sin(x / (45 + k * 15) + t * (.4 + k * .15)) * amp * .6 + Math.sin(x / 23 - t * .8 + k) * amp * .25);
      ac.lineTo(320, 180); ac.closePath();
      var gg = ac.createLinearGradient(0, yb - amp, 0, yb + 50);
      gg.addColorStop(0, "rgba(" + pal[k] + "," + (.22 + level * .3) + ")"); gg.addColorStop(1, "rgba(" + pal[k] + ",0)");
      ac.fillStyle = gg; ac.fill();
    }

    if (b > .72 && b - last > .1 && t - lastRing > .35) { rings.push(t); lastRing = t; }
    last = b;
    rings = rings.filter(function (q) { return t - q < 1.6; });
    if (rings.length || drewRings) {
      var w = vm.clientWidth, h = vm.clientHeight; if (rg.width !== w || rg.height !== h) { rg.width = w; rg.height = h; }
      rc.clearRect(0, 0, w, h); drewRings = rings.length > 0;
      var r = aw.getBoundingClientRect(), vr = vm.getBoundingClientRect(), cx = r.left - vr.left + r.width / 2, cy = r.top - vr.top + r.height / 2;
      rings.forEach(function (q) {
        var kk = (t - q) / 1.6; rc.beginPath(); rc.arc(cx, cy, r.width * .55 + kk * 900, 0, Math.PI * 2);
        rc.strokeStyle = "rgba(" + pal[0] + "," + (.35 * (1 - kk)) + ")"; rc.lineWidth = 2 + (1 - kk) * 6; rc.stroke();
      });
    }
  }
  requestAnimationFrame(frame);
})();
