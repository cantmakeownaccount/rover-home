// Optional Apple Music source for Rover Home (MusicKit JS v3).
// Uses Apple's authorized streaming player for the signed-in subscriber; it never downloads tracks.
(function () {
  var music = null, initCallbacks = null, endedHandlers = [];
  var SCRIPT_URL = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";

  function errorText(err) {
    return err && err.message ? err.message : String(err || "Apple Music could not complete that request.");
  }
  function trim(s) { return (s || "").replace(/^\s+|\s+$/g, ""); }
  function configured() {
    var cfg = window.ROVER_MUSIC_CFG || {};
    return !!trim(cfg.appleMusicDeveloperToken);
  }
  function completeInit(err, instance) {
    var callbacks = initCallbacks || [];
    initCallbacks = null;
    if (!err) {
      music = instance;
      try { music.autoplayEnabled = false; } catch (e) {}
      // The launcher runs its own queue, so it plays one song at a time and moves on when it ends.
      try {
        music.addEventListener("playbackStateDidChange", function (ev) {
          var S = window.MusicKit && window.MusicKit.PlaybackStates || {};
          var st = ev && ev.state !== undefined ? ev.state : music.playbackState;
          if (st === S.completed || st === S.ended) endedHandlers.forEach(function (h) { try { h(); } catch (e) {} });
        });
      } catch (e) {}
    }
    callbacks.forEach(function (cb) { cb(err, instance); });
  }
  function init(cb) {
    if (!configured()) return cb(new Error("Apple Music needs a MusicKit developer token. Run tools/make_apple_music_token.js on your computer."));
    if (music) return cb(null, music);
    if (initCallbacks) { initCallbacks.push(cb); return; }
    initCallbacks = [cb];

    var done = false;
    function configure() {
      if (done) return;
      if (!window.MusicKit || !window.MusicKit.configure) return;
      done = true;
      var cfg = window.ROVER_MUSIC_CFG || {};
      try {
        Promise.resolve(window.MusicKit.configure({
          developerToken: trim(cfg.appleMusicDeveloperToken),
          app: { name: "Rover Home", build: "1.0.0" }
        })).then(function (inst) {
          completeInit(null, inst || window.MusicKit.getInstance());
        }).catch(function (err) { completeInit(new Error(errorText(err))); });
      } catch (err) { completeInit(new Error(errorText(err))); }
    }

    if (window.MusicKit && window.MusicKit.configure) return configure();
    document.addEventListener("musickitloaded", configure);
    var script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.onload = function () { setTimeout(configure, 0); };
    script.onerror = function () { done = true; completeInit(new Error("Could not reach Apple Music. Check the TV's internet connection.")); };
    document.head.appendChild(script);
  }
  function authorized(cb) {
    init(function (err, instance) {
      if (err) return cb(err);
      if (instance.isAuthorized) return cb(null, instance);
      try {
        instance.authorize().then(function () {
          if (instance.isAuthorized) cb(null, instance);
          else cb(new Error("Apple Music sign-in was canceled."));
        }).catch(function (authErr) { cb(new Error(errorText(authErr))); });
      } catch (authErr) { cb(new Error(errorText(authErr))); }
    });
  }
  // v3: every API call goes through api.music(path, params) and returns { data: <Apple JSON> }
  function get(instance, path, params) {
    return instance.api.music(path, params || {}).then(function (res) { return (res && res.data) || {}; });
  }
  function art(a, size) {
    var u = a && a.artwork && a.artwork.url || "";
    return u.replace(/\{w\}/g, size).replace(/\{h\}/g, size).replace(/\{f\}/g, "jpg");
  }
  function mapTrack(resource) {
    var a = (resource && resource.attributes) || {};
    var play = a.playParams || {};
    var id = play.catalogId || play.id || resource.id || "";
    return {
      id: "apple:" + id,
      appleId: id,
      provider: "apple",
      title: a.name || "Apple Music track",
      artist: a.artistName || "Apple Music",
      art: art(a, "600"),
      lic: ""
    };
  }
  function songs(list) {
    return (list || []).filter(function (r) { return r && r.attributes && r.attributes.playParams; }).map(mapTrack);
  }
  function mapPlaylist(r) {
    var a = (r && r.attributes) || {};
    return { id: "applepl:" + r.id, plId: r.id, title: a.name || "Playlist", artist: "Playlist", art: art(a, "600"), provider: "apple-playlist" };
  }
  function pages(instance, path, map, cap, cb) {
    var out = [];
    (function page(offset) {
      get(instance, path, { limit: 100, offset: offset }).then(function (d) {
        var data = d.data || [];
        out = out.concat(map(data));
        if (d.next && data.length && out.length < cap) page(offset + data.length); else cb(null, out);
      }).catch(function (e) { cb(out.length ? null : new Error(errorText(e)), out); });
    })(0);
  }

  window.RoverAppleMusic = {
    isConfigured: configured,
    isAuthorized: function () { return !!(music && music.isAuthorized); },
    prepare: function (cb) { init(cb || function () {}); },
    connect: function (cb) { authorized(function (err) { cb(err || null); }); },
    onEnded: function (h) { endedHandlers.push(h); },

    // Whole Apple Music catalog (search works before sign-in; playing needs a subscription).
    searchCatalog: function (term, cb) {
      init(function (err, instance) {
        if (err) return cb(err, []);
        get(instance, "/v1/catalog/{{storefrontId}}/search", { term: term, types: "songs", limit: 25 }).then(function (d) {
          cb(null, songs(d.results && d.results.songs && d.results.songs.data));
        }).catch(function (e) { cb(new Error(errorText(e)), []); });
      });
    },
    // The signed-in person's library, 100 songs per page.
    libraryPage: function (offset, cb) {
      authorized(function (err, instance) {
        if (err) return cb(err, { items: [], more: false });
        get(instance, "/v1/me/library/songs", { limit: 100, offset: offset || 0 }).then(function (d) {
          var data = d.data || [];
          cb(null, { items: songs(data), more: !!d.next, count: data.length });
        }).catch(function (e) { cb(new Error(errorText(e)), { items: [], more: false }); });
      });
    },
    libraryPlaylists: function (cb) {
      authorized(function (err, instance) {
        if (err) return cb(err, []);
        pages(instance, "/v1/me/library/playlists", function (d) { return d.map(mapPlaylist); }, 1000, cb);
      });
    },
    playlistTracks: function (plId, cb) {
      authorized(function (err, instance) {
        if (err) return cb(err, []);
        pages(instance, "/v1/me/library/playlists/" + encodeURIComponent(plId) + "/tracks", songs, 2000, cb);
      });
    },

    play: function (songId, cb) {
      authorized(function (err, instance) {
        if (err) return cb(err);
        instance.setQueue({ song: songId }).then(function () { return instance.play(); })
          .then(function () { cb(null); }).catch(function (playErr) { cb(new Error(errorText(playErr))); });
      });
    },
    resume: function () { try { if (music) music.play(); } catch (e) {} },
    pause: function () { try { if (music) music.pause(); } catch (e) {} },
    seek: function (seconds) { try { if (music) music.seekToTime(Math.max(0, seconds)); } catch (e) {} },
    currentTime: function () { return music ? Number(music.currentPlaybackTime) || 0 : 0; },
    duration: function () { return music ? Number(music.currentPlaybackDuration) || 0 : 0; },
    isPlaying: function () { return !!(music && music.isPlaying); }
  };
})();
