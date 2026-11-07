// Free music source for Rover Home: YouTube, through YouTube's official embedded player.
// The video always stays on screen (big on Now Playing, a corner window elsewhere), which is
// what YouTube's terms require. It never extracts or downloads audio.
(function () {
  var player = null, ready = false, waiting = [], endedHandlers = [], errorHandlers = [], loading = false;
  var API = "https://www.googleapis.com/youtube/v3/";

  function key() { var c = window.ROVER_MUSIC_CFG || {}; return (c.youtubeApiKey || "").replace(/^\s+|\s+$/g, ""); }
  function decode(s) { var t = document.createElement("textarea"); t.innerHTML = s || ""; return t.value; }
  function getJSON(url, cb) {
    var x = new XMLHttpRequest();
    x.open("GET", url); x.timeout = 12000;
    x.onload = function () {
      var j = null; try { j = JSON.parse(x.responseText); } catch (e) {}
      if (x.status >= 200 && x.status < 300 && j) return cb(null, j);
      var msg = j && j.error && j.error.message || "YouTube search failed (" + x.status + ")";
      if (/quota/i.test(msg)) msg = "YouTube's free daily search limit is used up. It resets at midnight Pacific.";
      cb(new Error(msg));
    };
    x.onerror = x.ontimeout = function () { cb(new Error("Couldn't reach YouTube.")); };
    x.send();
  }
  // "Artist - Song (Official Video)" -> { artist, title }
  function tidy(rawTitle, channel) {
    var title = decode(rawTitle), artist = decode(channel).replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "");
    title = title.replace(/\s*[\(\[][^\)\]]*(official|video|audio|lyric|visuali[sz]er|music video|hd|4k|remaster)[^\)\]]*[\)\]]/gi, "").replace(/\s+/g, " ").trim();
    var m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(title);
    if (m) { artist = m[1]; title = m[2]; }
    return { title: title, artist: artist };
  }
  function mapItems(items) {
    return (items || []).map(function (it) {
      var id = it.id && (it.id.videoId || (typeof it.id === "string" ? it.id : "")) || (it.snippet && it.snippet.resourceId && it.snippet.resourceId.videoId);
      var sn = it.snippet || {}, th = sn.thumbnails || {};
      if (!id || sn.title === "Deleted video" || sn.title === "Private video") return null;
      var n = tidy(sn.title, sn.videoOwnerChannelTitle || sn.channelTitle);
      return { id: "yt:" + id, ytId: id, provider: "youtube", title: n.title, artist: n.artist,
               art: (th.maxres || th.high || th.medium || th["default"] || {}).url || "", lic: "" };
    }).filter(Boolean);
  }

  var blocked = false; // set when YouTube refuses this page (error 153); stays off until reload
  // On the TV the app runs from a file, which YouTube refuses (error 153). There, use the player page the iMac serves.
  function relayUrl() {
    var c = window.ROVER_MUSIC_CFG || {};
    return (c.ytRelay && !/^https?:$/.test(location.protocol)) ? c.ytRelay : "";
  }
  function loadRelay(url) {
    var host = document.getElementById("yt-player"), fr = document.createElement("iframe"), rs = { state: -1, cur: 0, dur: 0 };
    fr.src = url; fr.allow = "autoplay; encrypted-media"; fr.setAttribute("frameborder", "0");
    fr.style.width = "100%"; fr.style.height = "100%"; fr.style.border = "0";
    host.appendChild(fr);
    function cmd(m) { try { fr.contentWindow.postMessage(JSON.stringify(m), "*"); } catch (e) {} }
    player = {
      loadVideoById: function (id) { rs.cur = 0; rs.dur = 0; cmd({ cmd: "load", id: id }); },
      unMute: function () {}, setVolume: function () {},
      playVideo: function () { cmd({ cmd: "play" }); }, pauseVideo: function () { cmd({ cmd: "pause" }); },
      stopVideo: function () { cmd({ cmd: "stop" }); }, seekTo: function (t) { cmd({ cmd: "seek", t: t }); },
      getCurrentTime: function () { return rs.cur; }, getDuration: function () { return rs.dur; },
      getPlayerState: function () { return rs.state; }
    };
    var to = setTimeout(function () {
      if (ready) return;
      loading = false; var w = waiting; waiting = [];
      w.forEach(function (f) { f(new Error("Can't reach the iMac's YouTube player. Is Rover Home running on the iMac?")); });
    }, 12000);
    window.addEventListener("message", function (e) {
      if (e.source !== fr.contentWindow) return;
      var m; try { m = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch (x) { return; }
      if (!m || !m.ev) return;
      if (m.ev === "ready") { clearTimeout(to); ready = true; var w = waiting; waiting = []; w.forEach(function (f) { f(null); }); }
      else if (m.ev === "time") { rs.cur = m.cur; rs.dur = m.dur; }
      else if (m.ev === "state") { rs.state = m.data; if (m.data === 0) endedHandlers.forEach(function (h) { try { h(); } catch (x) {} }); }
      else if (m.ev === "error") { handleErr(m.code); }
    });
  }
  function handleErr(code) {
    var msg = { 2: "That video link is broken.", 5: "This video can't play on the TV.", 100: "That video was removed.",
                101: "The uploader blocks playing this video in other apps.", 150: "The uploader blocks playing this video in other apps.",
                153: "YouTube won't play from this page. Open Rover Home through its web address instead." }[code] || "YouTube couldn't play that video.";
    if (code === 153) blocked = true;
    var er = new Error(msg); er.code = code;
    errorHandlers.forEach(function (h) { try { h(er); } catch (x) {} });
  }

  function loadApi(cb) {
    if (ready) return cb(null);
    if (relayUrl()) { waiting.push(cb); if (!loading) { loading = true; loadRelay(relayUrl()); } return; }
    waiting.push(cb);
    if (loading) return;
    loading = true;
    var prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (prev) try { prev(); } catch (e) {}
      player = new YT.Player("yt-player", {
        width: "100%", height: "100%",
        playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1, iv_load_policy: 3, disablekb: 1, fs: 0 },
        events: {
          onReady: function () { ready = true; var w = waiting; waiting = []; w.forEach(function (f) { f(null); }); },
          onStateChange: function (e) { if (e.data === 0) endedHandlers.forEach(function (h) { try { h(); } catch (x) {} }); },
          onError: function (e) {
            var msg = { 2: "That video link is broken.", 5: "This video can't play on the TV.", 100: "That video was removed.",
                        101: "The uploader blocks playing this video in other apps.", 150: "The uploader blocks playing this video in other apps.",
                        153: "YouTube won't play from this page. Open Rover Home through its web address instead." }[e.data] || "YouTube couldn't play that video.";
            if (e.data === 153) blocked = true;
            var er = new Error(msg); er.code = e.data;
            errorHandlers.forEach(function (h) { try { h(er); } catch (x) {} });
          }
        }
      });
    };
    var s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = function () { loading = false; var w = waiting; waiting = []; w.forEach(function (f) { f(new Error("Couldn't reach YouTube.")); }); };
    document.head.appendChild(s);
  }

  window.RoverYouTube = {
    isConfigured: function () { return !!key() && !blocked; },
    isBlocked: function () { return blocked; },
    onEnded: function (h) { endedHandlers.push(h); },
    onError: function (h) { errorHandlers.push(h); },
    // Music-category video search. Each search costs 100 of the free 10,000 daily quota units (about 100 searches a day).
    search: function (q, cb) {
      if (!key()) return cb(new Error("Add a free YouTube API key in music.js."), []);
      getJSON(API + "search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&maxResults=20&q=" +
              encodeURIComponent(q) + "&key=" + encodeURIComponent(key()), function (e, j) {
        cb(e, e ? [] : mapItems(j.items));
      });
    },
    // Any public YouTube playlist (1 quota unit per 50 songs, so playlists are cheap).
    playlist: function (listId, cb) {
      if (!key()) return cb(new Error("Add a free YouTube API key in music.js."), []);
      var out = [];
      (function page(token) {
        getJSON(API + "playlistItems?part=snippet&maxResults=50&playlistId=" + encodeURIComponent(listId) +
                (token ? "&pageToken=" + token : "") + "&key=" + encodeURIComponent(key()), function (e, j) {
          if (e) return cb(out.length ? null : e, out);
          out = out.concat(mapItems(j.items));
          if (j.nextPageToken && out.length < 500) page(j.nextPageToken); else cb(null, out);
        });
      })("");
    },
    play: function (videoId, cb) {
      loadApi(function (err) {
        if (err) return cb(err);
        try { player.loadVideoById(videoId); player.unMute(); player.setVolume(100); cb(null); } catch (e) { cb(e); }
      });
    },
    resume: function () { try { if (player) player.playVideo(); } catch (e) {} },
    pause: function () { try { if (player) player.pauseVideo(); } catch (e) {} },
    stop: function () { try { if (player) player.stopVideo(); } catch (e) {} },
    seek: function (s) { try { if (player) player.seekTo(Math.max(0, s), true); } catch (e) {} },
    currentTime: function () { try { return player ? player.getCurrentTime() || 0 : 0; } catch (e) { return 0; } },
    duration: function () { try { return player ? player.getDuration() || 0 : 0; } catch (e) { return 0; } },
    isPlaying: function () { try { return !!player && player.getPlayerState() === 1; } catch (e) { return false; } }
  };
})();
