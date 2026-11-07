// Mouse, trackpad and Mac keyboard support for Rover Home. Everything goes through the same state the TV remote uses,
// so hovering focuses things, clicking presses OK, right-click goes Back, and scrolling moves like the arrow keys.
(function () {
  var U = window.RoverUI; if (!U) return;
  var press = U.press, $ = function (id) { return document.getElementById(id); };
  function idxIn(arr, node) { for (var n = node; n && n !== document.body; n = n.parentNode) { var i = arr.indexOf(n); if (i >= 0) return i; } return -1; }
  function idx2(arr2, node) { for (var n = node; n && n !== document.body; n = n.parentNode) for (var r = 0; r < arr2.length; r++) { var k = arr2[r].indexOf(n); if (k >= 0) return [r, k]; } return null; }
  function childIdx(parent, node) { if (!parent) return -1; for (var n = node; n && n !== document.body; n = n.parentNode) if (n.parentNode === parent) return Array.prototype.indexOf.call(parent.children, n); return -1; }
  function upId(node, id) { for (var n = node; n && n !== document.body; n = n.parentNode) if (n.id === id) return true; return false; }

  // What is under the pointer: f = move focus there, a = what a click does (a key code, or a function)
  function resolve(node) {
    var E = U.els(), st = U.state, ms = U.ms, CC = U.CC, SQ = U.SQ, v = U.view, i, rk;
    if (SQ.open) {
      if ((rk = idx2(E.sqKey, node))) return { f: function () { SQ.zone = "kb"; SQ.kr = rk[0]; SQ.kk = rk[1]; }, a: 13 };
      if ((i = idxIn(E.sqRes, node)) >= 0) return { f: function () { SQ.zone = "res"; SQ.ri = i; }, a: null };   // has its own click
      return null;
    }
    if (CC.open) {
      if ((i = idxIn(E.ccCat, node)) >= 0) return { f: null, a: function () { var n = E.ccCat.length; CC.pane = "side"; if (CC.cat !== i) { CC.cat = (i - 1 + n) % n; press(40); } } };
      if ((i = idxIn(E.ccRow, node)) >= 0) return { f: function () { CC.pane = "rows"; CC.row = i; }, a: 13 };
      return null;
    }
    if (v === "home") {
      if ((i = idxIn(E.dock, node)) >= 0) return { f: function () { st.zone = "dock"; st.home = i; }, a: 13 };
      if (upId(node, "emblem")) return { f: function () { st.zone = "emblem"; }, a: 13 };
      if (upId(node, "srch")) return { f: function () { st.zone = "srch"; }, a: null };
      if (upId(node, "prof")) return { f: function () { st.zone = "prof"; }, a: null };
      if (upId(node, "gear")) return { f: function () { st.zone = "gear"; }, a: null };
      return null;
    }
    if (v === "library") { if ((i = idxIn(E.lib, node)) >= 0) return { f: function () { st.library = i; }, a: 13 }; return null; }
    if (v === "music") {
      if ((i = idxIn(E.tabs, node)) >= 0) return { f: null, a: function () { ms.inTabs = false; U.setTab(i); } };
      var t = ms.tab;
      if (t === 0) {
        if ((i = idxIn(E.fy, node)) >= 0) return { f: function () { ms.inTabs = false; ms.l.row = 0; ms.l.ci = i; }, a: 13 };
        if ((i = idxIn(E.vibe, node)) >= 0) return { f: function () { ms.inTabs = false; ms.l.row = 1; ms.l.mi = i; }, a: 13 };
      }
      if (t === 1) {
        if ((rk = idx2(E.kb, node))) return { f: function () { ms.inTabs = false; ms.s.zone = "kb"; ms.s.kr = rk[0]; ms.s.kk = rk[1]; }, a: 13 };
        if ((i = idxIn(E.res, node)) >= 0) return { f: function () { ms.inTabs = false; ms.s.zone = "res"; ms.s.ri = i; }, a: 13 };
      }
      if (t === 2) {
        var L = [[E.rec, 0, "ri"], [E.sav, 1, "si"], [E.ampl, 2, "pi"], [E.am, 3, "ai"]];
        for (var q = 0; q < L.length; q++) if ((i = idxIn(L[q][0], node)) >= 0) {
          var Z = L[q]; return { f: function () { ms.inTabs = false; ms.b.zone = Z[1]; ms.b[Z[2]] = i; }, a: 13 };
        }
      }
      if (t === 3) {
        if ((i = childIdx($("m-ctl"), node)) >= 0) return { f: function () { ms.inTabs = false; ms.n.zone = "ctl"; ms.n.ci = i; }, a: 13 };
        if (!U.lyricsOn && (i = childIdx($("m-list"), node)) >= 0) return { f: function () { ms.inTabs = false; ms.n.zone = "list"; ms.n.li = i; }, a: 13 };
      }
    }
    return null;
  }

  // hover = focus (only when the mouse really moves, so it never fights the keyboard)
  var lastEl = null, lx = -1, ly = -1, hideT;
  function showCursor() { document.body.classList.remove("lan-nocur"); clearTimeout(hideT); hideT = setTimeout(function () { document.body.classList.add("lan-nocur"); }, 3000); }
  document.addEventListener("mousemove", function (e) {
    if (Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly) < 3) return;
    lx = e.clientX; ly = e.clientY; showCursor();
    if (e.target === lastEl) return; lastEl = e.target;
    var r = resolve(e.target); if (r && r.f) { r.f(); U.paint(); }
  });
  document.addEventListener("click", function (e) {
    if (e.button !== 0) return;
    var r = resolve(e.target); if (!r) return;
    if (r.f) r.f();
    if (typeof r.a === "function") r.a(); else if (r.a) press(r.a);
    U.paint();
  });
  // right-click or the mouse's back button = Back
  document.addEventListener("contextmenu", function (e) { e.preventDefault(); press(27); });
  document.addEventListener("mouseup", function (e) { if (e.button === 3) { e.preventDefault(); press(27); } });
  // scroll wheel / trackpad = arrow keys
  var acc = 0, accX = 0, lastW = 0;
  document.addEventListener("wheel", function (e) {
    e.preventDefault();
    var now = Date.now(); acc += e.deltaY; accX += e.deltaX;
    if (now - lastW < 110) return;
    if (Math.abs(acc) > 40) { press(acc > 0 ? 40 : 38); lastW = now; }
    else if (Math.abs(accX) > 40) { press(accX > 0 ? 39 : 37); lastW = now; }
    if (now - lastW < 5) { acc = 0; accX = 0; }
  }, { passive: false });

  // Mac keyboard stand-ins for the remote's colour and media buttons
  function typing() { var a = document.activeElement; return U.SQ.open || (a && /INPUT|TEXTAREA/.test(a.tagName)); }
  window.addEventListener("keydown", function (e) {
    var k = e.keyCode, cmd = e.metaKey || e.ctrlKey, hit = null;
    if (cmd && k === 75) hit = 406;                       // Cmd+K  = Blue (search)
    else if (cmd && k === 188) hit = 404;                 // Cmd+,  = Green (Control Center)
    else if (cmd && k === 83) hit = 403;                  // Cmd+S  = Red (save song)
    else if (k === 32 && !typing() && !(U.view === "music" && U.ms.tab === 1)) hit = 415;   // Space = play / pause
    else if (e.shiftKey && (k === 37 || k === 39)) hit = k === 37 ? 412 : 417;               // Shift+Left/Right = skip back / forward 10s
    else if (k === 76 && !cmd && !typing() && U.view === "music" && U.ms.tab === 3) { e.preventDefault(); e.stopPropagation(); window.dispatchEvent(new Event("lantern-listen")); return; }  // L = listen
    if (hit === null) return;
    e.preventDefault(); e.stopPropagation(); press(hit);
  }, true);
  showCursor();
})();
