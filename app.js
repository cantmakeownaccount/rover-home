(function () {
  var apps = window.ROVER_APPS, loc = window.ROVER_LOCATION, inputs = window.ROVER_INPUTS;
  var CFG = window.ROVER_MUSIC_CFG, MOODS = CFG.moods, demo = window.ROVER_MUSIC || [], FRAMES = window.ROVER_FRAMES || [];
  var hasTizen = typeof tizen !== "undefined" && tizen.application;
  var toastTimer;
  function $(id) { return document.getElementById(id); }
  // ---------- Fit to screen (Mac/browser previews): same 1920x1080 TV layout, scaled and centred ----------
  function fitScreen() {
    if (hasTizen) return;
    var iw = window.innerWidth, ih = window.innerHeight, z = Math.min(iw / 1920, ih / 1080);
    var x = Math.round((iw - 1920 * z) / 2), y = Math.round((ih - 1080 * z) / 2), de = document.documentElement.style, b = document.body.style;
    de.width = "100vw"; de.height = "100vh"; de.background = "#000"; de.overflow = "hidden";
    b.transformOrigin = "0 0";
    b.transform = (Math.abs(z - 1) < .002 && !x && !y) ? "" : "translate(" + x + "px," + y + "px) scale(" + z + ")";
  }
  fitScreen(); window.addEventListener("resize", fitScreen);
  // ---------- Live preview: reloads itself when dev-version.txt changes (browser previews only) ----------
  var devVer = null;
  function devRestore() {
    try { var d = JSON.parse(sessionStorage.getItem("rover_dev") || "null"); if (!d) return; sessionStorage.removeItem("rover_dev");
      if (d.view === "library") { state.library = Math.min(d.i || 0, Math.max(0, libEls.length - 1)); showView("library"); }
    } catch (e) {}
  }
  if (!hasTizen && /^https?:$/.test(location.protocol)) setInterval(function () {
    var x = new XMLHttpRequest(); x.open("GET", "dev-version.txt?t=" + Date.now()); x.timeout = 1500;
    x.onload = function () {
      if (x.status !== 200) return; var v = x.responseText.trim();
      if (devVer === null) { devVer = v; return; }
      if (v !== devVer) { try { sessionStorage.setItem("rover_dev", JSON.stringify({ view: view, i: state.library })); } catch (e) {} location.reload(); }
    };
    x.send();
  }, 1500);
  // ---------- Hardening: catch, log and survive errors instead of freezing the remote ----------
  function pushLog(key, m) {
    try { var l = JSON.parse(localStorage.getItem(key) || "[]"); l.unshift({ m: String(m).slice(0, 300), t: Date.now() }); localStorage.setItem(key, JSON.stringify(l.slice(0, 25))); } catch (e) {}
  }
  function roverErr(e) { try { console.error("[Rover]", e); } catch (x) {} pushLog("rover_errs", (e && (e.message || e.name)) || e); }
  function logEvt(m) { pushLog("rover_events", m); }
  window.addEventListener("error", function (ev) { pushLog("rover_errs", (ev.message || "error") + (ev.filename ? " @" + String(ev.filename).split("/").pop() + ":" + ev.lineno : "")); });
  window.addEventListener("unhandledrejection", function (ev) { pushLog("rover_errs", "promise: " + ((ev.reason && ev.reason.message) || ev.reason)); });

  // ---------- Profiles (each person gets their own look, tiles, settings and music taste) ----------
  // profiles.js gives the starting profiles. After that, the TV's Control Center is the boss
  // (bump ROVER_PROFILES_REV in profiles.js, or use "Reset profiles" in Control Center, to re-read the file).
  var THEMES = window.ROVER_THEMES || {}, WALLS = window.ROVER_WALLS || {};
  function seedProfiles() { var l = JSON.parse(JSON.stringify(window.ROVER_PROFILES || [])); return l.length ? l : [{ id: "main", name: "Me", main: true, theme: "scarlet", wall: "leopard", emblem: true, hidden: [] }]; }
  var PROFS = jget("rover_profiles", null);
  if (!PROFS || !PROFS.length || (window.ROVER_PROFILES_REV || 1) > jget("rover_profiles_rev", 0)) { PROFS = seedProfiles(); jset("rover_profiles", PROFS); jset("rover_profiles_rev", window.ROVER_PROFILES_REV || 1); }
  var ACTIVE = PROFS[0];
  (function () { var id = null; try { id = localStorage.getItem("rover_active"); } catch (e) {} for (var i = 0; i < PROFS.length; i++) if (PROFS[i].id === id) ACTIVE = PROFS[i]; })();
  function pk(base) { return ACTIVE.main ? base : base + "_" + ACTIVE.id; }
  function pkFor(p, base) { return p.main ? base : base + "_" + p.id; }
  function saveProfs() { jset("rover_profiles", PROFS); }
  function themeOf(p) { return THEMES[p.theme] || THEMES.scarlet || { name: "Scarlet", a: "#ff2a3d", b: "#8b5cf6" }; }
  function hexRgb(h) { var n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255); }
  function avBg(p) { var t = themeOf(p); return "linear-gradient(135deg," + t.a + "," + t.b + ")"; }

  // A pre-blurred copy of any picture, made on the TV itself, so glass panels frost your own wallpaper too
  function makeFrost(src, done) {
    var im = new Image();
    im.onload = function () {
      try {
        var s = document.createElement("canvas"); s.width = 128; s.height = 72;
        s.getContext("2d").drawImage(im, 0, 0, 128, 72);
        var b = document.createElement("canvas"); b.width = 640; b.height = 360;
        var bx = b.getContext("2d"); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = "high"; bx.drawImage(s, 0, 0, 640, 360);
        done(b.toDataURL("image/jpeg", .86));
      } catch (e) { done(null); }
    };
    im.onerror = function () { done(null); };
    im.src = src;
  }
  var HAS_CUSTOM = {}, lookToken = 0;
  function probe(url, cb) { var im = new Image(); im.onload = function () { cb(true); }; im.onerror = function () { cb(false); }; im.src = url; }
  function applyLook(p) {
    var th = themeOf(p), st = document.documentElement.style, my = ++lookToken;
    st.setProperty("--scarlet", th.a); st.setProperty("--purple", th.b);
    st.setProperty("--a-rgb", hexRgb(th.a)); st.setProperty("--b-rgb", hexRgb(th.b));
    var w = WALLS[p.wall] || WALLS.leopard;
    if (w) { st.setProperty("--wall-img", "url(" + w.img + ")"); st.setProperty("--frost-img", "url(" + w.frost + ")"); }
    var emb = $("emblem"); if (emb) emb.style.display = p.emblem === false ? "none" : "";
    var av = $("prof-av"); if (av) { av.style.background = avBg(p); av.textContent = (p.name || "?").charAt(0).toUpperCase(); }
    var pc = $("prof-cap"); if (pc) pc.textContent = p.name;
    var base = "profiles/" + p.id + "/";
    probe(base + "wallpaper.jpg", function (ok) {
      HAS_CUSTOM[p.id] = ok;
      if (!ok || p.wall !== "custom" || my !== lookToken) return;
      st.setProperty("--wall-img", "url(" + base + "wallpaper.jpg)");
      probe(base + "wallpaper-frost.jpg", function (hasFrost) {
        if (my !== lookToken) return;
        if (hasFrost) { st.setProperty("--frost-img", "url(" + base + "wallpaper-frost.jpg)"); return; }
        makeFrost(base + "wallpaper.jpg", function (data) { if (my === lookToken) st.setProperty("--frost-img", data ? "url(" + data + ")" : "none"); });
      });
    });
  }
  function isHidden(key) { return (ACTIVE.hidden || []).indexOf(key) >= 0; }
  var ALLAPPS = apps;
  function visibleApps() { return ALLAPPS.filter(function (x) { return !isHidden(artKey(x.name)); }); }
  apps = visibleApps();

  // ---------- Settings store (per profile) ----------
  var S = { hdmiBlocked: false, clock24: false, tempC: false, crossfade: true, sideLyrics: true, lyrOffset: 0, ps5: 0, saver: 5, tileShuffle: "slide", returnHome: true, bgMusic: false };
  try { var sv = JSON.parse(localStorage.getItem(pk("rover_settings"))); if (sv) for (var sk in sv) if (sk in S) S[sk] = sv[sk]; } catch (e) {}
  var HDMI0 = inputs.ps5.hdmi;
  if (S.ps5) inputs.ps5.hdmi = S.ps5;
  function saveS() { try { localStorage.setItem(pk("rover_settings"), JSON.stringify(S)); } catch (e) {} }
  if (S.hdmiBlocked) jset("rover_hdmiblocked", 1);

  // ---------- Clock ----------
  function tick() {
    var d = new Date();
    var h = S.clock24 ? ("0" + d.getHours()).slice(-2) : (d.getHours() % 12 || 12), m = ("0" + d.getMinutes()).slice(-2);
    $("time").textContent = h + ":" + m;
    $("date").textContent = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
  tick(); setInterval(tick, 5000);

  // ---------- Weather (Open-Meteo, no key) ----------
  var WX = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Freezing fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain", 67: "Freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Light showers", 81: "Showers", 82: "Heavy showers",
    85: "Snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm, hail", 99: "Thunderstorm, hail" };
  var WX_MAX_AGE = 90 * 60 * 1000; // never show readings older than 90 min as if current
  var wxTimer = null;
  function showWx(w) {
    var age = Date.now() - (w.at || 0), stale = age > 25 * 60 * 1000;
    $("wx-temp").textContent = Math.round(w.t) + "\u00B0";
    $("wx-desc").textContent = (WX[w.code] || "Weather") + (w.fl != null && Math.abs(w.fl - w.t) >= 3 ? "  \u00B7  feels " + Math.round(w.fl) + "\u00B0" : "");
    $("wx-range").textContent = loc.label + "  \u00B7  H " + Math.round(w.hi) + "\u00B0  L " + Math.round(w.lo) + "\u00B0" +
      (stale ? "  \u00B7  updated " + Math.round(age / 60000) + " min ago" : "");
  }
  function fallbackWx() {
    var w = null;
    try { w = JSON.parse(localStorage.getItem("rover_wx")); } catch (e) {}
    if (w && w.at && w.u === (S.tempC ? "c" : "f") && Date.now() - w.at < WX_MAX_AGE) showWx(w);
    else { $("wx-temp").textContent = "--\u00B0"; $("wx-desc").textContent = "Weather offline"; $("wx-range").textContent = loc.label + "  \u00B7  retrying"; }
    clearTimeout(wxTimer); wxTimer = setTimeout(loadWx, 60 * 1000); // retry quickly after a failure
  }
  function loadWx() {
    clearTimeout(wxTimer);
    var url = "https://api.open-meteo.com/v1/forecast?latitude=" + loc.lat + "&longitude=" + loc.lon +
      "&current=temperature_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=" + (S.tempC ? "celsius" : "fahrenheit") + "&timezone=" + encodeURIComponent(loc.tz) + "&_=" + Date.now();
    var x = new XMLHttpRequest();
    x.open("GET", url); x.timeout = 10000;
    x.onload = function () {
      try {
        var j = JSON.parse(x.responseText);
        var w = { t: j.current.temperature_2m, fl: j.current.apparent_temperature, code: j.current.weather_code, hi: j.daily.temperature_2m_max[0], lo: j.daily.temperature_2m_min[0], at: Date.now(), u: S.tempC ? "c" : "f" };
        if (typeof w.t !== "number") throw 0;
        try { localStorage.setItem("rover_wx", JSON.stringify(w)); } catch (e) {}
        showWx(w);
        wxTimer = setTimeout(loadWx, 10 * 60 * 1000);
      } catch (e) { fallbackWx(); }
    };
    x.onerror = x.ontimeout = fallbackWx;
    x.send();
  }
  loadWx();
  document.addEventListener("visibilitychange", function () { if (!document.hidden) loadWx(); });

  // ---------- Toast ----------
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, 4200);
  }

  // ---------- Small utils ----------
  function jget(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function pickOne(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function first(v) { return Array.isArray(v) ? v[0] : v; }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2); }
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hsl2rgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    var q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [Math.round(f(p, q, h + 1 / 3) * 255), Math.round(f(p, q, h) * 255), Math.round(f(p, q, h - 1 / 3) * 255)];
  }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) {
      s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function rgba(c, a) { return "rgba(" + Math.round(c[0]) + "," + Math.round(c[1]) + "," + Math.round(c[2]) + "," + a + ")"; }

  // ---------- State ----------
  var view = "home";
  var state = { home: 0, library: 0, zone: "dock" };
  var TABS = ["Listen Now", "Search", "Library", "Now Playing"];
  var ms = { tab: 0, inTabs: false, l: { row: 0, ci: 0, mi: 0 }, s: { zone: "kb", kr: 0, kk: 0, ri: 0, q: "" }, b: { zone: 0, ri: 0, si: 0, pi: 0, ai: 0 }, n: { zone: "ctl", ci: 2, li: 0 } };

  // ---------- Dock (four squares) ----------
  var SV = function (inner) { return '<svg viewBox="0 0 100 100">' + inner + '</svg>'; };
  var rects = "";
  [12, 39, 66].forEach(function (y) { [12, 39, 66].forEach(function (x) { rects += '<rect x="' + x + '" y="' + y + '" width="22" height="22" rx="6"/>'; }); });
  var DOCK = [
    { id: "library", title: "Streaming", sub: "All your apps", color: "var(--scarlet)", icon: SV(rects) },
    { id: "ps5", title: inputs.ps5.label, sub: "HDMI " + inputs.ps5.hdmi + " \u00B7 switches input", color: "var(--purple)",
      icon: SV('<path d="M28 34h44c12 0 20 10 22 28l2 12c1 8-8 12-14 6l-10-12H28L18 80c-6 6-15 2-14-6l2-12c2-18 10-28 22-28z"/><path d="M32 46v12M26 52h12"/><circle cx="68" cy="48" r="3"/><circle cx="76" cy="56" r="3"/>') },
    { id: "rover", title: "Rover", sub: "Door to Rover OS", color: "#d0d4db",
      icon: SV('<path d="M24 88V46a26 26 0 0 1 52 0v42z"/><path d="M36 88V50a14 14 0 0 1 28 0v38"/><path d="M12 88h76"/><circle cx="50" cy="66" r="2.5"/>') },
    { id: "music", title: "Music", sub: "Pick a vibe", color: "var(--scarlet)",
      icon: SV('<defs><linearGradient id="mg" gradientUnits="userSpaceOnUse" x1="10" y1="0" x2="90" y2="0"><stop offset="0" style="stop-color:var(--scarlet)"/><stop offset="1" style="stop-color:var(--purple)"/></linearGradient></defs><path style="stroke:url(#mg)" d="M20 42v16M35 28v44M50 18v64M65 34v32M80 44v12"/>') }
  ];
  // ---------- Your own tile pictures ----------
  // Name a picture after the tile (netflix.png, ps5.jpg ...). The main profile reads tile-art/;
  // every profile also reads profiles/<its id>/tile-art/ first. No picture = the normal tile.
  var ART_EXT = ["png", "jpg", "jpeg", "webp"];
  function artDirs() { var d = ["profiles/" + ACTIVE.id + "/tile-art/"]; if (ACTIVE.main) d.push("tile-art/"); return d; }
  // Several pictures per tile: netflix.png, netflix-2.jpg, netflix-3.webp ... (up to 30).
  // The TV can't list a folder, so pictures are found by trying the numbered names in order.
  var ART_MAX = 30;
  function findArt(key, cb) {
    var dirs = artDirs(), found = [], di = 0, n = 1, names = null, ni = 0, ei = 0;
    function namesFor(k) { return k === 1 ? [key, key + "-1"] : [key + "-" + k]; }
    (function step() {
      if (di >= dirs.length) return cb(found);
      if (!names) { names = namesFor(n); ni = 0; ei = 0; }
      if (ni >= names.length) {                       // nothing for this number
        names = null;
        if (n === 1) { n = 2; return step(); }        // a set may start at -2
        di++; n = 1; return step();
      }
      var url = dirs[di] + names[ni] + "." + ART_EXT[ei], im = new Image();
      im.onload = function () { found.push(url); names = null; n++; if (n > ART_MAX) { di++; n = 1; } step(); };
      im.onerror = function () { if (++ei >= ART_EXT.length) { ei = 0; ni++; } step(); };
      im.src = url;
    })();
  }
  function showTileArt(el, url, slow) {
    var olds = [].slice.call(el.querySelectorAll(".tart")), top = olds[olds.length - 1];
    var d = document.createElement("i"); d.className = "tart" + (slow ? " slow" : "");
    d.style.backgroundImage = "linear-gradient(180deg, rgba(0,0,0,0) 42%, rgba(0,0,0,.62)), url(\"" + url + "\")";
    if (top) el.insertBefore(d, top.nextSibling); else el.insertBefore(d, el.firstChild);
    el.classList.add("has-art");
    requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add("on"); }); });
    setTimeout(function () { olds.forEach(function (o) { if (o.parentNode) o.parentNode.removeChild(o); }); }, slow ? 1500 : 600);
  }
  function pickArt(el, slow) {
    var a = el._art; if (!a || !a.urls.length) return;
    var j = a.i;
    if (a.urls.length > 1) { do { j = Math.floor(Math.random() * a.urls.length); } while (j === a.i); }
    a.i = j;
    var im = new Image(), url = a.urls[j];
    im.onload = function () { if (el.parentNode) showTileArt(el, url, slow); };
    im.src = url;
  }
  function tileArt(el, key) {
    if (!key) return;
    var who = ACTIVE.id;
    findArt(key, function (urls) {
      if (who !== ACTIVE.id || !el.parentNode || !urls.length) return;
      el._art = { urls: urls, i: -1 };
      if (S.tileShuffle === "off") { el._art.i = 0; showTileArt(el, urls[0]); }
      else pickArt(el, false);
    });
  }
  // Slideshow: every few seconds one tile on screen fades to another of its pictures.
  setInterval(function () {
    if (S.tileShuffle !== "slide" || saverOn || CC.open || SQ.open) return;
    var pool = (view === "home" ? dockEls : view === "library" ? libEls : []).filter(function (el) { return el._art && el._art.urls.length > 1; });
    if (pool.length) pickArt(pickOne(pool), true);
  }, 7000);
  function reshuffleTiles(list) {
    if (S.tileShuffle !== "visit") return;
    list.forEach(function (el) { if (el._art && el._art.urls.length > 1) pickArt(el, false); });
  }
  function artKey(name) { return String(name).toLowerCase().replace(/[^a-z0-9]/g, ""); }

  var dockEls = [], DOCKV = [], libEls = [], LIBCOLS = 5;
  function buildTiles() {
    $("dock").innerHTML = ""; $("lib-grid").innerHTML = ""; dockEls = []; libEls = [];
    if ($("st-stack")) { $("st-stack").innerHTML = ""; stHeroOn = null; }
    DOCKV = DOCK.filter(function (d) { return !isHidden(d.id); });
    if (!DOCKV.length) DOCKV = [DOCK[0]];
    apps = visibleApps();
    DOCKV.forEach(function (d, i) {
      var el = document.createElement("div");
      el.className = "sq frost"; el.style.setProperty("--c", d.color);
      var sub = d.id === "ps5" ? "HDMI " + inputs.ps5.hdmi + " · switches input" : d.sub;
      el.innerHTML = d.icon + '<div><div class="t">' + d.title + '</div><div class="s" id="sub-' + d.id + '">' + sub + '</div></div>';
      $("dock").appendChild(el); dockEls.push(el);
      tileArt(el, d.id === "library" ? "streaming" : d.id);
      el.addEventListener("click", function () { state.home = i; state.zone = "dock"; paint(); openDock(d.id); });
    });
    apps.forEach(function (a, i) {
      var el = document.createElement("div");
      el.className = "tile frost st-tile" + (scanned && !a.found ? " missing" : ""); el.style.setProperty("--accent", a.accent); el.style.setProperty("--acc-rgb", hexRgb(a.accent));
      el.innerHTML = '<i class="st-clip"><i class="st-cover"></i><i class="st-tint"></i><i class="st-lens"></i><i class="st-wave"></i></i><div class="st-kick">Streaming</div><div class="st-mark"></div><div class="st-name"></div><b class="st-chip"></b><div class="st-ok"><b>OK</b> Open</div>';
      el.querySelector(".st-mark").textContent = a.name; el.querySelector(".st-name").textContent = a.name;
      $("lib-grid").appendChild(el); libEls.push(el);
      tileArt(el, artKey(a.name)); tileLogo(el, artKey(a.name)); tileCover(el, artKey(a.name)); tileCard(el, artKey(a.name), a);
      el.addEventListener("click", function () { state.library = i; paint(); launch(a); });
    });
    $("lib-empty").hidden = apps.length > 0;
    state.home = Math.min(state.home, DOCKV.length - 1);
    state.library = Math.min(state.library, Math.max(0, apps.length - 1));
    stageKey = ""; frostAll();
  }
  // ---------- Your own logos (logos folder) ----------
  // logos/netflix.png, logos/zeus.svg ... Transparent PNG, WebP or SVG. Profiles can override in profiles/<id>/logos/.
  var LOGO_EXT = ["png", "webp", "svg", "jpg"], logoCache = {};
  function logoDirs() { var d = ["profiles/" + ACTIVE.id + "/logos/"]; if (ACTIVE.main) d.push("logos/"); return d; }
  function findLogo(key, cb) {
    var ck = ACTIVE.id + ":" + key;
    if (ck in logoCache) return cb(logoCache[ck]);
    var dirs = logoDirs(), di = 0, ei = 0;
    (function step() {
      if (di >= dirs.length) { logoCache[ck] = null; return cb(null); }
      var url = dirs[di] + key + "." + LOGO_EXT[ei], im = new Image();
      im.onload = function () { logoCache[ck] = url; cb(url); };
      im.onerror = function () { if (++ei >= LOGO_EXT.length) { ei = 0; di++; } step(); };
      im.src = url;
    })();
  }
  // Generic "first file that exists" finder for logos/, covers/ and marks (cached per profile)
  var assetCache = {};
  function findAsset(dir, key, exts, cb) {
    var ck = ACTIVE.id + ":" + dir + key;
    if (ck in assetCache) return cb(assetCache[ck]);
    var dirs = ["profiles/" + ACTIVE.id + "/" + dir];
    if (ACTIVE.main || dir === "cards/" || dir === "glass/") dirs.push(dir);
    var di = 0, ei = 0;
    (function step() {
      if (di >= dirs.length) { assetCache[ck] = null; return cb(null); }
      var url = dirs[di] + key + "." + exts[ei], im = new Image();
      im.onload = function () { assetCache[ck] = url; cb(url); };
      im.onerror = function () { if (++ei >= exts.length) { ei = 0; di++; } step(); };
      im.src = url;
    })();
  }
  // ---------- App covers (covers folder): cinematic artwork inside the glass ----------
  // covers/zeus.jpg ... wide artwork (about 1920 x 720). The glass, rim light and waterfall edge are CSS,
  // so the same picture works on the small bubble and the big top panel. Optional right-side mark: logos/<app>-mark.png
  var COVER_EXT = ["jpg", "webp", "png", "jpeg"];
  function tileCover(el, key) {
    var who = ACTIVE.id;
    findAsset("covers/", key, COVER_EXT, function (url) {
      if (!url || who !== ACTIVE.id || !el.parentNode) return;
      el.querySelector(".st-cover").style.backgroundImage = 'url("' + url + '")';
      var ap = apps[libEls.indexOf(el)]; if (ap && ap.coverPos) el.querySelector(".st-cover").style.backgroundPosition = ap.coverPos; if (ap && ap.coverSize) el.querySelector(".st-cover").style.backgroundSize = ap.coverSize;
      el._cover = url; el.classList.add("has-cover");
      if (view === "library") { stageKey = ""; stageUpdate(); }
    });
    findAsset("logos/", key + "-mark", ["png", "webp", "svg"], function (url) {
      if (!url || who !== ACTIVE.id || !el.parentNode) return;
      el._mark = url; if (view === "library") { stageKey = ""; stageUpdate(); }
    });
  }
  function tileLogo(el, key) {
    var who = ACTIVE.id;
    findLogo(key, function (url) {
      if (!url || who !== ACTIVE.id || !el.parentNode) return;
      var im = document.createElement("img"); im.className = "st-logo"; im.src = url; im.alt = "";
      el.insertBefore(im, el.querySelector(".st-name"));
      el._logo = url; el.classList.add("has-logo");
      if (view === "library") { stageKey = ""; stageUpdate(); }
    });
  }
  // ---------- Poster mode: covers closer to 16:9 than the wide panel show whole, with a blurred fill ----------
  var aspectCache = {}, blurCache = {};
  function posterMode(art) {
    var st = $("st-stage"), bl = $("st-blur");
    if (!art) { st.classList.remove("poster"); bl.style.backgroundImage = "none"; return; }
    function apply(asp) {
      if (stageKey.indexOf(art) < 0) return;                 // moved on to another app meanwhile
      var poster = asp < 2.4;
      st.classList.toggle("poster", poster);
      if (!poster) { bl.style.backgroundImage = "none"; return; }
      if (blurCache[art]) { bl.style.backgroundImage = "url(" + blurCache[art] + ")"; return; }
      makeFrost(art, function (data) { if (data) { blurCache[art] = data; if (stageKey.indexOf(art) >= 0) bl.style.backgroundImage = "url(" + data + ")"; } });
    }
    if (art in aspectCache) return apply(aspectCache[art]);
    var im = new Image();
    im.onload = function () { aspectCache[art] = im.naturalWidth / Math.max(1, im.naturalHeight); apply(aspectCache[art]); };
    im.src = art;
  }
  // ---------- Clean artwork (cards folder) ----------
  // cards/<app>-tile.webp -> the tile; cards/<app>-hero.webp -> the top panel.
  // The artwork includes its own branding; the glass and selection effects are CSS layers.
  var CARD_EXT = ["webp", "png", "jpg"], HERO_BOTTOM = 560, PANEL_H = 520, stHeroOn = null;
  // Liquid Glass is pure CSS over the clean artwork: one clip, then static layers (refraction ring, fisheye
  // depth, gloss, app-lit rim, waterfall edge). Only the selection fade/lift animates.
  function glassLayers(url, extra, refr) {
    return (refr ? '<i class="g g-refr"></i>' : '') + '<i class="g g-lens"></i><i class="g g-spec"></i>' +
           '<i class="g g-wave"><b></b></i><i class="g g-rim"></i>' + (extra || "");
  }
  // Shared art has a small edge-derived backing to fill its glass frame without cropping it.
  // Profile-specific artwork keeps its existing themed fallback instead of a mismatched backing.
  // Speed: cards-fit/ holds the same art already sitting on its edge backing at the exact frame size
  // (built by tools/build-edge-fill.py --fit). One image per slot instead of an image over a scaled
  // background, so moving between apps redraws nothing. Falls back to art + live backing if missing.
  function applyArtworkFill(clip, url, key, kind) {
    if (url.indexOf("cards/") !== 0) return;
    var img = clip.querySelector("img"), fit = "cards-fit/" + key + "-" + kind + ".webp";
    img.onerror = function () {
      img.onerror = null; img.src = url;
      clip.style.setProperty("--art-fill", 'url("cards-fill/' + key + '-' + kind + '.webp")');
      clip.classList.add("has-art-fill");
    };
    img.src = fit; clip.classList.add("is-fit");
  }
  // ---------- Liquid Glass pieces (glass folder, built by tools/build-glass.py) ----------
  // glass/<app>-hero.webp and glass/<app>-tile.webp hold the clean art poured into its glass (with the
  // bloom around it). One image per slot = one layer for the TV to draw. Text stays live HTML.
  var GL = { hero: { m: 60, w: 1765, h: 612 }, tile: { m: 22, w: 357, h: 214 } };
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function tileCard(el, key, app) {
    findAsset("glass/", key + "-tile", ["webp", "png"], function (gurl) {
      if (!gurl) return tileCardClassic(el, key, app);
      if (!el.parentNode) return;
      var tim = document.createElement("img"); tim.className = "gl-img"; tim.alt = ""; tim.src = gurl;
      el.appendChild(tim);
      var tn = app && app.tileName;
      el.insertAdjacentHTML("beforeend", '<div class="gl-kick">Streaming</div><div class="g-ok"><b>OK</b>Open</div>' +
        (tn ? '<div class="gl-tname" style="left:' + (tn[0] * 100) + '%;top:' + (tn[1] * 100) + '%">' + esc(app.name) + '</div>' : ""));
      el.classList.add("gl", "gl-" + key);
      findAsset("glass/", key + "-hero", ["webp", "png"], function (hurl) {
        if (!hurl) return;
        var nm = app && app.heroName, box = document.createElement("div"); box.className = "st-h gl gl-" + key;
        box.style.setProperty("--acc-rgb", el.style.getPropertyValue("--acc-rgb"));
        box.innerHTML = '<img class="gl-img" alt="" src="' + hurl + '"><div class="h-kick">Streaming</div>' +
          (nm ? '<div class="gl-name" style="left:' + (nm[0] * 100) + '%;top:' + (nm[1] * 100) + '%">' + esc(app.name) + '</div>' : "") +
          '<div class="h-ok"><b>OK</b><span>Open</span><em>Exit the app to land back here</em></div>';
        var im = box.querySelector("img");
        im.onload = function () {
          el._hero = hurl; el._heroEl = box;
          if (view === "library") { stageKey = ""; stageUpdate(); setTimeout(warmPanels, 30); }
        };
        $("st-stack").appendChild(box);
        if (im.decode) im.decode().catch(function () {});
      });
    });
  }
  function tileCardClassic(el, key, app) {
    var who = ACTIVE.id;
    var acc2 = app && app.accent2 ? hexRgb(app.accent2) : null;
    if (acc2) el.style.setProperty("--acc2-rgb", acc2);
    findAsset("cards/", key + "-tile", CARD_EXT, function (url) {
      if (!url || who !== ACTIVE.id || !el.parentNode) return;
      var clip = document.createElement("div"); clip.className = "g-clip";
      clip.innerHTML = '<img class="st-card" alt="" src="' + url + '">' + glassLayers(url) +
                       '<div class="g-ok"><b>OK</b>Open</div>';
      applyArtworkFill(clip, url, key, "tile");
      el.appendChild(clip); el.classList.add("baked");
    });
    findAsset("cards/", key + "-hero", CARD_EXT, function (url) {
      if (!url || who !== ACTIVE.id || !el.parentNode) return;
      // Each panel is built and decoded ONCE and stays in the stack; moving between apps only crossfades.
      var box = document.createElement("div"); box.className = "st-h";
      box.style.setProperty("--acc-rgb", el.style.getPropertyValue("--acc-rgb"));
      box.style.setProperty("--acc2-rgb", acc2 || el.style.getPropertyValue("--acc-rgb"));
      box.innerHTML = '<div class="g-clip"><img class="st-himg" alt="" src="' + url + '">' + glassLayers(url,
        '<div class="h-kick">Streaming</div><div class="h-ok"><b>OK</b><span>Open</span><em>Exit the app to land back here</em></div>', true) + '</div>';
      applyArtworkFill(box.querySelector(".g-clip"), url, key, "hero");
      var im = box.querySelector("img");
      im.onload = function () {
        el._hero = url; el._heroEl = box;
        if (view === "library") { stageKey = ""; stageUpdate(); setTimeout(warmPanels, 30); }
      };
      $("st-stack").appendChild(box);
      if (im.decode) im.decode().catch(function () {});
    });
  }
  var warming = false;
  function warmPanels() {                                  // pre-draw each panel once, invisibly, one per frame
    if (warming || view !== "library") return;
    var list = [].slice.call(document.querySelectorAll("#st-stack .st-h")).filter(function (b) { return !b._warm; });
    if (!list.length) return; warming = true;
    (function step(i) {
      if (i > 0) list[i - 1].classList.remove("warm");
      if (i >= list.length) { warming = false; warmPanels(); return; }
      list[i]._warm = true; if (!list[i].classList.contains("on")) list[i].classList.add("warm");
      requestAnimationFrame(function () { requestAnimationFrame(function () { step(i + 1); }); });
    })(0);
  }
  // ---------- Streaming stage: big preview of the focused app ----------
  var stageKey = "", LAUNCHES = jget(pk("rover_launches"), {});
  function ago(t) {
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "just now"; if (m < 60) return m + " min ago";
    var h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
    var d = Math.round(h / 24); return d === 1 ? "yesterday" : d + " days ago";
  }
  function stageUpdate() {
    var a = apps[state.library], el = libEls[state.library], st = $("st-stage");
    if (!st) return;
    if (!a || !el) { st.classList.add("empty"); return; }
    st.classList.remove("empty");
    if (el._heroEl) {                                         // fast path: finished panel already decoded
      var row0 = Math.floor(state.library / LIBCOLS);
      $("lib-grid").style.transform = "translateY(" + (-Math.max(0, row0 - 1) * 218) + "px)";
      if (stHeroOn !== el._heroEl) { if (stHeroOn) stHeroOn.classList.remove("on"); el._heroEl.classList.remove("warm"); el._heroEl.classList.add("on"); stHeroOn = el._heroEl; }
      st.classList.add("stacked"); stageKey = "hero:" + artKey(a.name);
      return;
    }
    if (stHeroOn) { stHeroOn.classList.remove("on"); stHeroOn = null; }
    st.classList.remove("stacked");
    var key = artKey(a.name), art = el._cover || (el._art && el._art.urls.length ? el._art.urls[Math.max(0, el._art.i)] : "");
    var sig = key + "|" + (el._logo || "") + "|" + (el._mark || "") + "|" + art + "|" + scanned + "|" + (a.found ? 1 : 0) + "|" + (el._hero || "") + "|" + (el._art2 || "");
    var row = Math.floor(state.library / LIBCOLS);
    $("lib-grid").style.transform = "translateY(" + (-Math.max(0, row - 1) * 218) + "px)";
    if (sig === stageKey) return;
    var swap = stageKey.split("|")[0] !== key; stageKey = sig;
    st.style.setProperty("--sacc", a.accent); st.style.setProperty("--sacc-rgb", hexRgb(a.accent));
    var lg = $("st-logo"); lg.innerHTML = "";
    if (el._logo) { var im = document.createElement("img"); im.src = el._logo; im.alt = ""; lg.appendChild(im); lg.classList.remove("word"); }
    else { lg.textContent = a.name; lg.classList.add("word"); }
    $("st-name").textContent = el._logo ? a.name : "";
    var gh = $("st-ghost"); gh.innerHTML = ""; gh.className = "";
    if (el._mark) { var mk = document.createElement("img"); mk.src = el._mark; mk.alt = ""; gh.appendChild(mk); gh.className = "mark"; }
    else if (art) { /* artwork fills the right side; no ghost */ }
    else if (el._logo) { var g = document.createElement("img"); g.src = el._logo; g.alt = ""; gh.appendChild(g); gh.classList.remove("word"); }
    else { gh.textContent = a.name; gh.classList.add("word"); }
    var bits = [];
    if (hasTizen && scanned) bits.push(a.found ? "On this TV" : "Not found on this TV yet");
    if (LAUNCHES[key]) bits.push("Opened " + ago(LAUNCHES[key]));
    $("st-meta").textContent = bits.join("  \u00B7  ");
    $("st-ret").textContent = S.returnHome ? "Exit the app to land back here" : "";
    var sa = $("st-art"); sa.style.backgroundImage = art ? 'url("' + art + '")' : "none"; sa.classList.toggle("on", !!art);
    st.classList.toggle("has-cover", !!art);
    posterMode(art);
    var card = $("st-card");
    st.classList.remove("baked", "composed");
    if (el._art2) {                                         // full panel, same size as Zeus's
      st.classList.add("composed"); card.src = el._art2;
      st.style.height = PANEL_H + "px"; st.style.top = (HERO_BOTTOM - PANEL_H) + "px";
    } else if (el._hero) {
      st.classList.add("baked"); card.src = el._hero;
      st.style.height = PANEL_H + "px"; st.style.top = (HERO_BOTTOM - PANEL_H) + "px";
    } else { card.removeAttribute("src"); st.style.height = ""; st.style.top = ""; }
    if (swap) { st.classList.remove("swap"); void st.offsetWidth; st.classList.add("swap"); }
  }
  buildTiles();

  // ---------- Launching apps ----------
  var installed = {}, scanned = false;
  function scanInstalled() {
    if (!hasTizen || !tizen.application.getAppsInfo) return;
    try {
      tizen.application.getAppsInfo(function (list) {
        installed = {};
        list.forEach(function (a) { installed[a.name] = a.id; });
        ALLAPPS.forEach(function (a) {
          a.found = false;
          for (var n in installed) { if (a.match.test(n)) { a.id = installed[n]; a.found = true; break; } }
        });
        scanned = true;
        libEls.forEach(function (el, i) { if (apps[i]) el.classList.toggle("missing", !apps[i].found); });
        stageKey = ""; if (view === "library") stageUpdate();
      }, function () {});
    } catch (e) { roverErr(e); }
  }
  scanInstalled();
  function launch(a) {
    pushRecent("app:" + artKey(a.name));
    if (!hasTizen) { toast("Preview: would open " + a.name + " (" + a.id + ")"); return; }
    LAUNCHES[artKey(a.name)] = Date.now(); jset(pk("rover_launches"), LAUNCHES); stageKey = "";
    if (!a.id) { toast(a.name + " isn't on this TV yet. Install it from Samsung Apps, then come back."); return; }
    toast("Opening " + a.name + "\u2026");
    if (playing) toggle();                                // the app gets the speakers
    var fail = function () { disarmReturn(); toast(a.name + " didn't open. It may not be installed on this TV."); };
    armReturn(a.id);
    try { tizen.application.launch(a.id, function () {}, fail); } catch (e) { fail(); }
  }

  // ---------- Come back to Rover Home when the app you opened is closed ----------
  // Rover keeps running in the background (config.xml background-support) and watches the app it opened.
  // When that app stops running, Rover brings itself back to the front. Pressing the remote's Home inside
  // an app leaves it running, so Samsung's Home still works normally.
  var SELF_ID = null;
  try { if (hasTizen) SELF_ID = tizen.application.getCurrentApplication().appInfo.id; } catch (e) {}
  var RET = { id: null, at: 0, seen: false, poll: null, lis: null };
  function armReturn(id) {
    disarmReturn();
    if (!hasTizen || !S.returnHome || !SELF_ID || !id) return;
    RET.id = id; RET.at = Date.now(); RET.seen = false;
    try {
      if (tizen.application.addAppStatusChangeListener)
        RET.lis = tizen.application.addAppStatusChangeListener(function (appId, active) {
          if (appId !== RET.id) return;
          if (active) RET.seen = true; else comeBack("closed");
        }, id);
    } catch (e) { RET.lis = null; }
    RET.poll = setInterval(checkReturn, 1500);
  }
  function checkReturn() {
    if (!RET.id) return;
    if (Date.now() - RET.at > 8 * 3600000) return disarmReturn();
    try {
      tizen.application.getAppsContext(function (list) {
        if (!RET.id) return;
        var running = list.some(function (c) { return c.appId === RET.id; });
        if (running) RET.seen = true;
        else if (RET.seen) comeBack("gone");
      }, function () {});
    } catch (e) {}
  }
  function comeBack(why) {
    if (!RET.id) return;
    var id = RET.id; disarmReturn();
    if (!document.hidden) return;
    logEvt("back from " + id + " (" + why + ")");
    try { tizen.application.launch(SELF_ID, function () {}, function () {}); } catch (e) { roverErr(e); }
  }
  function disarmReturn() {
    clearInterval(RET.poll); RET.poll = null;
    if (RET.lis != null) { try { tizen.application.removeAppStatusChangeListener(RET.lis); } catch (e) {} }
    RET.lis = null; RET.id = null; RET.seen = false;
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      if (playing && !S.bgMusic) toggle();               // don't play over Samsung Home or another app
      return;
    }
    if (RET.id && Date.now() - RET.at > 3000) disarmReturn();
    scanInstalled();                                      // picks up apps installed while you were away
    stageKey = ""; if (view === "library") stageUpdate();
  });

  // ---------- HDMI input (PS5) ----------
  function switchHdmi(n, done) {
    try {
      if (hasTizen && tizen.tvwindow && tizen.tvwindow.setSource) {
        tizen.tvwindow.setSource({ type: "HDMI", number: n }, function () { done(true); }, function () { done(false); }, "MAIN");
        return;
      }
    } catch (e) {}
    done(false);
  }
  // ---------- PS5 transition: tile -> PlayStation blue -> waking -> black -> HDMI; and back ----------
  // Only transform/opacity animate. On the TV the black frame lines up with the input switch so the
  // TV's own HDMI blackout is hidden inside the animation. The Mac preview simulates the PS5.
  var PX = { on: false, phase: "", t: [], live: false };
  function pxEl() {
    var x = $("px"); if (x) return x;
    x = document.createElement("div"); x.id = "px";
    var ico = (DOCK[1] && DOCK[1].icon) || "";
    x.innerHTML = '<div class="px-bg"></div><div class="px-card"></div><i class="px-sweep"></i><i class="px-rings"><b></b><b></b><b></b></i>' +
      '<div class="px-core"><div class="px-orb"><i class="px-arc"></i><i class="px-arc2"></i><div class="px-ico">' + ico + '</div></div>' +
      '<div class="px-title">PlayStation 5</div><div class="px-status" id="px-status">Waking PS5</div>' +
      '<div class="px-dots"><i></i><i></i><i></i></div><div class="px-hint">Back to cancel</div></div>' +
      '<div class="px-sim"><div class="px-sim-t">PS5</div><div class="px-sim-s">HDMI <b id="px-hdmi"></b> &middot; preview of the PS5 screen</div><div class="px-sim-h">Press Back or Home on the remote to return</div></div>' +
      '<div class="px-black"></div>';
    document.body.appendChild(x); return x;
  }
  function pxClear() { PX.t.forEach(clearTimeout); PX.t = []; }
  function pxAt(ms, f) { PX.t.push(setTimeout(f, ms)); }
  function pxPhase(p) { var x = pxEl(); PX.phase = p; x.className = "on " + p; }
  function ps5Tile() { for (var i = 0; i < DOCKV.length; i++) if (DOCKV[i].id === "ps5") return dockEls[i]; return null; }
  function tileBox(el) {
    var x = 0, y = 0, n = el; while (n && n !== document.body) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function setLive(on) {
    PX.live = on; var t = ps5Tile(); if (!t) return;
    t.classList.toggle("ps5-live", on);
    var s = $("sub-ps5"); if (s) s.textContent = on ? "PS5 is on · OK to jump back in" : "HDMI " + inputs.ps5.hdmi + " · switches input";
  }
  function goInput(cfg) {
    var blockedMsg = "This TV won't let apps switch inputs. Press Source and choose HDMI " + cfg.hdmi + ", or turn Anynet+ on so the PS5 switches it for you.";
    if (hasTizen && S.hdmiBlocked) { toast(blockedMsg); return; }
    if (PX.on) return;
    var x = pxEl(), card = x.querySelector(".px-card"), t = ps5Tile();
    $("px-hdmi").textContent = cfg.hdmi;
    if (t) {                                                  // the glass card starts exactly on the tile, then fills the screen
      var b = tileBox(t);
      card.style.transform = "translate(" + b.x + "px," + b.y + "px) scale(" + (b.w / 1920).toFixed(4) + "," + (b.h / 1080).toFixed(4) + ")";
    }
    pxClear(); PX.on = true; pxPhase("start"); void x.offsetWidth;
    $("px-status").textContent = PX.live ? "Jumping back in" : "Waking PS5";
    pxAt(30, function () { pxPhase("grow"); card.style.transform = ""; });
    pxAt(520, function () { pxPhase("wake"); });
    var wakeMs = PX.live ? 900 : 2600;                        // real TV build: driven by the PS5's network status instead
    pxAt(520 + wakeMs, function () { pxPhase("ready"); $("px-status").textContent = "Ready"; });
    pxAt(520 + wakeMs + 650, function () { pxPhase("black"); });
    pxAt(520 + wakeMs + 1050, function () {
      switchHdmi(cfg.hdmi, function (ok) {
        if (hasTizen && !ok) { S.hdmiBlocked = true; jset("rover_hdmiblocked", 1); pxReturn(true); toast(blockedMsg); return; }
        setLive(true);
        if (hasTizen) { pxPhase("session"); pxAt(1500, function () { pxReturn(); }); }   // TV: the PS5 picture is showing now
        else pxPhase("session sim");                                                       // Mac preview: simulated PS5 screen
      });
    });
  }
  function pxReturn(cancelled) {                               // "welcome back": black -> glow collapses -> Home rises back in
    if (!PX.on) return; pxClear();
    if (PX.phase.indexOf("session") < 0 && PX.phase !== "black") { pxPhase("cancel"); pxAt(420, function () { PX.on = false; pxEl().className = ""; }); return; }
    pxPhase("back"); document.body.classList.add("px-return");
    pxAt(60, function () { pxPhase("back go"); });
    pxAt(900, function () { PX.on = false; pxEl().className = ""; document.body.classList.remove("px-return"); if (!cancelled) toast("Welcome back"); });
    showView("home"); state.zone = "dock"; var t = ps5Tile(); if (t) state.home = dockEls.indexOf(t); paint();
  }
  function pxKey(k) {
    if (k === 10009 || k === 27 || k === 8 || k === 36 || k === 13 && PX.phase.indexOf("session") >= 0) pxReturn();
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && PX.on && PX.phase.indexOf("session") >= 0) pxReturn(); });
  window.RoverPS5 = { go: function () { goInput(inputs.ps5); }, back: function () { pxReturn(); } };

  // =====================================================================
  //  MUSIC
  // =====================================================================
  var HEART = '<svg viewBox="0 0 24 24"><path d="M12 20.5s-7.5-4.6-9.6-9.3A5.4 5.4 0 0 1 12 6.4a5.4 5.4 0 0 1 9.6 4.8c-2.1 4.7-9.6 9.3-9.6 9.3z"/></svg>';
  var LIB = jget(pk("rover_lib"), []), HIST = jget(pk("rover_hist"), []), TASTE = jget(pk("rover_taste"), { moods: {} });
  var Q = { mood: null, items: [], idx: -1 };
  var A = [new Audio(), new Audio()], act = 0, XF = (S.crossfade ? 4000 : 0), playing = false, ttoken = 0, mtoken = 0, loadingMore = false, errs = 0;
  var lastSplash = "", splTimer, lyricsOn = false;
  // Apple Music (optional): plays through MusicKit instead of the two <audio> elements
  var AM = window.RoverAppleMusic, YTP = window.RoverYouTube, ext = null;
  // Sources with their own player (Apple Music, YouTube) instead of the two <audio> elements
  function extFor(t) { return !t ? null : t.provider === "apple" ? AM : t.provider === "youtube" ? YTP : null; }
  function extId(t) { return t.provider === "apple" ? t.appleId : t.ytId; }
  var AMS = { pl: [], songs: [], off: 0, more: false, loading: false, status: "", tried: false };
  A.forEach(function (a) { a.preload = "auto"; });

  function moodById(id) { for (var i = 0; i < MOODS.length; i++) if (MOODS[i].id === id) return MOODS[i]; return null; }
  function cur() { return Q.items[Q.idx]; }
  function slim(t) { return { id: t.id, title: t.title, artist: t.artist, art: t.art || "", src: t.src || "", lazy: t.lazy, ident: t.ident, lic: t.lic || "", live: t.live, mood: t.mood, provider: t.provider, appleId: t.appleId, ytId: t.ytId, lyr: (t.lyr || "").slice(0, 6000) }; }
  function isSaved(t) { if (!t) return false; for (var i = 0; i < LIB.length; i++) if (LIB[i].id === t.id) return true; return false; }
  function toggleSave(t) {
    if (!t) return;
    var at = -1; LIB.forEach(function (x, k) { if (x.id === t.id) at = k; });
    if (at >= 0) { LIB.splice(at, 1); toast("Removed from Library"); }
    else {
      LIB.unshift(slim(t));
      if (t.mood) { TASTE.moods[t.mood] = (TASTE.moods[t.mood] || 0) + 3; jset(pk("rover_taste"), TASTE); }
      toast("Saved to Library");
    }
    jset(pk("rover_lib"), LIB);
    if (ms.b.si >= LIB.length) ms.b.si = Math.max(0, LIB.length - 1);
    refreshSaved();
  }
  function refreshSaved() {
    if (ms.tab === 2) renderLibrary();
    ["fy-row", "rec-row", "sav-grid"].forEach(function (id) {
      var kids = $(id).children;
      for (var i = 0; i < kids.length; i++) if (kids[i]._t) kids[i].classList.toggle("saved", isSaved(kids[i]._t));
    });
    var rs = $("s-res").children;
    for (var j = 0; j < rs.length; j++) if (rs[j]._t) rs[j].classList.toggle("saved", isSaved(rs[j]._t));
    musicUI();
  }

  // ---------- Data sources (mixed, never labelled) ----------
  function getJSON(url, cb) {
    var x = new XMLHttpRequest();
    x.open("GET", url); x.timeout = 12000;
    x.onload = function () { try { cb(null, JSON.parse(x.responseText)); } catch (e) { cb(e); } };
    x.onerror = x.ontimeout = function () { cb(new Error("network")); };
    x.send();
  }
  function ccName(u) {
    if (!u) return "";
    var m = /creativecommons\.org\/licenses\/([a-z\-]+)\/([\d.]+)/i.exec(u);
    if (m) return "CC " + m[1].toUpperCase() + " " + m[2];
    if (/publicdomain|\/zero\//i.test(u)) return "Public domain";
    return "";
  }
  function jamURL(n, extra) {
    return "https://api.jamendo.com/v3.0/tracks/?client_id=" + encodeURIComponent(CFG.jamendoClientId) +
      "&format=json&limit=" + n + "&audioformat=mp32&imagesize=600&include=licenses+lyrics" + extra;
  }
  function mapJam(list) {
    return list.filter(function (t) { return t.audio; }).map(function (t) {
      return { id: "j" + t.id, title: t.name, artist: t.artist_name, art: t.album_image || t.image || "", src: t.audio, lic: ccName(t.license_ccurl), lyr: t.lyrics || "" };
    });
  }
  function mapArch(docs, n) {
    return shuffle(docs).slice(0, n).map(function (d) {
      return { id: "a" + d.identifier, lazy: "archive", ident: d.identifier, title: first(d.title) || d.identifier, artist: first(d.creator) || "Various artists",
        art: "https://archive.org/services/img/" + d.identifier, lic: ccName(first(d.licenseurl)) };
    });
  }
  function mapRadio(list, n) {
    return shuffle(list.filter(function (s) { return s.url_resolved; })).slice(0, n).map(function (s) {
      return { id: "r" + s.stationuuid, title: (s.name || "Radio").replace(/^\s+|\s+$/g, ""), artist: "Live radio", art: s.favicon || "", src: s.url_resolved, live: true };
    });
  }
  var ARCH_FL = "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=licenseurl&output=json";
  var ARCH_COL = "mediatype:audio AND collection:(netlabels OR opensource_audio) AND ";

  // Audius: free, full-length songs from independent artists (no key). Hosts rotate, so ask for one first.
  var AUD = { host: null, wait: [] };
  function audHost(cb) {
    if (AUD.host) return cb(AUD.host);
    AUD.wait.push(cb); if (AUD.wait.length > 1) return;
    getJSON("https://api.audius.co", function (e, j) {
      var hs = (!e && j && Array.isArray(j.data)) ? j.data : [];
      AUD.host = hs.length ? pickOne(hs) : "https://discoveryprovider.audius.co";
      var w = AUD.wait; AUD.wait = []; w.forEach(function (f) { f(AUD.host); });
    });
  }
  function mapAud(list, n, h) {
    return shuffle(list.filter(function (t) { return t && t.id && t.is_streamable !== false && (t.duration || 0) > 45; })).slice(0, n).map(function (t) {
      var aw = t.artwork || {};
      return { id: "u" + t.id, title: t.title, artist: (t.user && t.user.name) || "Independent artist", art: aw["480x480"] || aw["1000x1000"] || aw["150x150"] || "",
        src: h + "/v1/tracks/" + encodeURIComponent(t.id) + "/stream?app_name=RoverHome", lic: "" };
    });
  }
  // Openverse: one free search across Jamendo, ccMixter remixes and Wikimedia recordings (no key).
  var OV_SRC = "&source=jamendo,ccmixter,wikimedia_audio";
  function ovURL(q, n) { return "https://api.openverse.org/v1/audio/?q=" + encodeURIComponent(q) + "&page_size=" + n + "&mature=false" + OV_SRC; }
  function mapOV(list, n) {
    return shuffle((list || []).filter(function (t) { return t && t.url && (!t.duration || (t.duration > 45000 && t.duration < 1200000)); })).slice(0, n).map(function (t) {
      return { id: "o" + t.id, title: t.title || "Untitled", artist: t.creator || "Independent artist",
        art: t.thumbnail || (t.audio_set && t.audio_set.thumbnail) || "", src: t.url,
        lic: t.license ? "CC " + String(t.license).toUpperCase() + (t.license_version ? " " + t.license_version : "") : "" };
    });
  }
  // hearthis.at: DJ remixes, edits and electronic music, free to stream (no key).
  var HT_WORD = { chill: "chillout", focus: "ambient", night: "deep house", energy: "house", jazz: "jazz", lofi: "lofi", acoustic: "acoustic" };
  function htURL(q, n) { return "https://api-v2.hearthis.at/search/?t=" + encodeURIComponent(q) + "&type=tracks&page=1&count=" + n; }
  function mapHT(list, n, maxSec) {
    return shuffle((Array.isArray(list) ? list : []).filter(function (t) { var d = +t.duration || 0; return t && t.stream_url && d > 45 && d < (maxSec || 900); })).slice(0, n).map(function (t) {
      return { id: "h" + t.id, title: t.title || "Untitled", artist: (t.user && (t.user.username || t.user.permalink)) || "hearthis.at artist",
        art: t.artwork_url || t.thumb || (t.user && t.user.avatar_url) || "", src: t.stream_url, lic: "" };
    });
  }
  // SomaFM: listener-supported internet radio (about 30 stations).
  var SOMA = null;
  function somaStations(cb) {
    if (SOMA) return cb(SOMA);
    getJSON("https://somafm.com/channels.json", function (e, j) {
      SOMA = (!e && j && Array.isArray(j.channels)) ? j.channels.map(function (c) {
        return { id: "s" + c.id, title: c.title, artist: "SomaFM \u00B7 " + (c.genre || "radio").split("|")[0], art: c.largeimage || c.xlimage || c.image || "",
          src: "https://ice1.somafm.com/" + c.id + "-128-mp3", live: true, lic: "", genre: ((c.genre || "") + " " + (c.description || "")).toLowerCase() };
      }) : [];
      cb(SOMA);
    });
  }
  var PROV = {
    openverse: function (m, n, cb) {
      var q = pickOne(m.jamendo || m.archive || [m.name]);
      getJSON(ovURL(q, 40), function (e, j) { cb(e || !j || !j.results ? [] : mapOV(j.results, n)); });
    },
    hearthis: function (m, n, cb) {
      var q = HT_WORD[m.id] || pickOne(m.jamendo || [m.name]);
      getJSON(htURL(q, 40), function (e, j) { cb(e ? [] : mapHT(j, n, 900)); });
    },
    audius: function (m, n, cb) {
      if (!m.audius) return cb([]);
      audHost(function (h) {
        getJSON(h + "/v1/tracks/trending?genre=" + encodeURIComponent(pickOne(m.audius)) + "&time=" + pickOne(["week", "month", "allTime"]) + "&app_name=RoverHome", function (e, j) {
          cb(e || !j || !Array.isArray(j.data) ? [] : mapAud(j.data, n, h));
        });
      });
    },
    jamendo: function (m, n, cb) {
      if (!CFG.jamendoClientId || !m.jamendo) return cb([]);
      getJSON(jamURL(n, "&offset=" + Math.floor(Math.random() * 60) + "&fuzzytags=" + m.jamendo.join("+") + "&order=popularity_month"), function (e, j) {
        cb(e || !j || !j.results ? [] : mapJam(j.results));
      });
    },
    archive: function (m, n, cb) {
      if (!m.archive) return cb([]);
      var subj = m.archive.map(function (s) { return 'subject:"' + s + '"'; }).join(" OR ");
      function go(page) {
        getJSON("https://archive.org/advancedsearch.php?q=" + encodeURIComponent(ARCH_COL + "(" + subj + ")") + ARCH_FL + "&rows=60&page=" + page, function (e, j) {
          var docs = (!e && j && j.response && j.response.docs) || [];
          if (!docs.length && page > 1) return go(1);
          cb(mapArch(docs, n));
        });
      }
      go(1 + Math.floor(Math.random() * 2));
    },
    radio: function (m, n, cb) {
      var tag = m.radio || pickOne(["lofi", "chillout", "jazz", "electronic", "pop", "rock"]);
      var got = [], left = 2;
      function fin(list) { got.push(list); if (--left === 0) cb(interleave(got).slice(0, n)); }
      getJSON("https://de1.api.radio-browser.info/json/stations/search?tag=" + encodeURIComponent(tag) + "&limit=40&hidebroken=true&is_https=true&order=clickcount&reverse=true", function (e, j) {
        fin(e || !Array.isArray(j) ? [] : mapRadio(j, n));
      });
      somaStations(function (all) {
        var want = m.radio ? all.filter(function (s) { return s.genre.indexOf(m.radio) >= 0 || s.genre.indexOf(tag) >= 0; }) : all;
        fin(shuffle((want.length ? want : all).slice()).slice(0, Math.max(2, Math.ceil(n / 2))));
      });
    }
  };
  // One quiet check at startup: how many songs each source returns (shows in Tizen Studio's console).
  setTimeout(function () {
    var m = MOODS[0];
    ["audius", "jamendo", "archive", "openverse", "hearthis", "radio"].forEach(function (k) {
      try { PROV[k](m, 8, function (l) { try { console.log("[Rover sources] " + k + ": " + (l ? l.length : 0)); } catch (e) {} }); } catch (e) { console.log("[Rover sources] " + k + ": error"); }
    });
  }, 4000);
  function interleave(buckets) {
    var all = [], max = 0;
    buckets.forEach(function (b) { max = Math.max(max, b.length); });
    for (var i = 0; i < max; i++) buckets.forEach(function (b) { if (b[i]) all.push(b[i]); });
    return all;
  }
  function fetchMood(m, n, cb) {
    var srcs = m.radioOnly ? ["radio"] : ["audius", "jamendo", "archive", "openverse", "hearthis"], left = srcs.length, buckets = [];
    function tag(list) { list.forEach(function (t) { t.mood = m.id; }); return list; }
    function done() {
      var all = interleave(buckets);
      if (all.length < 3 && !m.radioOnly) return PROV.radio(m, n, function (l) { cb(tag(l)); });
      cb(tag(all));
    }
    srcs.forEach(function (s) { PROV[s](m, n, function (list) { buckets.push(list); if (--left === 0) done(); }); });
  }
  function encPath(p) { return p.split("/").map(encodeURIComponent).join("/"); }
  function resolveTrack(t, cb) {
    if (t.provider === "apple" || t.provider === "youtube") return cb(!!extId(t));
    if (t.src) return cb(true);
    if (t.lazy !== "archive") return cb(false);
    getJSON("https://archive.org/metadata/" + encodeURIComponent(t.ident), function (e, j) {
      var files = (!e && j && j.files) || [];
      var mp3 = files.filter(function (f) { return /mp3/i.test(f.format || "") && !/sample/i.test(f.format || ""); });
      if (!mp3.length) return cb(false);
      var vbr = mp3.filter(function (f) { return /vbr/i.test(f.format); });
      var f = pickOne(vbr.length ? vbr : mp3);
      t.src = "https://archive.org/download/" + encodeURIComponent(t.ident) + "/" + encPath(f.name);
      if (f.title) t.title = f.title;
      if (f.creator) t.artist = f.creator;
      cb(true);
    });
  }

  // ---------- Taste + recommendations ----------
  function topMoodIds(n) {
    var ids = MOODS.filter(function (m) { return !m.radioOnly; }).map(function (m) { return m.id; });
    var has = ids.some(function (id) { return TASTE.moods[id] > 0; });
    if (!has) ids = shuffle(ids);
    else ids.sort(function (a, b) { return (TASTE.moods[b] || 0) - (TASTE.moods[a] || 0); });
    return ids.slice(0, n);
  }
  var fy = [], fyAt = 0, fyLoading = false;
  function loadForYou(force) {
    var now = Date.now();
    if (fyLoading || (!force && fy.length && now - fyAt < 10 * 60 * 1000)) return;
    fyLoading = true;
    var ids = topMoodIds(2), list = ids.map(moodById), buckets = [], left = list.length;
    var hasTaste = ids.some(function (id) { return TASTE.moods[id] > 0; });
    $("fy-title").textContent = hasTaste ? "Made for you \u00B7 " + list.map(function (m) { return m.name; }).join(" & ") : "Fresh picks to start";
    if (!fy.length) { $("fy-row").innerHTML = '<div class="empty">Finding music you\'ll like\u2026</div>'; fyEls = []; }
    list.forEach(function (m) {
      fetchMood(m, 8, function (items) {
        buckets.push(items);
        if (--left === 0) {
          fyLoading = false; fyAt = Date.now();
          var seen = {}; LIB.forEach(function (x) { seen[x.id] = 1; });
          fy = interleave(buckets).filter(function (t) { if (seen[t.id]) return false; seen[t.id] = 1; return true; }).slice(0, 10);
          renderFY();
        }
      });
    });
  }

  // ---------- Cards ----------
  function seedGrad(t) { var h = hashStr(t.id || t.title) % 360; return "linear-gradient(150deg,hsl(" + h + ",70%,46%),hsl(" + ((h + 55) % 360) + ",62%,20%))"; }
  function makeCard(t) {
    var el = document.createElement("div");
    el.className = "card" + (isSaved(t) ? " saved" : ""); el._t = t;
    var a = document.createElement("div"); a.className = "cart"; a.style.background = seedGrad(t);
    if (t.art) { var im = new Image(); im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); }; im.src = t.art; a.appendChild(im); }
    var b = document.createElement("div"); b.className = "badge"; b.innerHTML = HEART; a.appendChild(b);
    var ct = document.createElement("div"); ct.className = "ct"; ct.textContent = t.title;
    var ca = document.createElement("div"); ca.className = "ca"; ca.textContent = t.artist;
    el.appendChild(a); el.appendChild(ct); el.appendChild(ca);
    return el;
  }
  var fyEls = [], recEls = [], savEls = [], amPlEls = [], amEls = [], vibeEls = [], tabEls = [], resEls = [], results = [];
  function fillCards(box, items, store) {
    box.innerHTML = ""; store.length = 0;
    items.forEach(function (t) { var c = makeCard(t); box.appendChild(c); store.push(c); });
  }
  function renderFY() {
    if (!fy.length) { $("fy-row").innerHTML = '<div class="empty">Couldn\'t load picks. Try a vibe below.</div>'; fyEls = []; paint(); return; }
    fyEls = []; fillCards($("fy-row"), fy, fyEls); paint();
  }
  function renderLibrary() {
    recEls = []; savEls = [];
    $("lib-t1").style.display = HIST.length ? "" : "none";
    if (HIST.length) fillCards($("rec-row"), HIST, recEls); else $("rec-row").innerHTML = "";
    if (LIB.length) fillCards($("sav-grid"), LIB, savEls);
    else $("sav-grid").innerHTML = '<div class="empty">Nothing saved yet. Press the Red button on any song to keep it here.</div>';
    renderApple();
    paint();
    amAuto();
  }

  // ---------- Apple Music library ----------
  function amOn() { return !!(AM && AM.isConfigured()); }
  function ytPlaylists() {
    return ((window.ROVER_MUSIC_CFG || {}).youtubePlaylists || []).filter(function (p) { return p && p.id; }).map(function (p) {
      return { id: "ytpl:" + p.id, ytList: p.id, title: p.name || "YouTube playlist", artist: "Playlist", art: p.art || "" };
    });
  }
  function plOn() { return amOn() || (YTP && YTP.isConfigured() && ytPlaylists().length > 0); }
  function amPlaylists() {
    if (!amOn() || AMS.pl.length) return ytPlaylists().concat(AMS.pl);
    return ytPlaylists().concat([{ id: "applepl:connect", connect: true, art: "",
      title: AMS.loading ? "Loading your library\u2026" : (AMS.status || "Connect Apple Music"),
      artist: AMS.loading ? "Apple Music" : "Press OK to sign in" }]);
  }
  function renderApple() {
    amPlEls = []; amEls = [];
    var on = plOn();
    $("am-t1").hidden = $("am-plrow").hidden = !on;
    $("am-t2").hidden = !amOn();
    $("am-t1").textContent = amOn() ? "Playlists" : "YouTube playlists";
    if (!on) { $("am-pl").innerHTML = ""; $("am-grid").innerHTML = ""; return; }
    fillCards($("am-pl"), amPlaylists(), amPlEls);
    if (AMS.songs.length) fillCards($("am-grid"), AMS.songs, amEls); else $("am-grid").innerHTML = "";
    amCount();
  }
  function amCount() {
    $("am-t2").textContent = "Apple Music songs" + (AMS.songs.length ? " \u00B7 " + AMS.songs.length + (AMS.more ? "+" : "") : "");
  }
  function amRefresh() { if (ms.tab === 2) { renderApple(); paint(); } }
  // Load silently if this TV already signed in before (MusicKit remembers the session).
  function amAuto() {
    if (!amOn() || AMS.tried) return;
    AMS.tried = true;
    AM.prepare(function (err) { if (!err && AM.isAuthorized()) amConnect(); });
  }
  function amConnect() {
    if (!amOn() || AMS.loading) return;
    AMS.loading = true; AMS.status = ""; amRefresh();
    AM.libraryPlaylists(function (err, pl) {
      if (err) { AMS.loading = false; AMS.status = "Couldn't connect \u00B7 OK to retry"; toast(err.message); amRefresh(); return; }
      AMS.pl = pl;
      AM.libraryPage(0, function (e2, page) {
        AMS.loading = false;
        if (e2) toast(e2.message);
        AMS.songs = page.items; AMS.off = page.count || 0; AMS.more = page.more;
        if (!AMS.pl.length && !AMS.songs.length) AMS.status = "Your Apple Music library is empty";
        amRefresh();
      });
    });
  }
  function amMore() {
    if (!AMS.more || AMS.loading) return;
    AMS.loading = true;
    AM.libraryPage(AMS.off, function (err, page) {
      AMS.loading = false;
      if (err) { AMS.more = false; return; }
      AMS.off += page.count || 0; AMS.more = page.more;
      var seen = {}; AMS.songs.forEach(function (x) { seen[x.id] = 1; });
      page.items.forEach(function (t) {
        if (seen[t.id]) return; seen[t.id] = 1;
        AMS.songs.push(t);
        if (ms.tab === 2) { var c = makeCard(t); $("am-grid").appendChild(c); amEls.push(c); }
      });
      if (ms.tab === 2) { amCount(); paint(); }
    });
  }
  function amOpenPlaylist(p) {
    if (!p) return;
    if (p.connect) { amConnect(); return; }
    toast("Opening " + p.title + "\u2026");
    (p.ytList ? function (cb) { YTP.playlist(p.ytList, cb); } : function (cb) { AM.playlistTracks(p.plId, cb); })(function (err, items) {
      if (err || !items.length) { toast(err ? err.message : "That playlist has no playable songs."); return; }
      playList(items, 0);
    });
  }

  // Vibes row
  MOODS.forEach(function (m) {
    var el = document.createElement("div");
    el.className = "vp"; el.style.setProperty("--mc", m.color); el.textContent = m.name;
    $("vibe-row").appendChild(el); vibeEls.push(el);
  });
  // Tabs
  TABS.forEach(function (n, i) {
    var el = document.createElement("div"); el.className = "tab"; el.textContent = n;
    $("m-tabs").appendChild(el); tabEls.push(el);
  });

  // ---------- Keyboard (search) ----------
  var KB = [];
  ["abcdefghij", "klmnopqrst", "uvwxyz'-&."].forEach(function (r) { KB.push(r.split("").map(function (c, i) { return { l: c.toUpperCase(), v: c, c0: i, sp: 1 }; })); });
  KB.push("0123456789".split("").map(function (c, i) { return { l: c, v: c, c0: i, sp: 1 }; }));
  KB.push([{ l: "Space", v: " ", c0: 0, sp: 3, k: "sp" }, { l: "\u232B", k: "del", c0: 3, sp: 2 }, { l: "Clear", k: "clr", c0: 5, sp: 2 }, { l: "Search", k: "go", c0: 7, sp: 3 }]);
  var kbEls = [];
  KB.forEach(function (row) {
    var r = [];
    row.forEach(function (k) {
      var el = document.createElement("div");
      el.className = "key" + (k.k ? " act" : "") + (k.k === "go" ? " go" : ""); el.textContent = k.l; el.style.gridColumn = "span " + k.sp;
      $("kb").appendChild(el); r.push(el);
    });
    kbEls.push(r);
  });
  function sUpdate() {
    $("s-text").textContent = ms.s.q;
    $("s-ph").className = ms.s.q ? "hide" : "";
  }
  var sTimer, stoken = 0;
  function typeKey(k) {
    var s = ms.s;
    if (k.k === "del") s.q = s.q.slice(0, -1);
    else if (k.k === "clr") s.q = "";
    else if (k.k === "go") { clearTimeout(sTimer); doSearch(); return; }
    else if (s.q.length < 40) s.q += k.v;
    sUpdate();
    clearTimeout(sTimer); sTimer = setTimeout(doSearch, 750);
  }
  function renderResults(msg) {
    var box = $("s-res"); box.innerHTML = ""; resEls = [];
    $("s-res").style.transform = "translateY(0)";
    if (msg) { var d = document.createElement("div"); d.className = "empty"; d.textContent = msg; box.appendChild(d); return; }
    results.forEach(function (t) {
      var r = document.createElement("div"); r.className = "srow" + (isSaved(t) ? " saved" : ""); r._t = t;
      var th = document.createElement("div"); th.className = "th"; th.style.background = seedGrad(t);
      if (t.art) { var im = new Image(); im.onerror = function () { if (im.parentNode) im.parentNode.removeChild(im); }; im.src = t.art; th.appendChild(im); }
      var mt = document.createElement("div"); mt.className = "mt";
      var a = document.createElement("div"); a.className = "t"; a.textContent = t.title;
      var b = document.createElement("div"); b.className = "a"; b.textContent = t.artist;
      mt.appendChild(a); mt.appendChild(b);
      var h = document.createElement("div"); h.className = "hrt"; h.innerHTML = HEART;
      r.appendChild(th); r.appendChild(mt); r.appendChild(h);
      box.appendChild(r); resEls.push(r);
    });
  }
  function doSearch() {
    var q = ms.s.q.replace(/^\s+|\s+$/g, "");
    var my = ++stoken;
    if (q.length < 2) { results = []; renderResults(""); paint(); return; }
    renderResults("Searching\u2026");
    var amOn = !!(AM && AM.isConfigured()), ytOn = !!(YTP && YTP.isConfigured()), cleaned = q.replace(/["\\]/g, " "), left = 6 + (amOn ? 1 : 0) + (ytOn ? 1 : 0), buckets = [];
    function fin(list) {
      buckets.push(list);
      if (--left > 0 || my !== stoken) return;
      results = interleave(buckets).slice(0, 24);
      results.forEach(function (t) { if (!t.mood) t.mood = (topMoodIds(1)[0]); });
      renderResults(results.length ? "" : "No results. Try another word.");
      paint();
    }
    if (amOn) AM.searchCatalog(q, function (e, list) { fin(e ? [] : list); });
    if (ytOn) YTP.search(q, function (e, list) { if (e) toast(e.message); fin(e ? [] : list); });
    getJSON(ovURL(q, 20), function (e, j) { fin(e || !j || !j.results ? [] : mapOV(j.results, 10)); });
    getJSON(htURL(q, 30), function (e, j) { fin(e ? [] : mapHT(j, 10, 1500)); });
    audHost(function (h) {
      getJSON(h + "/v1/tracks/search?query=" + encodeURIComponent(q) + "&app_name=RoverHome", function (e, j) { fin(e || !j || !Array.isArray(j.data) ? [] : mapAud(j.data, 12, h)); });
    });
    if (CFG.jamendoClientId) getJSON(jamURL(12, "&search=" + encodeURIComponent(q)), function (e, j) { fin(e || !j || !j.results ? [] : mapJam(j.results)); }); else fin([]);
    getJSON("https://archive.org/advancedsearch.php?q=" + encodeURIComponent(ARCH_COL + '(title:("' + cleaned + '") OR creator:("' + cleaned + '"))') + ARCH_FL + "&rows=30", function (e, j) {
      fin(e || !j || !j.response ? [] : mapArch(j.response.docs || [], 10));
    });
    getJSON("https://de1.api.radio-browser.info/json/stations/search?name=" + encodeURIComponent(q) + "&limit=20&hidebroken=true&is_https=true&order=clickcount&reverse=true", function (e, j) {
      fin(e || !Array.isArray(j) ? [] : mapRadio(j, 5));
    });
  }

  // ---------- Playback engine ----------
  function fadeVol(a, to, ms2, done) {
    clearInterval(a._f);
    var from = a.volume, steps = Math.max(1, Math.round(ms2 / 50)), i = 0;
    a._f = setInterval(function () {
      i++;
      try { a.volume = Math.max(0, Math.min(1, from + (to - from) * i / steps)); } catch (e) {}
      if (i >= steps) { clearInterval(a._f); if (done) done(); }
    }, 50);
  }
  function startMood(m) {
    var my = ++mtoken;
    Q = { mood: m, items: [], idx: -1 };
    toast("Tuning " + m.name + "\u2026");
    fetchMood(m, 16, function (items) {
      if (my !== mtoken) return;
      if (!items.length) {
        items = demo.map(function (d) { return { id: "d" + d.src, title: d.title, artist: d.artist, art: "", src: d.src, lic: "", mood: m.id, lyr: d.lyr || "" }; });
        toast("Couldn't reach the music sources. Playing demo tones.");
      }
      Q.items = items;
      setTab(3);
      startTrack(0, false);
    });
  }
  function playList(items, idx) {
    if (!items.length) return;
    ++mtoken;
    var t0 = items[idx], mood = moodById(t0.mood) || moodById(topMoodIds(1)[0]);
    Q = { mood: mood, items: items.slice(), idx: -1 };
    setTab(3);
    startTrack(idx, false);
  }
  function startTrack(i, xf) {
    if (i < 0 || i >= Q.items.length) return;
    var my = ++ttoken, t = Q.items[i];
    Q.idx = i;
    musicUI();
    resolveTrack(t, function (ok) {
      if (my !== ttoken) return;
      if (!ok) {
        Q.items.splice(i, 1);
        if (!Q.items.length) { playing = false; musicUI(); return; }
        return startTrack(Math.min(i, Q.items.length - 1), xf);
      }
      var P = extFor(t);
      if (P) {
        A.forEach(function (x) { clearInterval(x._f); x.pause(); });
        if (ext && ext !== P) ext.pause();
        ext = P; playing = true;
        P.play(extId(t), function (err) {
          if (my !== ttoken) return;
          if (err) { ext = null; toast(err.message); failSkip(); }
        });
        onTrackStart(t);
        musicUI(); ensureQueue(false); ytLayout();
        return;
      }
      if (ext) { ext.pause(); ext = null; ytLayout(); }
      var old = A[act], nu = A[1 - act];
      act = 1 - act;
      clearInterval(nu._f); nu._xf = false; nu.src = t.src;
      try { nu.volume = xf ? 0 : 1; } catch (e) {}
      var p = nu.play();
      if (p && p.catch) p.catch(function () { if (my === ttoken) failSkip(); });
      if (xf && XF > 0 && !old.paused) { fadeVol(nu, 1, XF); fadeVol(old, 0, XF, function () { old.pause(); }); }
      else { clearInterval(old._f); old.pause(); try { nu.volume = 1; } catch (e) {} }
      playing = true;
      onTrackStart(t);
      musicUI(); ensureQueue(false);
    });
  }
  function failSkip() {
    errs++;
    if (errs > 5) { playing = false; musicUI(); toast("Having trouble playing. Check your connection."); errs = 0; return; }
    setTimeout(function () { nextTrack(false); }, 500);
  }
  function nextTrack(xf) {
    var n = Q.idx + 1;
    if (n >= Q.items.length) return ensureQueue(true);
    startTrack(n, xf);
  }
  function prevTrack() {
    if (ext) {
      if (ext.currentTime() > 3 || Q.idx <= 0) { ext.seek(0); return; }
      return startTrack(Q.idx - 1, false);
    }
    var a = A[act];
    if (a.currentTime > 3 || Q.idx <= 0) { a.currentTime = 0; return; }
    startTrack(Q.idx - 1, false);
  }
  function toggle() {
    if (!Q.items.length) { showView("music"); return; }
    if (ext) {
      if (ext.isPlaying()) { ext.pause(); playing = false; } else { ext.resume(); playing = true; }
      musicUI(); return;
    }
    var a = A[act];
    if (a.paused) { a.play(); playing = true; } else { a.pause(); playing = false; }
    musicUI();
  }
  function ensureQueue(thenNext) {
    if (!Q.mood || loadingMore) return;
    if (!thenNext && Q.items.length - Q.idx > 4) return;
    loadingMore = true;
    var my = mtoken;
    fetchMood(Q.mood, 14, function (items) {
      loadingMore = false;
      if (my !== mtoken) return;
      var seen = {};
      Q.items.forEach(function (x) { seen[x.id || x.src] = 1; });
      items.forEach(function (x) { var k = x.id || x.src; if (!seen[k]) { seen[k] = 1; Q.items.push(x); } });
      musicUI();
      if (thenNext) startTrack(Q.idx + 1 < Q.items.length ? Q.idx + 1 : 0, false);
    });
  }
  A.forEach(function (a) {
    a.addEventListener("timeupdate", function () {
      if (a !== A[act]) return;
      errs = 0;
      var d = a.duration || 0, t = cur();
      $("m-cur").textContent = fmt(a.currentTime);
      if (t && t.live) { $("m-dur").textContent = "LIVE"; $("m-dur").className = "live"; $("m-fill").className = "live"; }
      else {
        $("m-dur").textContent = fmt(d); $("m-dur").className = ""; $("m-fill").className = "";
        $("m-fill").style.width = d ? (a.currentTime / d * 100) + "%" : "0%";
        if (d && isFinite(d)) updLyrics(a.currentTime / d, a.currentTime);
        if (d && isFinite(d) && d - a.currentTime < XF / 1000 + 0.3 && !a._xf && Q.idx + 1 < Q.items.length) { a._xf = true; nextTrack(true); }
      }
    });
    a.addEventListener("ended", function () { if (a === A[act]) nextTrack(false); });
    a.addEventListener("error", function () { if (a === A[act] && a.src) failSkip(); });
  });
  if (AM) AM.onEnded(function () { if (ext === AM) nextTrack(false); });
  if (YTP) {
    YTP.onEnded(function () { if (ext === YTP) nextTrack(false); });
    YTP.onError(function (err) {
      if (ext !== YTP) return;
      if (err.code === 153) {                       // the whole player is refused, not this one song: stop instead of skipping through the queue
        try { ext.pause && ext.pause(); } catch (e) {}
        ext = null; playing = false; errs = 0; musicUI();
        toast("YouTube won't play from this page. Other music sources still work.");
        return;
      }
      // The uploader blocked this upload in other apps (101/150): find another upload of the same song that allows it
      var t = cur();
      if ((err.code === 101 || err.code === 150) && t && t.provider === "youtube" && (t._alts || 0) < 2 && YTP.search) {
        t._alts = (t._alts || 0) + 1; t._bad = (t._bad || []).concat([t.ytId]);
        var my = ttoken, words = function (x) { return (x || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(function (w) { return w.length > 2; }); };
        toast("That upload is blocked here. Finding another copy\u2026");
        YTP.search(t.artist + " " + t.title + (t._alts > 1 ? " lyrics" : " audio"), function (e, res) {
          if (my !== ttoken) return;
          var need = words(t.title), alt = null;
          (res || []).some(function (r) {
            if (t._bad.indexOf(r.ytId) >= 0) return false;
            var have = words(r.title + " " + r.artist).join(" ");
            var hits = need.filter(function (w) { return have.indexOf(w) >= 0; }).length;
            if (need.length && hits / need.length >= 0.6) { alt = r; return true; }
            return false;
          });
          if (!alt) { toast("No playable copy of that song. Skipping."); failSkip(); return; }
          t.ytId = alt.ytId;
          YTP.play(alt.ytId, function (e2) { if (e2 && my === ttoken) { toast(e2.message); failSkip(); } });
        });
        return;
      }
      toast(err.message); failSkip();
    });
  }
  // YouTube's player must stay visible: big over the artwork on Now Playing, a corner window everywhere else.
  function ytLayout() {
    var w = $("yt-wrap"); if (!w) return;
    var on = ext === YTP;
    w.classList.toggle("on", on);
    if (!on) return;
    var big = view === "music" && ms.tab === 3 && !lyricsOn, aw = $("artwrap");
    w.classList.toggle("big", big);
    if (big && aw) {
      // A framed 16:9 tile on the artwork; the rest of the screen stays Rover's visuals.
      var r = aw.getBoundingClientRect(), tw = Math.max(400, Math.round(r.width * 0.78)), th = Math.round(tw * 9 / 16);
      w.style.left = Math.round(r.left + (r.width - tw) / 2) + "px"; w.style.top = Math.round(r.top + (r.height - th) / 2) + "px";
      w.style.width = tw + "px"; w.style.height = th + "px";
    } else { w.style.left = w.style.top = w.style.width = w.style.height = ""; }
  }
  if (AM || YTP) {
    setInterval(function () {
      if (!ext) return;
      ytLayout();
      var c = ext.currentTime(), d = ext.duration();
      $("m-cur").textContent = fmt(c);
      $("m-dur").textContent = fmt(d); $("m-dur").className = ""; $("m-fill").className = "";
      $("m-fill").style.width = d ? (c / d * 100) + "%" : "0%";
      if (d) updLyrics(c / d, c);
    }, 500);
  }

  // ---------- Per-track visuals: palette, frame, background, lyrics, splash ----------
  var palToken = 0;
  function seedPal(t) {
    var h = hashStr((t.id || "") + t.title) % 360;
    return [hsl2rgb(h, .8, .55), hsl2rgb(h + 45, .75, .5), hsl2rgb(h + 300, .8, .5)];
  }
  function extractPalette(url, cb) {
    var im = new Image(); im.crossOrigin = "anonymous";
    im.onload = function () {
      try {
        var c = document.createElement("canvas"); c.width = c.height = 32;
        var x = c.getContext("2d"); x.drawImage(im, 0, 0, 32, 32);
        var d = x.getImageData(0, 0, 32, 32).data, bins = {};
        for (var i = 0; i < d.length; i += 4) {
          var r = d[i], g = d[i + 1], b = d[i + 2], hsl = rgb2hsl(r, g, b);
          if (hsl[2] < .12 || hsl[2] > .92) continue;
          var bi = Math.floor(hsl[0] / 30), w = .25 + hsl[1] * 2;
          var o = bins[bi] || (bins[bi] = { w: 0, r: 0, g: 0, b: 0 });
          o.w += w; o.r += r * w; o.g += g * w; o.b += b * w;
        }
        var arr = Object.keys(bins).map(function (k) { return bins[k]; }).sort(function (p, q) { return q.w - p.w; });
        if (!arr.length) return cb(null);
        var cols = arr.slice(0, 3).map(function (o) {
          var col = [o.r / o.w, o.g / o.w, o.b / o.w], mx = Math.max(col[0], col[1], col[2]) || 1, f = Math.min(2.2, 205 / mx);
          return col.map(function (v) { return Math.min(255, v * f); });
        });
        while (cols.length < 3) { var hh = rgb2hsl(cols[0][0], cols[0][1], cols[0][2]); cols.push(hsl2rgb(hh[0] + 40 * cols.length, Math.max(.6, hh[1]), .55)); }
        cb(cols);
      } catch (e) { cb(null); }
    };
    im.onerror = function () { cb(null); };
    im.src = url;
  }
  function pickFrame(pal) {
    if (!FRAMES.length) return null;
    var hsl = rgb2hsl(pal[0][0], pal[0][1], pal[0][2]), best = null, bd = 1e9;
    FRAMES.forEach(function (f) {
      var d;
      if (hsl[1] < .16) { if (f.s > .2) return; d = Math.abs(f.l - hsl[2]) * 100; }
      else {
        if (f.s < .16) return;
        var dh = Math.abs(f.h - hsl[0]); dh = Math.min(dh, 360 - dh);
        d = dh + Math.abs(f.s - hsl[1]) * 30 + Math.abs(f.l - Math.min(.5, hsl[2])) * 40;
      }
      if (d < bd) { bd = d; best = f; }
    });
    return best || FRAMES[0];
  }
  var frOn = "fr-a", curFrame = null, heroOn = "hero-a", heroMode = "frame", heroToken = 0;
  function setFrame(f) {
    if (!f) return;
    curFrame = f;
    var next = frOn === "fr-a" ? "fr-b" : "fr-a", el = $(next);
    if (el.getAttribute("data-src") === f.src && $(frOn).getAttribute("data-src") === f.src) return;
    if ($(frOn).getAttribute("data-src") === f.src) return;
    el.style.backgroundImage = 'url("' + f.src + '")'; el.setAttribute("data-src", f.src);
    el.classList.add("on"); $(frOn).classList.remove("on"); frOn = next;
  }
  function applyPalette(pal) {
    setFrame(pickFrame(pal));
    FL.pal = pal;
    var root = $("v-music").style;
    root.setProperty("--g1", rgba(pal[0], .6)); root.setProperty("--g2", rgba(pal[1], .4));
    root.setProperty("--g1s", "rgb(" + pal[0].map(Math.round).join(",") + ")"); root.setProperty("--g2s", "rgb(" + pal[1].map(Math.round).join(",") + ")");
  }
  // Full-bleed hero: the album art itself (or the matched frame when the art is missing / too small)
  function heroShow(src, isFrame) {
    var next = heroOn === "hero-a" ? "hero-b" : "hero-a", el = $(next), cur = $(heroOn);
    if (cur.getAttribute("data-src") === src) { cur.classList.toggle("frame", !!isFrame); return; }
    el.style.backgroundImage = 'url("' + src + '")'; el.setAttribute("data-src", src);
    el.classList.toggle("frame", !!isFrame);
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
    cur.classList.remove("on"); heroOn = next;
  }
  function setHero(t) {
    flowSong(t); return;
    var my = ++heroToken;
    function useFrame() { if (my === heroToken) { heroMode = "frame"; if (curFrame) heroShow(curFrame.src, true); } }
    if (t && t.art && !t.live) {
      heroMode = "art"; heroShow(t.art, false);
      var im = new Image();
      im.onload = function () { if (im.naturalWidth < 480) useFrame(); };
      im.onerror = useFrame;
      im.src = t.art;
    } else useFrame();
  }
  function onTrackStart(t) {
    // history + taste
    HIST = HIST.filter(function (x) { return x.id !== t.id; }); HIST.unshift(slim(t)); HIST = HIST.slice(0, 20); jset(pk("rover_hist"), HIST);
    if (t.mood) { TASTE.moods[t.mood] = (TASTE.moods[t.mood] || 0) + 1; jset(pk("rover_taste"), TASTE); }
    // visuals
    var my = ++palToken, sp = seedPal(t);
    applyPalette(sp); setHero(t);
    if (t.art) extractPalette(t.art, function (p) { if (p && my === palToken) applyPalette(p); });
    renderLyrics(t);
    if (view === "music" && ms.tab === 3) splash(t);
  }
  function splash(t) {
    lastSplash = t.id;
    var s = $("m-splash"), art = $("sp-art");
    $("sp-title").textContent = t.title; $("sp-artist").textContent = t.artist;
    var src = (t.art && !t.live) ? t.art : (curFrame ? curFrame.src : "");
    if (src) { art.style.backgroundImage = 'url("' + src + '")'; art.style.display = ""; art.classList.remove("kb"); void art.offsetWidth; art.classList.add("kb"); s.classList.remove("noart"); }
    else { art.style.display = "none"; s.classList.add("noart"); }
    s.classList.add("show");
    clearTimeout(splTimer); splTimer = setTimeout(function () { s.classList.remove("show"); }, 5200);
  }

  // Lyrics: time-synced from LRCLIB when available (lyrics.js), otherwise the catalog's own text paced by line length
  var lyrLines = [], lyrCur = -1, lyrTimes = null, lyrTok = 0;
  function buildLyr(lines) {
    var box = $("ly-lines"); box.innerHTML = ""; lyrLines = []; lyrCur = -1;
    lyrTimes = lines.length && lines[0].t != null ? [] : null;
    lines.forEach(function (o) {
      var l = (o.text || "").replace(/^\s+|\s+$/g, ""), d = document.createElement("div");
      if (!l) { if (lyrTimes) return; d.className = "ly gap"; }
      else { d.className = "ly"; d.textContent = l; lyrLines.push(d); if (lyrTimes) lyrTimes.push(o.t); }
      box.appendChild(d);
    });
    box.style.transform = "translateY(0)";
  }
  function noLyr(t) {
    var box = $("ly-lines"); box.innerHTML = ""; lyrLines = []; lyrCur = -1; lyrTimes = null;
    var d = document.createElement("div"); d.className = "ly-none";
    d.textContent = t && t.live ? "Live radio has no lyrics." : "No lyrics for this one. Enjoy the visuals.";
    box.appendChild(d); box.style.transform = "translateY(0)"; sideLyr();
  }
  function renderLyrics(t) {
    var tok = ++lyrTok;
    $("ly-title").textContent = t ? t.title : ""; $("ly-artist").textContent = t ? t.artist : "";
    var raw = (t && t.lyr) || "";
    if (raw.replace(/\s/g, "")) { buildLyr(raw.split(/\r?\n/).map(function (x) { return { t: null, text: x }; })); updLyrics(0, 0); }
    else noLyr(t);
    if (!window.RoverLyrics || !t || t.live) return;
    RoverLyrics.get(t, function (r) {
      if (tok !== lyrTok || !r || !r.lines.length) return;           // song changed meanwhile, or nothing found
      if (!r.synced && raw.replace(/\s/g, "")) return;                 // keep the catalog's own text over unsynced text
      buildLyr(r.lines); lyrCur = -1; updLyrics(lastP, lastS); sideLyr();
    });
  }
  // Synced: last line whose time has passed. Unsynced: longer lines get proportionally more time
  function lineAt(p, secs) {
    if (lyrTimes) {
      var x = (secs || 0) + (S.lyrOffset || 0), lo = 0, hi = lyrTimes.length - 1, r = 0;
      while (lo <= hi) { var m = (lo + hi) >> 1; if (lyrTimes[m] <= x) { r = m; lo = m + 1; } else hi = m - 1; }
      return r;
    }
    var tot = 0, w = lyrLines.map(function (e) { var n = Math.max(12, e.textContent.length); tot += n; return n; }), acc = 0;
    for (var i = 0; i < w.length; i++) { acc += w[i]; if (p * tot < acc) return i; }
    return w.length - 1;
  }
  function sideLyr() {
    var el = $("sidelyr"), t = cur(), on = S.sideLyrics && playing && view !== "music" && lyrLines.length;
    if (!on) { el.classList.remove("show"); return; }
    el.classList.toggle("other", view !== "home");
    $("sl-meta").textContent = t ? t.title + " \u00B7 " + t.artist : "";
    var i = Math.max(0, lyrCur), g = function (k) { return lyrLines[k] ? lyrLines[k].textContent : ""; };
    $("sl-prev").textContent = g(i - 1); $("sl-cur").textContent = g(i); $("sl-next").textContent = g(i + 1);
    el.classList.add("show");
  }
  var lastP = 0, lastS = 0;
  function updLyrics(p, secs) {
    lastP = p || 0; lastS = secs || 0;
    if (!lyrLines.length) return;
    var i = lineAt(lastP, lastS);
    if (i === lyrCur) return;
    if (lyrCur >= 0) lyrLines[lyrCur].classList.remove("cur");
    lyrCur = i; var el = lyrLines[i]; el.classList.add("cur"); sideLyr();
    $("ly-lines").style.transform = "translateY(" + (-(el.offsetTop - 230)) + "px)";
  }
  function toggleLyrics() {
    lyricsOn = !lyricsOn;
    $("ms-now").classList.toggle("lyr", lyricsOn);
    $("b-lyr").classList.toggle("on", lyricsOn);
    if (lyricsOn && lyrCur >= 0) { var el = lyrLines[lyrCur]; if (el) $("ly-lines").style.transform = "translateY(" + (-(el.offsetTop - 230)) + "px)"; }
  }

  function musicUI() {
    var t = cur(), m = Q.mood;
    $("m-label").textContent = m ? "Now playing \u00B7 " + m.name : "Now playing";
    $("m-title").textContent = t ? t.title : "Nothing playing";
    $("m-artist").textContent = t ? t.artist : "Pick a vibe";
    $("m-credit").textContent = t && t.lic ? t.lic : "";
    $("i-play").style.display = playing ? "none" : "";
    $("i-pause").style.display = playing ? "" : "none";
    $("artwrap").classList.toggle("playing", playing);
    updEmblem(); sideLyr();
    $("b-heart").classList.toggle("saved", isSaved(t));
    var list = $("m-list"); list.innerHTML = "";
    Q.items.slice(Q.idx + 1, Q.idx + 4).forEach(function (x, i) {
      var r = document.createElement("div"); r.className = "trk";
      r.innerHTML = "<div></div><span></span>";
      r.children[0].textContent = x.title; r.children[1].textContent = x.artist;
      list.appendChild(r);
    });
    $("nowplaying").innerHTML = "";
    if (t && playing) {
      var b = document.createElement("b"); b.textContent = "\u266A";
      $("nowplaying").appendChild(b);
      $("nowplaying").appendChild(document.createTextNode(t.title + " \u2014 " + t.artist));
    }
    var sm = $("sub-music"); if (sm) sm.textContent = (t && playing) ? t.title : "Pick a vibe";
    paint();
  }

  // ---------- Generative background graphics (per-song) ----------
  var G = $("gfx"), gx = G.getContext("2d"), gW = 960, gH = 540, raf = null;
  var gfx = { cur: [[255, 42, 61], [139, 92, 246], [56, 189, 248]], tgt: null, mode: 0, spd: .3, last: 0, t: 0, blobs: [], parts: [], n: 0 };
  gfx.tgt = gfx.cur.map(function (c) { return c.slice(); });
  function gfxSeed(t) {
    var h = hashStr(t.id || t.title), r = rng(h), i;
    gfx.mode = h % 3; gfx.blobs = []; gfx.parts = [];
    for (i = 0; i < 5; i++) gfx.blobs.push({ x: r(), y: r(), ax: .15 + .25 * r(), ay: .12 + .2 * r(), sx: .12 + .2 * r(), sy: .1 + .18 * r(), px: r() * 6.28, py: r() * 6.28, rad: .38 + .35 * r(), c: i % 3 });
    for (i = 0; i < 70; i++) gfx.parts.push({ x: r(), y: r(), vx: (r() - .5) * .02, vy: -.01 - .03 * r(), s: 1 + 3 * r(), p: r() * 6.28, c: i % 3 });
  }
  gfxSeed({ id: "rover" });
  function drawGfx(now) {
    raf = requestAnimationFrame(drawGfx);
    if (now - gfx.last < 33) return;
    var dt = Math.min(.1, (now - gfx.last) / 1000); gfx.last = now;
    gfx.spd += ((playing ? 1 : .25) - gfx.spd) * .05; gfx.t += dt * gfx.spd;
    var i, c, W = gW, H = gH, t = gfx.t;
    for (i = 0; i < 3; i++) for (c = 0; c < 3; c++) gfx.cur[i][c] += (gfx.tgt[i][c] - gfx.cur[i][c]) * .035;
    gx.globalCompositeOperation = "source-over"; gx.clearRect(0, 0, W, H);
    gx.globalCompositeOperation = "lighter";
    gfx.blobs.forEach(function (b) {
      var x = (b.x + b.ax * Math.sin(t * b.sx * 6 + b.px)) * W, y = (b.y + b.ay * Math.sin(t * b.sy * 6 + b.py)) * H, r = b.rad * H * 1.1;
      var g = gx.createRadialGradient(x, y, 0, x, y, r), col = gfx.cur[b.c];
      g.addColorStop(0, rgba(col, .5)); g.addColorStop(1, rgba(col, 0));
      gx.fillStyle = g; gx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    if (gfx.mode === 1) {
      var cx = W * .224, cy = H * .44;
      for (i = 0; i < 5; i++) {
        var ph = (t * .16 + i / 5) % 1, rad = 80 + ph * W * .55;
        gx.strokeStyle = rgba(gfx.cur[i % 3], (1 - ph) * .4); gx.lineWidth = 2 + ph * 14;
        gx.beginPath(); gx.arc(cx, cy, rad, 0, 6.2832); gx.stroke();
      }
    } else if (gfx.mode === 2) {
      gfx.parts.forEach(function (p) {
        var x = ((p.x + p.vx * t * 10) % 1 + 1) % 1 * W, y = ((p.y + p.vy * t * 10) % 1 + 1) % 1 * H;
        var a = .25 + .35 * Math.sin(t * 1.5 + p.p);
        gx.fillStyle = rgba(gfx.cur[p.c], Math.max(.05, a)); gx.beginPath(); gx.arc(x, y, p.s * 1.6, 0, 6.2832); gx.fill();
      });
    }
    gx.globalCompositeOperation = "source-over";
  }
  // ---------- Living background: the song's own artwork, cut into pieces that slowly swirl and blend ----------
  // Drawn small (192x108) and blurred, then stretched to full screen: cheap on the TV, always the song's exact colours.
  var FL = { c: $("flow"), img: null, old: null, fade: 1, pal: null, spd: .8, t: 0, last: 0, raf: null, key: "" };
  FL.x = FL.c.getContext("2d");
  FL.blur = "filter" in FL.x;
  if (!FL.blur) FL.c.classList.add("soft");
  var MOOD_SPEED = { energy: 1.6, chill: .55, focus: .45, night: .65, jazz: .75, lofi: .65, acoustic: .7, radio: .8 };
  function flowSong(t) {
    if (!t) return;
    var key = t.id || t.title; FL.key = key;
    FL.spd = MOOD_SPEED[t.mood] || .8;
    var src = t.art && !t.live ? t.art : "";
    if (!src) { FL.old = FL.img; FL.img = null; FL.fade = 0; return; }
    var im = new Image();
    im.onload = function () { if (key !== FL.key) return; FL.old = FL.img; FL.img = im; FL.fade = 0; };
    im.onerror = function () { if (key !== FL.key) return; FL.old = FL.img; FL.img = null; FL.fade = 0; };
    im.src = src;
  }
  function flowLayer(img, a, t) {
    var x = FL.x, W = 192, H = 108, p = FL.pal || gfx.cur, k;
    x.globalAlpha = a;
    x.fillStyle = "rgb(" + p[0].map(function (v) { return Math.round(v * .22); }).join(",") + ")";
    x.fillRect(0, 0, W, H);
    if (!img) {
      for (k = 0; k < 5; k++) {
        var c = p[k % 3], bx = W * (.5 + .42 * Math.sin(t * .17 * (k + 1) + k * 1.3)), by = H * (.5 + .45 * Math.cos(t * .13 * (k + 1) + k)), r = H * (.75 + .2 * Math.sin(t * .3 + k));
        var g = x.createRadialGradient(bx, by, 0, bx, by, r);
        g.addColorStop(0, rgba(c, .8 * a)); g.addColorStop(1, rgba(c, 0));
        x.fillStyle = g; x.fillRect(0, 0, W, H);
      }
      return;
    }
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, Q = [[0, 0], [.5, 0], [0, .5], [.5, .5]];
    x.drawImage(img, 0, 0, iw, ih, -W * .1, (H - W * 1.2) / 2, W * 1.2, W * 1.2);
    for (k = 0; k < 4; k++) {
      var cx = W * (.25 + .5 * (k % 2)) + Math.sin(t * .13 * (k + 1) + k) * W * .2;
      var cy = H * (.25 + .5 * (k >> 1)) + Math.cos(t * .11 * (k + 2) + k * 2) * H * .28;
      var sz = W * (.8 + .18 * Math.sin(t * .21 + k));
      x.save(); x.translate(cx, cy); x.rotate(t * (k % 2 ? -.11 : .09) * (1 + k * .2) + k * 1.57);
      x.globalAlpha = a * .82;
      x.drawImage(img, Q[k][0] * iw, Q[k][1] * ih, iw / 2, ih / 2, -sz / 2, -sz / 2, sz, sz);
      x.restore();
    }
  }
  function flowDraw(now) {
    FL.raf = requestAnimationFrame(flowDraw);
    if (now - FL.last < 40) return;
    var dt = Math.min(.1, (now - FL.last) / 1000); FL.last = now;
    FL.t += dt * FL.spd * (playing ? 1 : .3);
    FL.fade = Math.min(1, FL.fade + dt / 1.6);
    var x = FL.x;
    x.save();
    if (FL.blur) x.filter = "blur(5px) saturate(1.45)";
    try {
      if (FL.fade < 1) flowLayer(FL.old, 1, FL.t);
      flowLayer(FL.img, FL.fade, FL.t);
    } catch (e) {}
    x.restore();
    if (FL.fade >= 1) FL.old = null;
  }
  function startGfx() { if (!FL.raf) { FL.last = 0; FL.raf = requestAnimationFrame(flowDraw); } }
  function stopGfx() { if (FL.raf) { cancelAnimationFrame(FL.raf); FL.raf = null; } }

  // ---------- Views / tabs ----------
  var SCREENS = ["ms-listen", "ms-search", "ms-library", "ms-now"];
  var HINTS = ["\u25B2 tabs  \u00B7  OK play  \u00B7  Red button saves to Library",
               "Pick letters with the arrows  \u00B7  OK selects  \u00B7  Red saves a result",
               "OK plays  \u00B7  Red removes a saved song",
               "OK selects  \u00B7  Red saves this song  \u00B7  \u2630 shows lyrics"];
  function setTab(i) {
    ms.tab = i;
    $("v-music").classList.toggle("now", i === 3);
    SCREENS.forEach(function (id, k) { $(id).hidden = k !== i; });
    $("m-hint").textContent = HINTS[i];
    if (i === 0) loadForYou(false);
    if (i === 2) renderLibrary();
    if (i === 3) { var t = cur(); if (t && t.id !== lastSplash && view === "music") splash(t); }
    paint(); setTimeout(ytLayout, 350);
  }

  // Align each frosted panel's wallpaper copy with the real wallpaper (offsets ignore transforms) and number tiles for staggered entrance
  function frostAll() {
    var list = document.querySelectorAll(".frost");
    for (var i = 0; i < list.length; i++) {
      var e = list[i], x = 0, y = 0, n = e;
      while (n && n !== document.body) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      e.style.setProperty("--fx", (-x - 1) + "px"); e.style.setProperty("--fy", (-y - 1) + "px");
    }
    ["dock", "lib-grid"].forEach(function (id) {
      var c = $(id); if (!c) return;
      for (var j = 0; j < c.children.length; j++) c.children[j].style.setProperty("--i", j);
    });
  }
  function showView(v) {
    ["library", "music", "rover"].forEach(function (n) {
      var el = $("v-" + n);
      if (n === v) { el.hidden = false; void el.offsetWidth; el.classList.add("in"); }
      else { el.classList.remove("in"); el.hidden = true; }
    });
    view = v; sideLyr(); frostAll();
    if (v === "home") reshuffleTiles(dockEls); else if (v === "library") { reshuffleTiles(libEls); setTimeout(warmPanels, 60); }
    if (v === "music") { ms.inTabs = false; setTab(Q.items.length ? 3 : 0); startGfx(); }
    else { stopGfx(); $("m-splash").classList.remove("show"); }
    paint();
  }
  // Jester emblem (top right of Home): music play / pause, pulses while a song plays
  function updEmblem() {
    $("emblem").classList.toggle("live", playing);
    $("emb-cap").textContent = !Q.items.length ? "Play my vibe" : (playing ? "Pause" : "Play");
  }
  function emblemAction() {
    if (Q.items.length) { toggle(); toast(playing ? "Playing" : "Paused"); }
    else { var m = moodById(topMoodIds(1)[0]); if (m) startMood(m); }
  }
  $("emblem").addEventListener("click", function () { state.zone = "emblem"; paint(); emblemAction(); });
  function openDock(id) {
    pushRecent("dock:" + id);
    if (id === "library") showView("library");
    else if (id === "music") showView("music");
    else if (id === "rover") showView("rover");
    else if (id === "ps5") goInput(inputs.ps5);
  }

  function F(n) { return view === "music" && !ms.inTabs && ms.tab === n; }
  function cardScroll(box, i) { box.style.transform = "translateX(" + (-Math.max(0, i - 4) * 330) + "px)"; }
  function paint() {
    dockEls.forEach(function (e, i) { e.classList.toggle("focus", view === "home" && state.zone === "dock" && i === state.home); });
    var hf = view === "home" && !CC.open && !SQ.open;
    $("emblem").classList.toggle("focus", hf && state.zone === "emblem");
    $("srch").classList.toggle("focus", hf && state.zone === "srch");
    $("prof").classList.toggle("focus", hf && state.zone === "prof");
    $("gear").classList.toggle("focus", hf && state.zone === "gear");
    document.body.classList.toggle("on-home", view === "home");
    ccPaint(); sqPaint();
    libEls.forEach(function (e, i) { e.classList.toggle("focus", view === "library" && i === state.library); });
    if (view === "library") stageUpdate();
    if (view !== "music") return;
    tabEls.forEach(function (e, i) { e.classList.toggle("on", i === ms.tab); e.classList.toggle("focus", ms.inTabs && i === ms.tab); });
    // listen
    fyEls.forEach(function (e, i) { e.classList.toggle("focus", F(0) && ms.l.row === 0 && i === ms.l.ci); });
    vibeEls.forEach(function (e, i) { e.classList.toggle("focus", F(0) && ms.l.row === 1 && i === ms.l.mi); });
    cardScroll($("fy-row"), ms.l.ci);
    // search
    kbEls.forEach(function (row, r) { row.forEach(function (e, k) { e.classList.toggle("focus", F(1) && ms.s.zone === "kb" && r === ms.s.kr && k === ms.s.kk); }); });
    resEls.forEach(function (e, i) { e.classList.toggle("focus", F(1) && ms.s.zone === "res" && i === ms.s.ri); });
    $("s-res").style.transform = "translateY(" + (-Math.max(0, ms.s.ri - 6) * 82) + "px)";
    // library
    recEls.forEach(function (e, i) { e.classList.toggle("focus", F(2) && ms.b.zone === 0 && i === ms.b.ri); });
    savEls.forEach(function (e, i) { e.classList.toggle("focus", F(2) && ms.b.zone === 1 && i === ms.b.si); });
    amPlEls.forEach(function (e, i) { e.classList.toggle("focus", F(2) && ms.b.zone === 2 && i === ms.b.pi); });
    amEls.forEach(function (e, i) { e.classList.toggle("focus", F(2) && ms.b.zone === 3 && i === ms.b.ai); });
    cardScroll($("rec-row"), ms.b.ri);
    cardScroll($("am-pl"), ms.b.pi);
    var ls = $("lib-scroll"), y = 0;
    if (ms.tab === 2) {
      if (ms.b.zone === 1 && savEls[ms.b.si]) y = savEls[ms.b.si].offsetTop - 120;
      else if (ms.b.zone === 2) y = $("am-t1").offsetTop - 120;
      else if (ms.b.zone === 3 && amEls[ms.b.ai]) y = amEls[ms.b.ai].offsetTop - 120;
      y = Math.max(0, y);
    }
    ls.style.transform = "translateY(" + (-y) + "px)";
    // now playing
    ["b-heart", "b-prev", "b-play", "b-next", "b-lyr"].forEach(function (id, i) { $(id).classList.toggle("focus", F(3) && ms.n.zone === "ctl" && i === ms.n.ci); });
    var rows = $("m-list").children;
    for (var i = 0; i < rows.length; i++) rows[i].classList.toggle("focus", F(3) && ms.n.zone === "list" && i === ms.n.li);
  }

  // ---------- App ID finder (yellow) ----------
  function toggleIds() {
    var box = $("ids");
    if (!box.hidden) { box.hidden = true; return; }
    var names = Object.keys(installed).sort();
    box.innerHTML = "<strong>Installed apps</strong> (Back to close)<br>";
    if (!names.length) box.appendChild(document.createTextNode("No list available (open this on the TV)."));
    names.forEach(function (n) { var d = document.createElement("div"); d.textContent = n + " \u2014 " + installed[n]; box.appendChild(d); });
    box.hidden = false;
  }

  // ---------- Remote ----------
  if (hasTizen && tizen.tvinputdevice) {
    ["ColorF0Red", "ColorF1Green", "ColorF2Yellow", "ColorF3Blue", "MediaPlay", "MediaPause", "MediaPlayPause", "MediaStop", "MediaFastForward", "MediaRewind"].forEach(function (k) {
      try { tizen.tvinputdevice.registerKey(k); } catch (e) {}
    });
  }
  function goBack() {
    if (!$("ids").hidden) { $("ids").hidden = true; return; }
    if (SQ.open) { closeSQ(); return; }
    if (CC.open) { if (CC.pane === "rows") { CC.pane = "side"; CC.confirm = ""; ccRender(); } else closeCC(); return; }
    if (view === "music" && lyricsOn) { toggleLyrics(); return; }
    if (view !== "home") { showView("home"); return; }
    if (hasTizen) tizen.application.getCurrentApplication().exit();
  }

  // =====================================================================
  //  PROFILES, CONTROL CENTER, SEARCH
  // =====================================================================
  var RECENT = jget(pk("rover_recent"), []);
  function pushRecent(id) {
    RECENT = RECENT.filter(function (x) { return x !== id; }); RECENT.unshift(id); RECENT = RECENT.slice(0, 8);
    jset(pk("rover_recent"), RECENT);
  }
  function findProf(id) { for (var i = 0; i < PROFS.length; i++) if (PROFS[i].id === id) return PROFS[i]; return null; }

  function loadProfileData() {
    var d = { clock24: false, tempC: false, crossfade: true, sideLyrics: true, lyrOffset: 0, ps5: 0, saver: 5, tileShuffle: "slide", returnHome: true, bgMusic: false }, k, sv = jget(pk("rover_settings"), null), oldC = S.tempC;
    if (sv) for (k in sv) if (k in d) d[k] = sv[k];
    for (k in d) S[k] = d[k];
    S.hdmiBlocked = !!jget("rover_hdmiblocked", 0);
    inputs.ps5.hdmi = S.ps5 || HDMI0;
    XF = S.crossfade ? 4000 : 0;
    LIB = jget(pk("rover_lib"), []); HIST = jget(pk("rover_hist"), []); TASTE = jget(pk("rover_taste"), { moods: {} });
    RECENT = jget(pk("rover_recent"), []);
    LAUNCHES = jget(pk("rover_launches"), {}); logoCache = {}; assetCache = {}; stageKey = "";
    fy = []; fyAt = 0;
    ms.b.zone = 0; ms.b.ri = 0; ms.b.si = 0; ms.b.pi = 0; ms.b.ai = 0; ms.l.ci = 0; ms.l.row = 0;
    tick(); sideLyr();
    if (S.tempC !== oldC) { fallbackWx(); loadWx(); }
  }
  function switchProfile(id, quiet) {
    var p = findProf(id); if (!p || p === ACTIVE) return;
    ACTIVE = p; try { localStorage.setItem("rover_active", p.id); } catch (e) {}
    loadProfileData(); applyLook(p);
    state.home = 0; state.library = 0; if (state.zone === "emblem" && p.emblem === false) state.zone = "dock";
    buildTiles(); musicUI(); updEmblem();
    if (view === "music") setTab(ms.tab);
    if (!quiet) toast("Now using " + p.name + "'s profile");
  }
  function newProfile() {
    if (PROFS.length >= 6) { toast("That's the most profiles you can have (6)."); return; }
    var n = 3; while (findProf("friend" + n)) n++;
    var keys = Object.keys(THEMES), wk = Object.keys(WALLS), t = keys[(PROFS.length * 2 + 1) % keys.length], w = wk[(PROFS.length + 1) % wk.length];
    var p = { id: "friend" + n, name: "Friend " + n, theme: t, wall: w, emblem: false, hidden: [] };
    PROFS.push(p); saveProfs(); switchProfile(p.id, true);
    toast("Created " + p.name + ". Rename it with the Rename row.");
  }
  function deleteProfile() {
    if (ACTIVE.main) return;
    var gone = ACTIVE, base = ["rover_settings", "rover_lib", "rover_hist", "rover_taste", "rover_recent"];
    var main = PROFS.filter(function (p) { return p.main; })[0] || PROFS[0];
    switchProfile(main.id, true);
    PROFS = PROFS.filter(function (p) { return p !== gone; }); saveProfs();
    base.forEach(function (b) { try { localStorage.removeItem(pkFor(gone, b)); } catch (e) {} });
    toast(gone.name + "'s profile was deleted.");
  }
  function resetProfiles() {
    PROFS = seedProfiles(); jset("rover_profiles", PROFS); jset("rover_profiles_rev", window.ROVER_PROFILES_REV || 1);
    var main = PROFS.filter(function (p) { return p.main; })[0] || PROFS[0];
    ACTIVE = PROFS[0]; switchProfile(main.id, true);
    if (ACTIVE !== main) ACTIVE = main;
    try { localStorage.setItem("rover_active", ACTIVE.id); } catch (e) {}
    loadProfileData(); applyLook(ACTIVE); buildTiles(); musicUI();
    toast("Profiles reset to profiles.js. Saved songs were not touched.");
  }
  function cycle(list, cur, dir) { var i = list.indexOf(cur); if (i < 0) i = 0; return list[(i + (dir || 1) + list.length) % list.length]; }
  function wallKeys() { var k = Object.keys(WALLS); if (HAS_CUSTOM[ACTIVE.id]) k.push("custom"); return k; }
  function wallName(k) { return k === "custom" ? "Your picture" : (WALLS[k] ? WALLS[k].name : k); }
  function toggleHidden(key, label) {
    var h = ACTIVE.hidden = ACTIVE.hidden || [], at = h.indexOf(key);
    if (at >= 0) h.splice(at, 1);
    else {
      var left = DOCK.filter(function (d) { return d.id !== key && h.indexOf(d.id) < 0; }).length;
      if (DOCK.some(function (d) { return d.id === key; }) && left < 1) { toast("Keep at least one square on Home."); return; }
      h.push(key);
    }
    saveProfs(); buildTiles(); musicUI();
  }
  function stateFix() { if (state.zone === "emblem" && ACTIVE.emblem === false) state.zone = "dock"; }

  // ---- Control Center model: categories -> rows. Rows are rebuilt each time so they always show live values.
  var CC = { open: false, cat: 0, row: 0, pane: "side", confirm: "" }, ccCatEls = [], ccRowEls = [], CCM = [], ROWH = 78;
  function ccModel() {
    var profRows = PROFS.map(function (p) {
      return { k: "p:" + p.id, label: p.name, sub: themeOf(p).name + "  ·  " + wallName(p.wall) + (p.main ? "  ·  main" : ""), av: p,
        val: function () { return p === ACTIVE ? "Using now" : "Switch"; }, act: function () { switchProfile(p.id); } };
    });
    profRows.push({ k: "rename", label: "Rename this profile", val: function () { return ACTIVE.name; }, act: function () { openSQ("rename"); } });
    profRows.push({ k: "new", label: "New profile", val: function () { return PROFS.length + " of 6"; }, act: newProfile });
    if (!ACTIVE.main) profRows.push({ k: "del", label: "Delete this profile", danger: true,
      val: function () { return CC.confirm === "del" ? "Press OK to confirm" : "Delete"; },
      act: function () { if (CC.confirm !== "del") { CC.confirm = "del"; return; } CC.confirm = ""; deleteProfile(); CC.row = 0; } });
    profRows.push({ k: "pf", info: true, label: "This profile's folder", val: function () { return "profiles/" + ACTIVE.id + "/"; } });

    var tileRows = DOCK.map(function (d) {
      return { k: "t:" + d.id, label: d.title, sub: "Home square", cyc: false, val: function () { return isHidden(d.id) ? "Hidden" : "Shown"; }, act: function () { toggleHidden(d.id, d.title); } };
    }).concat(ALLAPPS.map(function (x) {
      var key = artKey(x.name);
      return { k: "t:" + key, label: x.name, sub: "Streaming app", val: function () { return isHidden(key) ? "Hidden" : "Shown"; }, act: function () { toggleHidden(key, x.name); } };
    }));

    return [
      { id: "profiles", name: "Profiles", rows: profRows },
      { id: "look", name: "Look", rows: [
        { k: "theme", cyc: true, label: "Theme colors", val: function () { return themeOf(ACTIVE).name; },
          act: function (dir) { ACTIVE.theme = cycle(Object.keys(THEMES), ACTIVE.theme, dir); saveProfs(); applyLook(ACTIVE); } },
        { k: "wall", cyc: true, label: "Wallpaper", val: function () { return wallName(ACTIVE.wall); },
          act: function (dir) { ACTIVE.wall = cycle(wallKeys(), ACTIVE.wall, dir); saveProfs(); applyLook(ACTIVE); frostAll(); } },
        { k: "emb", label: "Jester emblem", val: function () { return ACTIVE.emblem === false ? "Off" : "On"; },
          act: function () { ACTIVE.emblem = ACTIVE.emblem === false; saveProfs(); applyLook(ACTIVE); stateFix(); } },
        { k: "wp", info: true, label: "Your own wallpaper", val: function () { return "Put wallpaper.jpg in profiles/" + ACTIVE.id + "/"; } },
        { k: "tp", info: true, label: "Your own tile pictures", val: function () { return (ACTIVE.main ? "tile-art/ or " : "") + "profiles/" + ACTIVE.id + "/tile-art/"; } },
        { k: "lp", info: true, label: "Your own app logos", val: function () { return (ACTIVE.main ? "logos/ or " : "") + "profiles/" + ACTIVE.id + "/logos/"; } }
      ] },
      { id: "tiles", name: "Tiles", rows: tileRows },
      { id: "home", name: "Home & music", rows: [
        { k: "clock", label: "Clock", val: function () { return S.clock24 ? "24-hour" : "12-hour"; }, act: function () { S.clock24 = !S.clock24; tick(); } },
        { k: "temp", label: "Temperature", val: function () { return S.tempC ? "°C" : "°F"; }, act: function () { S.tempC = !S.tempC; fallbackWx(); loadWx(); } },
        { k: "xf", label: "Crossfade songs", val: function () { return S.crossfade ? "On" : "Off"; }, act: function () { S.crossfade = !S.crossfade; XF = S.crossfade ? 4000 : 0; } },
        { k: "ly", label: "Lyrics on Home", val: function () { return S.sideLyrics ? "On" : "Off"; }, act: function () { S.sideLyrics = !S.sideLyrics; sideLyr(); } },
        { k: "lyoff", cyc: true, label: "Lyrics timing", sub: "Nudge synced lyrics if they run early or late", val: function () { var o = S.lyrOffset || 0; return o ? (o > 0 ? "Earlier " : "Later ") + Math.abs(o) + "s" : "Exact"; },
          act: function (dir) { S.lyrOffset = cycle([-1, -0.5, 0, 0.5, 1], S.lyrOffset || 0, dir); updLyrics(lastP, lastS); } },
        { k: "tshuf", cyc: true, label: "Tile pictures", sub: "When a tile has several pictures", val: function () { return { slide: "Slideshow", visit: "New each visit", off: "Always the first" }[S.tileShuffle] || "Slideshow"; },
          act: function (dir) { S.tileShuffle = cycle(["slide", "visit", "off"], S.tileShuffle, dir); buildTiles(); } },
        { k: "saver", cyc: true, label: "Screen saver", sub: "Drifting wallpaper and clock when idle", val: function () { return S.saver ? "After " + S.saver + " min" : "Off"; },
          act: function (dir) { S.saver = cycle([0, 2, 5, 10, 20], S.saver, dir); idleAt = Date.now(); } },
        { k: "reset", label: "Reset music taste", danger: true, val: function () { return CC.confirm === "reset" ? "Press OK to confirm" : "Reset"; },
          act: function () {
            if (CC.confirm !== "reset") { CC.confirm = "reset"; return; }
            CC.confirm = ""; TASTE = { moods: {} }; HIST = []; jset(pk("rover_taste"), TASTE); jset(pk("rover_hist"), HIST); fy = []; fyAt = 0;
            toast("Music taste reset. Your saved songs are untouched.");
          } }
      ] },
      { id: "tv", name: "TV & system", rows: [
        { k: "ps5", label: "PS5 HDMI port", val: function () { return "HDMI " + inputs.ps5.hdmi; },
          act: function () { inputs.ps5.hdmi = inputs.ps5.hdmi % 4 + 1; S.ps5 = inputs.ps5.hdmi; var s = $("sub-ps5"); if (s) s.textContent = "HDMI " + inputs.ps5.hdmi + " · switches input"; } },
        { k: "ret", label: "Come back after apps", sub: "Closing an app you opened here brings you back to Rover", val: function () { return S.returnHome ? "On" : "Off"; },
          act: function () { S.returnHome = !S.returnHome; if (!S.returnHome) disarmReturn(); } },
        { k: "bgm", label: "Music when you leave", sub: "When Rover goes to the background", val: function () { return S.bgMusic ? "Keep playing" : "Pause"; },
          act: function () { S.bgMusic = !S.bgMusic; } },
        { k: "diag", label: "Diagnostics", sub: "Errors Rover caught and survived", val: function () { var l = jget("rover_errs", []); return l.length ? l.length + " logged \u00B7 last: " + l[0].m.slice(0, 40) : "All clear"; },
          act: function () { var l = jget("rover_errs", []); if (!l.length) { toast("No errors logged."); return; } jset("rover_errs", []); toast("Cleared " + l.length + " logged errors."); } },
        { k: "restart", label: "Restart launcher", val: function () { return CC.confirm === "restart" ? "Press OK to confirm" : "Restart"; },
          act: function () { if (CC.confirm !== "restart") { CC.confirm = "restart"; return; } location.reload(); } },
        { k: "rp", label: "Reset profiles to profiles.js", danger: true, val: function () { return CC.confirm === "rp" ? "Press OK to confirm" : "Reset"; },
          act: function () { if (CC.confirm !== "rp") { CC.confirm = "rp"; return; } CC.confirm = ""; resetProfiles(); } },
        { k: "i1", info: true, label: "Start-up", val: function () { return "TV Settings › General › Autorun Last App"; } },
        { k: "i2", info: true, label: "Remote shortcuts", val: function () { return "Red save song · Green this panel · Yellow app IDs · Blue search"; } },
        { k: "i3", info: true, label: "About", val: function () { return "Rover Home 3.0 · " + loc.label; } }
      ] }
    ];
  }
  function ccRender() {
    CCM = ccModel();
    if (CC.cat >= CCM.length) CC.cat = 0;
    var side = $("cc-side"), list = $("cc-rows"), cat = CCM[CC.cat];
    side.innerHTML = ""; list.innerHTML = ""; ccCatEls = []; ccRowEls = [];
    CCM.forEach(function (c, i) {
      var d = document.createElement("div"); d.className = "cc-cat"; d.innerHTML = "<i></i><span></span>"; d.children[1].textContent = c.name;
      d.addEventListener("click", function () { CC.cat = i; CC.pane = "side"; CC.row = 0; CC.confirm = ""; ccRender(); paint(); });
      side.appendChild(d); ccCatEls.push(d);
    });
    $("cc-title").textContent = cat.name;
    cat.rows.forEach(function (r, i) {
      var d = document.createElement("div"); d.className = "cc-row" + (r.info ? " info" : "") + (r.danger ? " danger" : "");
      var l = document.createElement("span"); l.className = "l";
      if (r.av) { var av = document.createElement("b"); av.className = "av"; av.style.background = avBg(r.av); av.textContent = r.av.name.charAt(0).toUpperCase(); l.appendChild(av); }
      var tx = document.createElement("span"); tx.className = "tx"; var t1 = document.createElement("span"); t1.className = "t1"; t1.textContent = r.label; tx.appendChild(t1);
      if (r.sub) { var t2 = document.createElement("span"); t2.className = "t2"; t2.textContent = r.sub; tx.appendChild(t2); }
      l.appendChild(tx);
      var v = document.createElement("span"); v.className = "v"; v.textContent = r.val();
      if (r.cyc) v.className += " cyc";
      d.appendChild(l); d.appendChild(v);
      d.addEventListener("click", function () { CC.pane = "rows"; CC.row = i; ccAct(1); paint(); });
      list.appendChild(d); ccRowEls.push(d);
    });
    $("cc-foot").textContent = ccFoot();
    frostAll();
  }
  function ccFoot() {
    var r = CCM[CC.cat] && CCM[CC.cat].rows[CC.row];
    if (CC.pane === "side") return "Up / Down choose  ·  Right or OK open  ·  Back close";
    if (r && r.cyc) return "Left / Right change  ·  OK next  ·  Back returns";
    return "OK change  ·  Left or Back returns";
  }
  function ccAct(dir) {
    var r = CCM[CC.cat].rows[CC.row]; if (!r || r.info) return;
    if (CC.confirm && CC.confirm !== r.k) CC.confirm = "";
    r.act(dir || 1); saveS();
    var keepRow = CC.row; ccRender(); CC.row = Math.min(keepRow, CCM[CC.cat].rows.length - 1);
  }
  function ccSkipInfo(step) {
    var rows = CCM[CC.cat].rows, n = rows.length, tries = 0;
    do { CC.row = (CC.row + step + n) % n; tries++; } while (rows[CC.row].info && tries <= n);
  }
  function openCC(cat, row) {
    closeSQ(true);
    CC.open = true; CC.confirm = "";
    if (cat != null) CC.cat = cat;
    CCM = ccModel(); if (CC.cat >= CCM.length) CC.cat = 0;
    CC.row = row != null ? row : 0; CC.pane = row != null ? "rows" : "side";
    ccRender(); $("cc").classList.add("open"); $("gear").classList.add("open");
  }
  function closeCC() { CC.open = false; CC.confirm = ""; $("cc").classList.remove("open"); $("gear").classList.remove("open"); }
  function navCC(k) {
    var rows = CCM[CC.cat].rows;
    if (CC.pane === "side") {
      if (k === 38 || k === 40) {
        CC.cat = (CC.cat + (k === 38 ? -1 : 1) + CCM.length) % CCM.length; CC.row = 0; CC.confirm = ""; ccRender();
      } else if (k === 39 || k === 13) { CC.pane = "rows"; CC.row = 0; if (rows[0] && rows[0].info) ccSkipInfo(1); $("cc-foot").textContent = ccFoot(); }
      return;
    }
    var r = rows[CC.row];
    if (k === 38 || k === 40) { CC.confirm = ""; ccSkipInfo(k === 38 ? -1 : 1); ccRender(); }
    else if (k === 13) ccAct(1);
    else if (k === 39) { if (r && r.cyc) ccAct(1); }
    else if (k === 37) { if (r && r.cyc) ccAct(-1); else { CC.pane = "side"; CC.confirm = ""; ccRender(); } }
  }
  function ccPaint() {
    ccCatEls.forEach(function (e, i) { e.classList.toggle("on", i === CC.cat); e.classList.toggle("focus", CC.open && CC.pane === "side" && i === CC.cat); });
    ccRowEls.forEach(function (e, i) { e.classList.toggle("focus", CC.open && CC.pane === "rows" && i === CC.row); });
    $("cc-rows").style.transform = "translateY(" + (-Math.max(0, CC.row - 5) * ROWH) + "px)";
    $("cc-foot").textContent = ccFoot();
  }
  $("gear").addEventListener("click", function () { state.zone = "gear"; if (CC.open) closeCC(); else openCC(CC.cat); paint(); });
  $("srch").addEventListener("click", function () { state.zone = "srch"; openSQ("search"); paint(); });
  $("prof").addEventListener("click", function () { state.zone = "prof"; openCC(0); paint(); });
  $("cc-scrim").addEventListener("click", function () { closeCC(); paint(); });

  // ---- Search / on-screen keyboard (also used to rename a profile)
  var SQ = { open: false, mode: "search", q: "", zone: "kb", kr: 0, kk: 0, ri: 0, results: [], items: [], key: null };
  var SKB = [];
  ["abcdefghij", "klmnopqrst", "uvwxyz'-&."].forEach(function (r) { SKB.push(r.split("").map(function (c, i) { return { l: c.toUpperCase(), v: c, c0: i, sp: 1 }; })); });
  SKB.push("0123456789".split("").map(function (c, i) { return { l: c, v: c, c0: i, sp: 1 }; }));
  SKB.push([{ l: "Space", v: " ", c0: 0, sp: 3, k: "sp" }, { l: "⌫", k: "del", c0: 3, sp: 2 }, { l: "Clear", k: "clr", c0: 5, sp: 2 }, { l: "TV keyboard", k: "ime", c0: 7, sp: 3 }]);
  var sqKeyEls = [], sqResEls = [];
  SKB.forEach(function (row) {
    var r = [];
    row.forEach(function (k) {
      var el = document.createElement("div"); el.className = "key" + (k.k ? " act" : ""); el.textContent = k.l; el.style.gridColumn = "span " + k.sp;
      el.addEventListener("click", function () { SQ.zone = "kb"; sqPress(k); paint(); });
      $("sq-kb").appendChild(el); r.push(el);
    });
    sqKeyEls.push(r);
  });
  function sqUpdate() { $("sq-text").textContent = SQ.q; $("sq-ph").className = SQ.q ? "hide" : ""; }
  function sqPress(k) {
    if (k.k === "ime") { sqIME(); return; }
    if (k.k === "done") { sqDone(); return; }
    if (k.k === "del") SQ.q = SQ.q.slice(0, -1);
    else if (k.k === "clr") SQ.q = "";
    else if (SQ.q.length < (SQ.mode === "rename" ? 16 : 40)) {
      var ch = k.v;
      if (SQ.mode === "rename" && (!SQ.q || SQ.q.slice(-1) === " ")) ch = ch.toUpperCase();
      SQ.q += ch;
    }
    sqUpdate(); sqSearch();
  }
  function sqIME() {
    var i = $("sq-in"); i.value = SQ.q;
    try { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } catch (e) {}
  }
  $("sq-in").addEventListener("input", function () {
    SQ.q = this.value.slice(0, SQ.mode === "rename" ? 16 : 40); sqUpdate(); sqSearch();
  });
  function sqDone() {
    if (SQ.mode !== "rename") return;
    var nm = SQ.q.replace(/^\s+|\s+$/g, "");
    if (nm) { ACTIVE.name = nm; saveProfs(); applyLook(ACTIVE); toast("Renamed to " + nm); }
    closeSQ(); if (CC.open) { var keep = CC.row; ccRender(); CC.row = keep; }
  }

  function sqBuild() {
    var out = [];
    function add(o) { o.hay = (o.title + " " + (o.kw || "") + " " + (o.sub || "")).toLowerCase(); o.tl = o.title.toLowerCase(); out.push(o); }
    DOCKV.forEach(function (d, i) {
      var kw = { library: "apps streaming tv shows movies", ps5: "playstation games gaming console hdmi", rover: "os door", music: "songs listen radio tunes" }[d.id] || "";
      add({ id: "dock:" + d.id, kind: "Home", rank: 0, title: d.title, sub: d.id === "ps5" ? "HDMI " + inputs.ps5.hdmi : d.sub, kw: kw,
        run: function () { closeSQ(true); state.home = i; state.zone = "dock"; openDock(d.id); } });
    });
    var akw = { "Prime Video": "amazon", Max: "hbo", "Disney+": "disney marvel pixar", Peacock: "nbc", "Apple TV": "appletv", YouTube: "videos", Netflix: "movies shows" };
    apps.forEach(function (a) {
      add({ id: "app:" + artKey(a.name), kind: "App", rank: 0, title: a.name, sub: "Streaming app", kw: akw[a.name] || "", run: function () { closeSQ(true); launch(a); } });
    });
    MOODS.forEach(function (m) {
      add({ id: "mood:" + m.id, kind: "Music", rank: 2, title: "Play " + m.name, sub: "Vibe", kw: "music mood vibe",
        run: function () { closeSQ(true); pushRecent("mood:" + m.id); showView("music"); startMood(m); } });
    });
    var seen = {};
    LIB.forEach(function (t, i) {
      seen[t.id] = 1;
      add({ id: "song:" + t.id, kind: "Music", rank: 1, title: t.title, sub: t.artist + "  ·  Saved", kw: "song saved",
        run: function () { closeSQ(true); showView("music"); playList(LIB, i); } });
    });
    HIST.forEach(function (t, i) {
      if (seen[t.id]) return;
      add({ id: "hist:" + t.id, kind: "Music", rank: 1, title: t.title, sub: t.artist + "  ·  Played before", kw: "song recent",
        run: function () { closeSQ(true); showView("music"); playList(HIST, i); } });
    });
    CCM = ccModel();
    CCM.forEach(function (c, ci) {
      c.rows.forEach(function (r, ri) {
        if (c.id === "tiles" || r.k.indexOf("p:") === 0) return;
        add({ id: "cc:" + c.id + ":" + r.k, kind: "Setting", rank: 3, title: r.label, sub: "Control Center  ·  " + c.name, kw: "settings control center",
          run: function () { closeSQ(true); openCC(ci, ri); } });
      });
    });
    PROFS.forEach(function (p) {
      if (p === ACTIVE) return;
      add({ id: "prof:" + p.id, kind: "Profile", rank: 1, title: "Switch to " + p.name, sub: "Profile", kw: "profile user account " + p.name,
        run: function () { closeSQ(true); switchProfile(p.id); } });
    });
    add({ id: "act:vibe", kind: "Music", rank: 2, title: "Play my vibe", sub: "Starts music picked for you", kw: "music shuffle",
      run: function () { closeSQ(true); emblemAction(); } });
    add({ id: "act:cc", kind: "Setting", rank: 3, title: "Open Control Center", sub: "Profiles, look, tiles, settings", kw: "settings",
      run: function () { closeSQ(true); openCC(0); } });
    return out;
  }
  function sqScore(it, toks) {
    var s = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (it.hay.indexOf(t) < 0) return -1;
      if (it.tl.indexOf(t) === 0) s += 0;
      else if (it.tl.indexOf(" " + t) >= 0) s += 1;
      else if (it.tl.indexOf(t) >= 0) s += 2;
      else s += 3;
    }
    return s;
  }
  function sqSearch() {
    var q = SQ.q.replace(/^\s+|\s+$/g, "").toLowerCase(), list = [];
    if (SQ.mode === "rename") { SQ.results = []; sqRender(); return; }
    if (!q) {
      var byId = {}; SQ.items.forEach(function (it) { byId[it.id] = it; });
      RECENT.forEach(function (id) { if (byId[id]) list.push({ it: byId[id], head: list.length ? "" : "Recent" }); });
      var seenId = {}; list.forEach(function (x) { seenId[x.it.id] = 1; });
      var sug = ["dock:ps5", "dock:music", "act:vibe", "act:cc"].map(function (id) { return byId[id]; }).filter(function (x) { return x && !seenId[x.id]; });
      sug.forEach(function (it, i) { list.push({ it: it, head: i === 0 ? "Suggested" : "" }); });
      SQ.results = list;
    } else {
      var toks = q.split(/\s+/), scored = [];
      SQ.items.forEach(function (it) { var s = sqScore(it, toks); if (s >= 0) scored.push({ it: it, s: s }); });
      scored.sort(function (a, b) { return a.s - b.s || a.it.rank - b.it.rank || (a.it.title < b.it.title ? -1 : 1); });
      list = scored.slice(0, 40).map(function (x) { return { it: x.it }; });
      if (q.length >= 2) list.push({ it: { id: "web:music", kind: "Music", title: "Search music for “" + SQ.q.replace(/^\s+|\s+$/g, "") + "”", sub: "Songs, artists and radio",
        run: function () { var qq = SQ.q.replace(/^\s+|\s+$/g, ""); closeSQ(true); showView("music"); ms.inTabs = false; ms.s.q = qq; ms.s.zone = "kb"; setTab(1); sUpdate(); doSearch(); } } });
      SQ.results = list;
    }
    SQ.ri = Math.min(SQ.ri, Math.max(0, SQ.results.length - 1));
    sqRender();
  }
  function sqRender() {
    var box = $("sq-res"); box.innerHTML = ""; sqResEls = [];
    $("sq-right").classList.toggle("off", SQ.mode === "rename");
    $("sq-rtitle").textContent = SQ.q.replace(/^\s+|\s+$/g, "") ? "Results" : "";
    if (SQ.mode !== "rename" && !SQ.results.length) { var e = document.createElement("div"); e.className = "sq-empty"; e.textContent = "Nothing matches. Try another word."; box.appendChild(e); }
    SQ.results.forEach(function (x) {
      if (x.head) { var h = document.createElement("div"); h.className = "sq-head"; h.textContent = x.head; box.appendChild(h); }
      var r = document.createElement("div"); r.className = "sq-row";
      r.innerHTML = "<span class='kd'></span><span class='mt'><span class='t1'></span><span class='t2'></span></span>";
      r.children[0].textContent = x.it.kind; r.querySelector(".t1").textContent = x.it.title; r.querySelector(".t2").textContent = x.it.sub || "";
      r.addEventListener("click", function () { SQ.ri = sqResEls.indexOf(r); x.it.run(); paint(); });
      box.appendChild(r); sqResEls.push(r);
    });
  }
  function openSQ(mode, preset) {
    if (CC.open && mode === "search") closeCC();
    SQ.open = true; SQ.mode = mode; SQ.q = mode === "rename" ? ACTIVE.name : (preset || ""); SQ.zone = "kb"; SQ.kr = 0; SQ.kk = 0; SQ.ri = 0;
    var bottom = SKB[SKB.length - 1];
    bottom[3].l = mode === "rename" ? "Done" : "TV keyboard"; bottom[3].k = mode === "rename" ? "done" : "ime";
    sqKeyEls[SKB.length - 1][3].textContent = bottom[3].l; sqKeyEls[SKB.length - 1][3].className = "key act" + (mode === "rename" ? " go" : "");
    $("sq-ph").textContent = mode === "rename" ? "Type a name" : "Search apps, music, settings";
    $("sq-title").textContent = mode === "rename" ? "Name this profile" : "Search";
    $("sq-hint").textContent = mode === "rename" ? "Arrows pick letters  ·  OK types  ·  Done saves  ·  Back cancels"
      : "Arrows type  ·  Right shows results  ·  OK opens  ·  Back closes";
    SQ.items = mode === "search" ? sqBuild() : [];
    sqUpdate(); sqSearch();
    frostAll(); $("sq").classList.add("open");
  }
  function closeSQ(silent) {
    if (!SQ.open) return;
    SQ.open = false; $("sq").classList.remove("open");
    try { $("sq-in").blur(); } catch (e) {}
  }
  function sqPaint() {
    sqKeyEls.forEach(function (row, r) { row.forEach(function (e, k) { e.classList.toggle("focus", SQ.open && SQ.zone === "kb" && r === SQ.kr && k === SQ.kk); }); });
    sqResEls.forEach(function (e, i) { e.classList.toggle("focus", SQ.open && SQ.zone === "res" && i === SQ.ri); });
    var y = 0, el = sqResEls[SQ.ri];
    if (el && SQ.zone === "res") y = Math.max(0, el.offsetTop - 250);
    $("sq-res").style.transform = "translateY(" + (-y) + "px)";
  }
  function navSQ(k) {
    if (SQ.zone === "res") {
      if (k === 38) { if (SQ.ri > 0) SQ.ri--; }
      else if (k === 40) SQ.ri = Math.min(sqResEls.length - 1, SQ.ri + 1);
      else if (k === 37) SQ.zone = "kb";
      else if (k === 13 && SQ.results[SQ.ri]) SQ.results[SQ.ri].it.run();
      return;
    }
    var key = SKB[SQ.kr][SQ.kk];
    if (k === 37) { if (SQ.kk > 0) SQ.kk--; }
    else if (k === 39) { if (SQ.kk < SKB[SQ.kr].length - 1) SQ.kk++; else if (sqResEls.length && SQ.mode !== "rename") { SQ.zone = "res"; SQ.ri = Math.min(SQ.ri, sqResEls.length - 1); } }
    else if (k === 38 || k === 40) {
      var nr = k === 38 ? SQ.kr - 1 : SQ.kr + 1;
      if (nr < 0 || nr >= SKB.length) return;
      var center = key.c0 + key.sp / 2 - 0.5, best = 0;
      SKB[nr].forEach(function (kk, i) { if (center >= kk.c0 - 0.5 && center <= kk.c0 + kk.sp - 0.5) best = i; });
      SQ.kr = nr; SQ.kk = best;
    }
    else if (k === 13) sqPress(key);
  }

  // ---- Screen saver: wallpaper drifts, clock floats, now playing shows. Any key wakes it (that key does nothing else).
  var idleAt = Date.now(), saverOn = false, svSpot = 0;
  function saverPaint() {
    var d = new Date(), h = S.clock24 ? ("0" + d.getHours()).slice(-2) : (d.getHours() % 12 || 12);
    $("sv-time").textContent = h + ":" + ("0" + d.getMinutes()).slice(-2);
    $("sv-date").textContent = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    var t = cur(); $("sv-np").textContent = t && playing ? "\u266A  " + t.title + "  \u2014  " + t.artist : "";
  }
  function saverShow() {
    if (saverOn) return;
    saverOn = true; svSpot = (svSpot + 1) % 4; $("saver").className = "on spot" + svSpot; saverPaint();
  }
  function saverHide() { saverOn = false; $("saver").className = ""; idleAt = Date.now(); }
  setInterval(function () {
    if (saverOn) { saverPaint(); if (new Date().getSeconds() < 15 && new Date().getMinutes() % 3 === 0) { svSpot = (svSpot + 1) % 4; $("saver").className = "on spot" + svSpot; } return; }
    if (S.saver && ext !== YTP && Date.now() - idleAt > S.saver * 60000 && !SQ.open && !(document.activeElement && document.activeElement.id === "sq-in")) saverShow();
  }, 15000);
  ["mousemove", "click"].forEach(function (ev) { document.addEventListener(ev, function () { if (saverOn) saverHide(); else idleAt = Date.now(); }, true); });

  function navHome(k) {
    var z = state.zone;
    if (z === "gear") { if (k === 38) state.zone = "dock"; else if (k === 13) openCC(CC.cat); return; }
    if (z === "srch" || z === "prof" || z === "emblem") {
      var ord = ACTIVE.emblem === false ? ["srch", "prof"] : ["srch", "prof", "emblem"], i = ord.indexOf(z);
      if (k === 37) state.zone = ord[Math.max(0, i - 1)];
      else if (k === 39) state.zone = ord[Math.min(ord.length - 1, i + 1)];
      else if (k === 40) { state.zone = "dock"; if (z === "srch") state.home = 0; else if (z === "prof") state.home = Math.min(1, DOCKV.length - 1); }
      else if (k === 13) { if (z === "srch") openSQ("search"); else if (z === "prof") openCC(0); else emblemAction(); }
      return;
    }
    if (k === 38) state.zone = state.home === 0 ? "srch" : state.home === 1 ? "prof" : (ACTIVE.emblem === false ? "prof" : "emblem");
    else if (k === 40) state.zone = "gear";
    else if (k === 37) state.home = Math.max(0, state.home - 1);
    else if (k === 39) state.home = Math.min(DOCKV.length - 1, state.home + 1);
    else if (k === 13) openDock(DOCKV[state.home].id);
  }
  function navStreaming(k) {
    var i = state.library, last = libEls.length - 1;
    if (k === 37) i = Math.max(0, i - 1);
    else if (k === 39) i = Math.min(last, i + 1);
    else if (k === 38 && i >= LIBCOLS) i -= LIBCOLS;
    else if (k === 40) i = Math.min(last, i + LIBCOLS);
    else if (k === 13) return launch(apps[i]);
    state.library = i;
  }
  function navTabs(k) {
    if (k === 37) setTab(Math.max(0, ms.tab - 1));
    else if (k === 39) setTab(Math.min(3, ms.tab + 1));
    else if (k === 40 || k === 13) ms.inTabs = false;
  }
  function navListen(k) {
    var L = ms.l, has = fyEls.length > 0;
    if (L.row === 0 && !has) L.row = 1;
    if (k === 37) { if (L.row === 0) L.ci = Math.max(0, L.ci - 1); else L.mi = Math.max(0, L.mi - 1); }
    else if (k === 39) { if (L.row === 0) L.ci = Math.min(fy.length - 1, L.ci + 1); else L.mi = Math.min(MOODS.length - 1, L.mi + 1); }
    else if (k === 38) { if (L.row === 1 && has) L.row = 0; else ms.inTabs = true; }
    else if (k === 40) { if (L.row === 0) L.row = 1; }
    else if (k === 13) { if (L.row === 0) playList(fy, L.ci); else startMood(MOODS[L.mi]); }
    else if (k === 403 && L.row === 0) toggleSave(fy[L.ci]);
  }
  function navSearch(k) {
    var s = ms.s;
    if (s.zone === "res") {
      if (k === 38) { if (s.ri > 0) s.ri--; else ms.inTabs = true; }
      else if (k === 40) s.ri = Math.min(resEls.length - 1, s.ri + 1);
      else if (k === 37) s.zone = "kb";
      else if (k === 13) playList(results, s.ri);
      else if (k === 403) toggleSave(results[s.ri]);
      return;
    }
    var key = KB[s.kr][s.kk];
    if (k === 37) { if (s.kk > 0) s.kk--; }
    else if (k === 39) { if (s.kk < KB[s.kr].length - 1) s.kk++; else if (resEls.length) { s.zone = "res"; s.ri = 0; } }
    else if (k === 38 || k === 40) {
      var nr = k === 38 ? s.kr - 1 : s.kr + 1;
      if (nr < 0) { ms.inTabs = true; return; }
      if (nr >= KB.length) return;
      var center = key.c0 + key.sp / 2 - 0.5, best = 0;
      KB[nr].forEach(function (kk, i) { if (center >= kk.c0 - 0.5 && center <= kk.c0 + kk.sp - 0.5) best = i; });
      s.kr = nr; s.kk = best;
    }
    else if (k === 13) typeKey(key);
  }
  // Library zones: 0 recently played (row), 1 saved (grid), 2 Apple playlists (row), 3 Apple songs (grid)
  function libZones() {
    var z = [];
    if (HIST.length) z.push(0);
    if (LIB.length) z.push(1);
    if (plOn()) z.push(2);
    if (amOn() && AMS.songs.length) z.push(3);
    return z;
  }
  function navLib(k) {
    var B = ms.b, zs = libZones(), cols = 5, KEYS = ["ri", "si", "pi", "ai"];
    if (!zs.length) { if (k === 38) ms.inTabs = true; return; }
    if (zs.indexOf(B.zone) < 0) B.zone = zs[0];
    var lists = [HIST, LIB, amPlaylists(), AMS.songs];
    var z = B.zone, key = KEYS[z], list = lists[z], i = Math.min(B[key] || 0, list.length - 1), last = list.length - 1, grid = z === 1 || z === 3;
    function jump(dir) {
      var nz = zs[zs.indexOf(z) + dir];
      if (nz === undefined) { if (dir < 0) ms.inTabs = true; return; }
      var col = grid ? i % cols : i, nl = lists[nz].length - 1;
      B.zone = nz;
      B[KEYS[nz]] = (nz === 1 || nz === 3) && dir < 0 ? Math.min(nl, Math.floor(nl / cols) * cols + Math.min(col, cols - 1)) : Math.min(col, nl);
    }
    if (k === 37) i = Math.max(0, i - 1);
    else if (k === 39) i = Math.min(last, i + 1);
    else if (k === 38) { if (grid && i >= cols) i -= cols; else return jump(-1); }
    else if (k === 40) { if (grid && i + cols <= last) i += cols; else if (grid && Math.floor(i / cols) < Math.floor(last / cols)) i = last; else return jump(1); }
    else if (k === 13) {
      if (z === 2) return amOpenPlaylist(list[i]);
      return playList(list, i);
    }
    else if (k === 403) { if (z !== 2) toggleSave(list[i]); return; }
    B[key] = i;
    if (z === 3 && i > AMS.songs.length - 20) amMore();
  }
  function navNow(k) {
    var N = ms.n;
    if (N.zone === "ctl") {
      if (k === 37) N.ci = Math.max(0, N.ci - 1);
      else if (k === 39) N.ci = Math.min(4, N.ci + 1);
      else if (k === 38) ms.inTabs = true;
      else if (k === 40 && $("m-list").children.length && !lyricsOn) { N.zone = "list"; N.li = 0; }
      else if (k === 13) {
        if (N.ci === 0) toggleSave(cur());
        else if (N.ci === 1) prevTrack();
        else if (N.ci === 2) toggle();
        else if (N.ci === 3) nextTrack(false);
        else toggleLyrics();
      }
      else if (k === 403) toggleSave(cur());
    } else {
      var n = $("m-list").children.length;
      if (k === 38) { if (N.li > 0) N.li--; else N.zone = "ctl"; }
      else if (k === 40) N.li = Math.min(n - 1, N.li + 1);
      else if (k === 13) startTrack(Q.idx + 1 + N.li, false);
      else if (k === 403) toggleSave(Q.items[Q.idx + 1 + N.li]);
    }
  }
  var onKeyRaw, onKey = function (e) { try { onKeyRaw(e); } catch (err) { roverErr(err); try { paint(); } catch (e2) {} } };
  document.addEventListener("keydown", function (e) { onKey(e); });
  onKeyRaw = function (e) {
    var k = e.keyCode;
    $("m-splash").classList.remove("show");
    idleAt = Date.now();
    if (saverOn) { saverHide(); e.preventDefault(); return; }
    if (PX.on) { pxKey(k); e.preventDefault(); return; }
    var ae = document.activeElement;
    if (ae && ae.id === "sq-in") {                       // the TV's own keyboard is open
      if (k === 13 || k === 10009 || k === 27 || k === 65376 || k === 65385) { ae.blur(); e.preventDefault(); }
      return;
    }
    if (k === 10009 || k === 27) { goBack(); paint(); return; }
    if (k === 405) { toggleIds(); return; }
    if (k === 415 || k === 19 || k === 10252) { toggle(); return; }
    if (ext && (k === 417 || k === 412)) { ext.seek(ext.currentTime() + (k === 417 ? 10 : -10)); return; }
    var a = A[act], t = cur();
    if (k === 417 && t && !t.live) { a.currentTime = Math.min(a.duration || 0, a.currentTime + 10); return; }
    if (k === 412 && t && !t.live) { a.currentTime = Math.max(0, a.currentTime - 10); return; }
    if (k === 404) { if (CC.open) closeCC(); else openCC(CC.cat); paint(); return; }          // Green: Control Center
    if (k === 406) { if (SQ.open) closeSQ(); else openSQ("search"); paint(); return; }       // Blue: Search
    if (SQ.open) {
      if (k >= 65 && k <= 90) { sqPress({ v: String.fromCharCode(k + 32) }); }
      else if (k >= 48 && k <= 57 && !e.shiftKey) { sqPress({ v: String.fromCharCode(k) }); }
      else if (k === 32) { e.preventDefault(); sqPress({ v: " " }); }
      else if (k === 8) { sqPress({ k: "del" }); }
      else navSQ(k);
      paint(); return;
    }
    if (CC.open) { navCC(k); paint(); return; }
    if (view === "home") navHome(k);
    else if (view === "library") navStreaming(k);
    else if (view === "music") {
      // physical / bluetooth keyboard typing in Search
      if (ms.tab === 1 && !ms.inTabs && ms.s.zone === "kb") {
        if (k >= 65 && k <= 90) { typeKey({ v: String.fromCharCode(k + 32) }); paint(); return; }
        if (k === 8) { typeKey({ k: "del" }); paint(); return; }
      }
      if (ms.inTabs) navTabs(k);
      else if (ms.tab === 0) navListen(k);
      else if (ms.tab === 1) navSearch(k);
      else if (ms.tab === 2) navLib(k);
      else navNow(k);
    }
    paint();
  };

  // Bridge for mouse.js / lantern.js: the mouse and keyboard shortcuts drive the same state the remote does.
  window.RoverUI = {
    get view() { return view; }, get lyricsOn() { return lyricsOn; }, get playing() { return playing; },
    state: state, ms: ms, CC: CC, SQ: SQ,
    els: function () { return { dock: dockEls, lib: libEls, fy: fyEls, vibe: vibeEls, tabs: tabEls, kb: kbEls, res: resEls, rec: recEls, sav: savEls,
      ampl: amPlEls, am: amEls, ccCat: ccCatEls, ccRow: ccRowEls, sqKey: sqKeyEls, sqRes: sqResEls }; },
    setTab: setTab, paint: paint,
    press: function (k) { onKey({ keyCode: k, shiftKey: false, preventDefault: function () {} }); }
  };

  applyLook(ACTIVE);
  sUpdate(); musicUI(); paint();
  if (/streaming/.test(location.hash)) showView("library");   // preview link opens straight to Streaming
  else if (/music/.test(location.hash)) showView("music");      // native app opens these screens directly
  else if (/rover/.test(location.hash)) showView("rover");
  devRestore();
  if (/streaming/.test(location.hash)) showView("library");   // preview shortcut: index.html#streaming
  frostAll(); window.addEventListener("load", frostAll); setTimeout(frostAll, 400);
})();
