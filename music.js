// ------------------------------------------------------------
// Rover music settings
// ------------------------------------------------------------
// The player mixes music from open catalogs into one endless queue and never
// shows where a track came from (creator + license are shown for credit).
//
// jamendoClientId : free key from devportal.jamendo.com (takes ~2 minutes).
//                   Without it the player still works using the other open sources.
// Each mood lists search words per source. Edit freely.
window.ROVER_MUSIC_CFG = {
  jamendoClientId: "",
  // TV only: address of the YouTube player page the iMac serves ("TV YouTube Relay"). Filled in by "Install on TV".
  ytRelay: "",
  // Free YouTube music (search + playlists). Get a free key: console.cloud.google.com ->
  // new project -> enable "YouTube Data API v3" -> Credentials -> API key. About 100 searches a day free.
  youtubeApiKey: "AIzaSyByP5JAyse2tzL4DLmODP64NDo1x9tGFlY",
  // Public YouTube playlists to show in Library -> Playlists. id = the part after "list=" in the link.
  youtubePlaylists: [
    // { name: "My mix", id: "PLxxxxxxxxxxxxxxxx" }
  ],
  moods: [
    { id: "chill",    name: "Chill",       desc: "Slow, warm, easy",        color: "#8b5cf6", jamendo: ["chillout", "relaxing"],  archive: ["chillout", "ambient", "downtempo"], audius: ["Downtempo", "Lo-Fi", "Ambient"], radio: "chillout" },
    { id: "focus",    name: "Focus",       desc: "Instrumental, no lyrics", color: "#38bdf8", jamendo: ["ambient", "instrumental"], archive: ["ambient", "instrumental"],        audius: ["Ambient", "Classical"], radio: "ambient" },
    { id: "night",    name: "Late Night",  desc: "Dim lights, deep groove", color: "#6d28d9", jamendo: ["downtempo", "lounge"],   archive: ["downtempo", "trip hop"],            audius: ["Downtempo", "R&B/Soul", "Deep House"], radio: "lounge" },
    { id: "energy",   name: "Energy",      desc: "Up on your feet",         color: "#ff2a3d", jamendo: ["energetic", "electronic"], archive: ["electronic", "dance"],            audius: ["Electronic", "Dance & EDM", "House"], radio: "dance" },
    { id: "jazz",     name: "Jazz Lounge", desc: "Smoky and smooth",        color: "#fbbf24", jamendo: ["jazz", "lounge"],        archive: ["jazz"],                             audius: ["Jazz", "Funk"], radio: "jazz" },
    { id: "lofi",     name: "Lo-fi",       desc: "Dusty beats",             color: "#34d399", jamendo: ["lofi", "hiphop"],        archive: ["lo-fi", "lofi", "beats"],           audius: ["Lo-Fi", "Hip-Hop/Rap"], radio: "lofi" },
    { id: "acoustic", name: "Acoustic",    desc: "Strings and voices",      color: "#fb923c", jamendo: ["acoustic", "folk"],      archive: ["acoustic", "folk"],                 audius: ["Acoustic", "Folk", "Singer-Songwriter"], radio: "folk" },
    { id: "radio",    name: "Live Radio",  desc: "Stations, always on",     color: "#d0d4db", radioOnly: true,                                                                radio: "" }
  ]
};

// Demo tones (original) used only if no source can be reached.
window.ROVER_MUSIC = [
  { title: "Velvet Signal", artist: "Rover Demo", src: "audio/demo1.wav" },
  { title: "Scarlet Hours", artist: "Rover Demo", src: "audio/demo2.wav" }
];

// Input shortcuts. hdmi = the HDMI port number your PS5 is plugged into.
window.ROVER_INPUTS = { ps5: { label: "PS5", hdmi: 1 } };
