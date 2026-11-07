// Rover Home profiles. Edit freely: names, themes, wallpapers, and which tiles each person sees.
// Everything here can also be changed on the TV in the Control Center.
//
// theme:  scarlet | aurora | ember | ocean | orchid | gold | mono
// wall:   leopard | aurora | ember | midnight | orchid | custom
//         custom = your own picture at profiles/<id>/wallpaper.jpg (and wallpaper-frost.jpg if you have a blurred copy)
// hidden: tiles this profile does not see, e.g. ["plex","hulu"]  (tile names as in tile-art/README.txt)
// main:   true = the original profile that keeps your existing saved songs and settings
// After the first run, the TV's Control Center (Green button) is the boss. To make the TV re-read this file,
// raise this number by 1 (or use Control Center > TV & system > Reset profiles).
window.ROVER_PROFILES_REV = 1;

window.ROVER_THEMES = {
  scarlet: { name: "Scarlet", a: "#ff2a3d", b: "#8b5cf6" },
  aurora:  { name: "Aurora",  a: "#34d399", b: "#38bdf8" },
  ember:   { name: "Ember",   a: "#fb923c", b: "#f43f5e" },
  ocean:   { name: "Ocean",   a: "#38bdf8", b: "#6366f1" },
  orchid:  { name: "Orchid",  a: "#f472b6", b: "#a78bfa" },
  gold:    { name: "Gold",    a: "#fbbf24", b: "#f97316" },
  mono:    { name: "Mono",    a: "#e5e7eb", b: "#9ca3af" }
};
window.ROVER_WALLS = {
  leopard:  { name: "Leopard",  img: "leopard-dark.jpg",    frost: "leopard-frost.jpg" },
  aurora:   { name: "Aurora",   img: "wall-aurora.jpg",     frost: "wall-aurora-frost.jpg" },
  ember:    { name: "Ember",    img: "wall-ember.jpg",      frost: "wall-ember-frost.jpg" },
  midnight: { name: "Midnight", img: "wall-midnight.jpg",   frost: "wall-midnight-frost.jpg" },
  orchid:   { name: "Orchid",   img: "wall-orchid.jpg",     frost: "wall-orchid-frost.jpg" }
};
window.ROVER_PROFILES = [
  { id: "stxr",   name: "Stxr",     main: true, theme: "scarlet", wall: "leopard",  emblem: true, hidden: [] },
  { id: "guest1", name: "Friend 1",             theme: "aurora",  wall: "aurora",   emblem: false, hidden: [] },
  { id: "guest2", name: "Friend 2",             theme: "ember",   wall: "ember",    emblem: false, hidden: [] }
];
