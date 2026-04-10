const FIELD_IDS = [
  "showJoined", "showPeak", "showRatingDiff", "showWinRate",
  "showStreak", "showLast10", "showTimeoutRate", "showH2H", "showCountry",
  "showTotalGames", "showAvgOpponent", "showStatus",
];

// Load saved settings
chrome.storage.sync.get("chessBetter", (res) => {
  const cfg = res.chessBetter || {};
  document.getElementById("enabled").checked = cfg.enabled !== false;

  const fields = cfg.fields || {};
  for (const id of FIELD_IDS) {
    const el = document.getElementById(id);
    if (el) el.checked = fields[id] !== false; // default true
  }
});

// Save on any change
document.addEventListener("change", () => {
  const enabled = document.getElementById("enabled").checked;
  const fields = {};
  for (const id of FIELD_IDS) {
    fields[id] = document.getElementById(id).checked;
  }
  chrome.storage.sync.set({ chessBetter: { enabled, fields } });
});
