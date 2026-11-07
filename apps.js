// Edit this file to change your shortcuts.
// id    = Samsung/Tizen app ID (fallback)
// match = regex tested against installed app names; if the TV reports a match, that ID wins
// Tip: press the YELLOW button on the remote inside Rover Home to list every installed app and its ID.
window.ROVER_APPS = [
  { name: "Netflix",     id: "3201907018807", match: /netflix/i,          accent: "#e5142b", heroName: [0.04, 0.655], tileName: [0.08, 0.79] },
  { name: "YouTube",     id: "111299001912",  match: /^youtube$|youtube tv/i, accent: "#ff2a3d", heroName: [0.024, 0.62], tileName: [0.1, 0.6] },
  { name: "Peacock",     id: "3201909019271", match: /peacock/i,          accent: "#e3a92f", heroName: [0.04, 0.665], tileName: [0.1, 0.575] },
  { name: "Prime Video", id: "3201910019365", match: /prime video/i,      accent: "#38bdf8", heroName: [0.036, 0.69], tileName: [0.09, 0.675] },
  { name: "Disney+",     id: "3201901017640", match: /disney/i,           accent: "#6d7cff", heroName: [0.05, 0.635], tileName: [0.09, 0.625] },
  { name: "Hulu",        id: "3201601007625", match: /hulu/i,             accent: "#34d399", heroName: [0.05, 0.62], tileName: [0.09, 0.6] },
  { name: "Max",         id: "3202301029760", match: /^max$|hbo/i,        accent: "#4f7dff", heroName: [0.065, 0.58], tileName: [0.09, 0.555] },
  { name: "Apple TV",    id: "3201807016597", match: /apple tv/i,         accent: "#d4d8df", heroName: [0.045, 0.62], tileName: [0.11, 0.555] },
  { name: "Zeus",        id: "",              match: /zeus/i,             accent: "#ff2a3d", accent2: "#3d6bff" },
  { name: "Spotify",     id: "3201606009684", match: /spotify/i,          accent: "#22c55e", heroName: [0.028, 0.58], tileName: [0.1, 0.45] }
];

// Weather location (public build: general area only)
window.ROVER_LOCATION = { label: "Home", lat: 39.16, lon: -75.52, tz: "America/New_York" };
