// Time-synced lyrics for Rover Home from LRCLIB (lrclib.net): a free, open lyrics database, no key needed.
// RoverLyrics.get(track, cb) -> cb({ lines: [{ t: seconds or null, text }], synced: bool } | null)
// Results are cached on the device, so songs played before load instantly and work offline.
(function () {
  var API = "https://lrclib.net/api/search", CK = "rover_lrc_v1", cache = {};
  try { cache = JSON.parse(localStorage.getItem(CK) || "{}") || {}; } catch (e) { cache = {}; }
  function save() {
    try {
      var keys = Object.keys(cache);
      if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(function (k) { delete cache[k]; });
      localStorage.setItem(CK, JSON.stringify(cache));
    } catch (e) {}
  }
  function norm(s) { return (s || "").toLowerCase().replace(/\s*[\(\[].*?[\)\]]/g, "").replace(/\s+(feat|ft)\.?\s.*$/i, "").replace(/\s+/g, " ").trim(); }
  function parseLrc(lrc) {
    var out = [];
    lrc.split(/\r?\n/).forEach(function (l) {
      var re = /\[(\d+):(\d+(?:\.\d+)?)\]/g, m, times = [], last = 0;
      while ((m = re.exec(l))) { times.push(+m[1] * 60 + +m[2]); last = re.lastIndex; }
      var text = l.slice(last).replace(/^\s+|\s+$/g, "");
      times.forEach(function (t) { out.push({ t: t, text: text }); });
    });
    return out.sort(function (a, b) { return a.t - b.t; });
  }
  function shape(r) {
    if (!r) return null;
    if (r.syncedLyrics) return { synced: true, lines: parseLrc(r.syncedLyrics) };
    if (r.plainLyrics) return { synced: false, lines: r.plainLyrics.split(/\r?\n/).map(function (x) { return { t: null, text: x.replace(/^\s+|\s+$/g, "") }; }) };
    return null;
  }
  function pick(list, artist, dur) {
    var a = norm(artist), best = null, score = -1;
    (list || []).forEach(function (r) {
      if (r.instrumental) return;
      var s = (r.syncedLyrics ? 4 : r.plainLyrics ? 1 : -9) + (a && norm(r.artistName).indexOf(a) >= 0 ? 3 : 0);
      if (dur && r.duration) s += Math.abs(r.duration - dur) < 3 ? 3 : Math.abs(r.duration - dur) < 10 ? 1 : -2;
      if (s > score) { score = s; best = r; }
    });
    return score > 0 ? best : null;
  }
  window.RoverLyrics = {
    get: function (t, cb) {
      if (!t || t.live || !t.title) return cb(null);
      var k = norm(t.artist) + "|" + norm(t.title);
      if (cache.hasOwnProperty(k)) return cb(cache[k] ? shape(cache[k]) : null);
      var q = "?track_name=" + encodeURIComponent(norm(t.title)) + (t.artist ? "&artist_name=" + encodeURIComponent(norm(t.artist)) : "");
      var x = new XMLHttpRequest(); x.open("GET", API + q); x.timeout = 10000;
      x.onload = function () {
        var list = null; try { list = JSON.parse(x.responseText); } catch (e) {}
        if (x.status !== 200 || !list) return cb(null);           // network trouble: don't cache, try again next time
        var r = pick(list, t.artist, t.duration);
        cache[k] = r ? { syncedLyrics: r.syncedLyrics || "", plainLyrics: r.plainLyrics || "" } : 0; save();
        cb(shape(r));
      };
      x.onerror = x.ontimeout = function () { cb(null); };
      x.send();
    }
  };
})();
