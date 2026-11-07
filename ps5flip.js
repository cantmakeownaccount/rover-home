/* =====================================================================
   PS5 FLIP — the launcher breaks into thousands of glass diamonds that
   flip in one wave from the PS5 tile. Their backs are the launcher's own
   frosted glass; the PS5 pad (the dock icon) lights up piece by piece as
   each panel lands. Then an iris fade to black hides the HDMI switch.
   Coming back, the panels flip the other way and Home is underneath.

   One WebGL pass, no per-tile objects, so it is cheap on the TV.
   Same shader as the native app (Ps5Overlay.kt) — keep them in sync.

   RoverFlip.mount(parent)            create the canvas (once)
   RoverFlip.flipIn(x, y)             launcher -> panels, wave from (x, y) in stage px
   RoverFlip.wake(on)                 slow light ripples while the PS5 wakes
   RoverFlip.ready()                  one bright ripple + glyph pulse
   RoverFlip.toBlack(ms)              iris fade to black
   RoverFlip.fromBlack(x, y, done)    black -> panels -> flip back to the launcher
   RoverFlip.flipOut(x, y, done)      panels -> launcher (cancel)
   ===================================================================== */
(function () {
  "use strict";
  var W = 1280, H = 720, STAGE_W = 1920, STAGE_H = 1080, K = W / STAGE_W;
  var GLYPH = { x: 960, y: 420, size: 250 };     // stage px
  var PAD = "M28 34h44c12 0 20 10 22 28l2 12c1 8-8 12-14 6l-10-12H28L18 80c-6 6-15 2-14-6l2-12c2-18 10-28 22-28z" +
            "M32 46v12M26 52h12";
  var PAD_DOTS = [[68, 48], [76, 56]];

  var VS = "attribute vec2 a; void main(){ gl_Position = vec4(a, 0., 1.); }";
  var FS = [
    "precision highp float;",
    "uniform vec2 R; uniform float T, S;",
    "uniform vec2 uO; uniform float uWaveT0, uRev, uK, uDur;",
    "uniform float uWakeT0, uReadyT0, uGlyph;",
    "uniform float uFadeT0, uFadeDur, uFadeDir; uniform vec2 uG;",
    "uniform vec3 uAcc; uniform float uHasFront;",
    "uniform sampler2D uFrost, uGlyphTex, uFront;",
    "const float PI = 3.14159265; const float SQ = 0.70710678;",
    "float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "float ease(float t){ t = clamp(t, 0., 1.); return t < .5 ? 4.*t*t*t : 1. - pow(-2.*t + 2., 3.) / 2.; }",
    "float startOf(vec2 c, vec2 cell){ return uWaveT0 + length(c - uO) * uK + (h(cell) - .5) * .05; }",
    // 0 = launcher side up, PI = glass panel up
    "float angleFor(vec2 c, vec2 cell){",
    "  float st = startOf(c, cell); float p = ease((T - st) / uDur);",
    "  float a = PI * (uRev > .5 ? 1. - p : p);",
    "  float tau = T - st - uDur;",
    "  if (tau > 0.) a += (uRev > .5 ? -1. : 1.) * .12 * exp(-7.5 * tau) * sin(19. * tau);",
    "  float dg = length(c - uG);",
    "  if (uWakeT0 >= 0.) {",                          // slow ripples out of the glyph while waiting
    "    float ph = T - uWakeT0 - dg * .0011; float l = mod(ph, 1.8);",
    "    float amp = .30 * smoothstep(0., .6, T - uWakeT0) * step(0., ph);",
    "    if (l < .55) a += amp * sin(PI * l / .55);",
    "  }",
    "  if (uReadyT0 >= 0.) { float l = T - uReadyT0 - dg * .0007; if (l > 0. && l < .45) a += .75 * sin(PI * l / .45); }",
    "  return a;",
    "}",
    "void main(){",
    "  vec2 p = vec2(gl_FragCoord.x, R.y - gl_FragCoord.y);",
    "  vec2 uv = vec2(p.x + p.y, p.y - p.x) * SQ;",
    "  vec2 base = floor(uv / S);",
    "  float r = S * SQ, R0 = r * .90, F = 5.5 * r;",
    "  vec3 L = normalize(vec3(-.35, -.75, 1.)); vec3 Hh = normalize(L + vec3(0., 0., 1.));",
    "  vec3 dark = vec3(.012, .012, .016);",
    // gap: launcher until its own panel has turned, then dark
    "  vec2 bc = (base + .5) * S; vec2 bcs = vec2(bc.x - bc.y, bc.x + bc.y) * SQ;",
    "  float own = 1. - abs(cos(angleFor(bcs, base) * .5));",       // 0 launcher .. 1 panel
    "  own = smoothstep(.2, .8, own);",
    "  vec4 col = uHasFront > .5 ? vec4(mix(texture2D(uFront, p / R).rgb, dark, own), 1.) : vec4(dark * own, own);",
    "  float bestZ = -1e9; vec3 sliver = vec3(0.); float slA = 0.;",
    "  for (int i = 0; i < 5; i++) {",
    "    vec2 o = i == 0 ? vec2(0.) : i == 1 ? vec2(1., 0.) : i == 2 ? vec2(-1., 0.) : i == 3 ? vec2(0., 1.) : vec2(0., -1.);",
    "    vec2 cell = base + o; vec2 cc = (cell + .5) * S;",
    "    vec2 c = vec2(cc.x - cc.y, cc.x + cc.y) * SQ; vec2 l = p - c;",
    "    float th = angleFor(c, cell); float cs = cos(th), sn = sin(th);",
    "    float eo = 1. - smoothstep(0., .22, abs(cs));",
    "    if (eo > 0.) { float m = smoothstep(.8 + 1.2 * eo, 0., abs(l.x)) * smoothstep(R0, R0 * .4, abs(l.y)) * eo * eo;",
    "      sliver += mix(uAcc, vec3(1.), .35) * m * .9; slA = max(slA, m); }",
    "    if (abs(sn) < .001 && cs > 0. && uHasFront < .5) continue;",   // flat on the launcher side: nothing to draw
    "    float den = cs * F + l.x * sn; if (abs(den) < 1e-3) continue;",
    "    float lx = l.x * F / den; float z = lx * sn; if (F - z <= 1.) continue;",
    "    float w = F / (F - z); float ly = l.y / w;",
    "    if (max(abs(lx + ly), abs(lx - ly)) > R0) continue;",
    "    if (z <= bestZ) continue; bestZ = z;",
    "    bool panel = cs < 0.;",
    "    vec2 q = panel ? vec2(-lx, ly) : vec2(lx, ly);",
    "    float a = (q.x + q.y) / R0, b = (q.y - q.x) / R0; float edge = 1. - max(abs(a), abs(b));",
    "    vec3 n = panel ? vec3(-sn, 0., -cs) : vec3(sn, 0., cs);",
    "    float hr = h(cell + 3.1); vec2 tuv = (c + q) / R;",
    "    float tilt = smoothstep(.03, .35, abs(sn));",
    "    float spec = pow(max(dot(n, Hh), 0.), 22.) * tilt * (.55 + .7 * h(cell + 9.2));",
    "    float rim = smoothstep(.08, 0., edge);",
    "    bool topEdge = (abs(a) >= abs(b)) ? a < 0. : b < 0.;",
    "    if (panel) {",
    // the launcher's frosted glass, sunk deep: same wallpaper, same specular top edge as .frost
    "      vec3 fr = texture2D(uFrost, tuv).rgb;",
    "      vec3 c0 = mix(vec3(.050, .052, .064), fr * .30, .55) * (.85 + .3 * hr);",
    "      c0 *= 1. - .16 * (q.y / R0);",
    "      c0 += smoothstep(.14, 0., edge) * (topEdge ? .085 : -.03);",
    "      float dif = .66 + .34 * max(dot(n, L), 0.);",
    "      vec3 sh = c0 * dif + mix(uAcc, vec3(1.), .25) * spec * .5 + uAcc * rim * .34 * abs(sn);",
    // the pad lights up the moment its own panel lands, flashes, then settles
    "      float st = startOf(c, cell) + uDur * .78; float e = T - st;",
    "      float ig = uRev > .5 ? 0. : smoothstep(0., .08, e) * (1. + 1.4 * exp(-5. * max(e, 0.)));",
    "      if (uReadyT0 >= 0.) { float rl = T - uReadyT0 - length(c - uG) * .0007; ig *= 1. + .9 * exp(-6. * max(rl, 0.)) * step(0., rl); }",
    "      sh += texture2D(uGlyphTex, tuv).rgb * ig * uGlyph;",
    "      bestZ = z; col = vec4(sh, 1.);",
    "    } else if (uHasFront > .5) {",
    "      vec3 fc = texture2D(uFront, tuv).rgb * (.8 + .2 * max(dot(n, L), 0.)) * (1. - .45 * tilt);",
    "      col = vec4(fc + vec3(1.) * rim * .25 * abs(sn) + uAcc * spec * .25, 1.);",
    "    } else {",
    // launcher side without a snapshot: keep it see-through, only its edge and shadow show it turning
    "      float al = .55 * tilt; vec3 e1 = vec3(1.) * rim * .45 * abs(sn) + uAcc * spec * .2;",
    "      col = vec4(e1, max(al, max(rim * abs(sn), own)));",
    "    }",
    "  }",
    "  col.rgb += sliver; col.a = max(col.a, slA);",
    // vignette on the glass only
    "  vec2 vq = (p / R - .5) * vec2(1., .9); col.rgb *= 1. - .55 * pow(length(vq) * 1.35, 2.2) * col.a;",
    // iris: to black closes from the edges onto the pad; from black opens from the pad outward
    "  if (uFadeT0 >= 0.) {",
    "    float fo = clamp((T - uFadeT0) / uFadeDur, 0., 1.);",
    "    float d = clamp(length((p - uG) / R * vec2(1., .9)) * 1.6, 0., 1.);",
    "    float k;",
    "    if (uFadeDir > 0.) { float lp = clamp(fo * 1.6 - (1. - d) * .6, 0., 1.); k = 1. - smoothstep(0., 1., lp); k = k * k * k; }",
    "    else { float lp = clamp(fo * 1.6 - d * .6, 0., 1.); k = smoothstep(0., 1., lp); k = 1. - (1. - k) * (1. - k) * (1. - k); }",
    "    col = vec4(col.rgb * k, col.a * k + (1. - k));",
    "  }",
    "  col.rgb += (h(p + fract(T)) - .5) / 255. * col.a;",
    "  gl_FragColor = vec4(max(col.rgb, 0.), clamp(col.a, 0., 1.));",
    "}"
  ].join("\n");

  var cv, gl, U = {}, tex = {}, raf = 0, t0 = 0, st = null, accRGB = [0.545, 0.36, 0.965];

  function now() { return (Date.now() - t0) / 1000; }
  function reset() {
    st = { O: [0, 0], waveT0: 1e6, rev: 0, wakeT0: -1, readyT0: -1, glyph: 1, fadeT0: -1, fadeDur: 1, fadeDir: 1, done: null, doneAt: 0 };
  }
  function cssVar(n) { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); } catch (e) { return ""; } }
  function readAccent() {
    var v = cssVar("--b-rgb"); if (!v) return;
    var p = v.split(",").map(function (x) { return parseFloat(x) / 255; });
    if (p.length === 3 && !isNaN(p[0])) accRGB = p;
  }
  function mkTex(unit, src) {
    var t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); return t;
  }
  function blank() { var c = document.createElement("canvas"); c.width = c.height = 2; var x = c.getContext("2d"); x.fillStyle = "#111218"; x.fillRect(0, 0, 2, 2); return c; }

  function paintGlyph() {
    var c = document.createElement("canvas"); c.width = W; c.height = H; var x = c.getContext("2d");
    x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
    var s = GLYPH.size * K / 100, gx = GLYPH.x * K - 50 * s, gy = GLYPH.y * K - 50 * s;
    var acc = "rgb(" + accRGB.map(function (v) { return Math.round(v * 255); }).join(",") + ")";
    // soft room light behind the pad
    var g = x.createRadialGradient(GLYPH.x * K, GLYPH.y * K, 0, GLYPH.x * K, GLYPH.y * K, 300 * K);
    g.addColorStop(0, "rgba(" + accRGB.map(function (v) { return Math.round(v * 255); }).join(",") + ",.16)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    function pad(lw, blur, color, alpha) {
      x.save(); x.translate(gx, gy); x.scale(s, s);
      x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = lw; x.lineCap = "round"; x.lineJoin = "round";
      x.shadowColor = color; x.shadowBlur = blur * K;
      if (window.Path2D) x.stroke(new Path2D(PAD));
      PAD_DOTS.forEach(function (d) { x.beginPath(); x.arc(d[0], d[1], 3, 0, Math.PI * 2); x.stroke(); });
      x.restore();
    }
    pad(4.2, 46, acc, .75);
    pad(3.0, 12, acc, 1);
    pad(1.7, 4, "#f4f1ff", 1);
    if (tex.glyph) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tex.glyph); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); }
    else tex.glyph = mkTex(1, c);
  }
  function loadFrost() {
    var v = cssVar("--frost-img"), m = /url\(["']?([^"')]+)["']?\)/.exec(v), src = m ? m[1] : "leopard-frost.jpg";
    var im = new Image();
    im.onload = function () { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex.frost); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); };
    im.src = src;
  }

  function mount(parent) {
    if (cv) return true;
    cv = document.createElement("canvas"); cv.width = W; cv.height = H; cv.className = "pf-gl";
    gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false }) || cv.getContext("experimental-webgl", { alpha: true, premultipliedAlpha: true });
    if (!gl) { cv = null; return false; }
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var al = gl.getAttribLocation(pr, "a"); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
    "R T S uO uWaveT0 uRev uK uDur uWakeT0 uReadyT0 uGlyph uFadeT0 uFadeDur uFadeDir uG uAcc uHasFront uFrost uGlyphTex uFront".split(" ").forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
    tex.frost = mkTex(0, blank()); tex.front = mkTex(2, blank());
    gl.uniform1i(U.uFrost, 0); gl.uniform1i(U.uGlyphTex, 1); gl.uniform1i(U.uFront, 2);
    gl.viewport(0, 0, W, H);
    readAccent(); paintGlyph(); loadFrost();
    parent.appendChild(cv); t0 = Date.now(); reset();
    return true;
  }

  function draw() {
    var T = now();
    gl.uniform2f(U.R, W, H); gl.uniform1f(U.T, T); gl.uniform1f(U.S, 22 * K);
    gl.uniform2f(U.uO, st.O[0] * K, st.O[1] * K); gl.uniform1f(U.uWaveT0, st.waveT0); gl.uniform1f(U.uRev, st.rev);
    gl.uniform1f(U.uK, 0.00072 / K); gl.uniform1f(U.uDur, 0.56);
    gl.uniform1f(U.uWakeT0, st.wakeT0); gl.uniform1f(U.uReadyT0, st.readyT0); gl.uniform1f(U.uGlyph, st.glyph);
    gl.uniform1f(U.uFadeT0, st.fadeT0); gl.uniform1f(U.uFadeDur, st.fadeDur); gl.uniform1f(U.uFadeDir, st.fadeDir);
    gl.uniform2f(U.uG, GLYPH.x * K, GLYPH.y * K); gl.uniform3f(U.uAcc, accRGB[0], accRGB[1], accRGB[2]); gl.uniform1f(U.uHasFront, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (st.done && T >= st.doneAt) { var d = st.done; st.done = null; d(); }
  }
  function loop() { draw(); raf = requestAnimationFrame(loop); }
  function run() { if (!raf) loop(); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  // seconds until the last panel has landed for a wave from (x, y)
  function waveLen(x, y) {
    var far = Math.max(Math.hypot(x, y), Math.hypot(STAGE_W - x, y), Math.hypot(x, STAGE_H - y), Math.hypot(STAGE_W - x, STAGE_H - y));
    return far * 0.00072 + 0.56 + 0.15;
  }

  window.RoverFlip = {
    mount: mount,
    get time() { return now(); },
    flipIn: function (x, y) {
      readAccent(); paintGlyph(); reset(); st.O = [x, y]; st.waveT0 = now() + 0.02; run();
      return waveLen(x, y);
    },
    wake: function (on) { st.wakeT0 = on ? now() : -1; },
    ready: function () { st.wakeT0 = -1; st.readyT0 = now(); },
    toBlack: function (ms, done) { st.fadeT0 = now(); st.fadeDur = (ms || 1100) / 1000; st.fadeDir = 1; st.done = done || null; st.doneAt = now() + st.fadeDur; },
    fromBlack: function (x, y, done) {
      reset(); run(); st.glyph = 0; st.waveT0 = -10;                      // every panel already up
      st.fadeT0 = now(); st.fadeDur = 0.45; st.fadeDir = -1;
      var self = this; setTimeout(function () { self.flipOut(x, y, done, true); }, 280);
    },
    flipOut: function (x, y, done, keepFade) {
      var f = st.fadeT0, fd = st.fadeDur, fdir = st.fadeDir;
      reset(); if (keepFade) { st.fadeT0 = f; st.fadeDur = fd; st.fadeDir = fdir; }
      st.rev = 1; st.glyph = 0; st.O = [x, y]; st.waveT0 = now() + 0.02; run();
      var len = waveLen(x, y);
      st.done = function () { stop(); gl.clear(gl.COLOR_BUFFER_BIT); if (done) done(); }; st.doneAt = now() + len;
      return len;
    },
    hide: function () { stop(); reset(); if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } },
    _freeze: function (t) { t0 = Date.now() - t * 1000; }
  };
})();
