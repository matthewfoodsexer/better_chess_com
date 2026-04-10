// Update badge when settings change
chrome.storage.onChanged.addListener((changes) => {
  if (!changes.chessBetter) return;
  const enabled = changes.chessBetter.newValue?.enabled !== false;
  chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? "#4CAF50" : "#666" });
});

// Set initial badge
chrome.runtime.onInstalled.addListener(async () => {
  const { chessBetter } = await chrome.storage.sync.get("chessBetter");
  const enabled = chessBetter?.enabled !== false;
  chrome.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: enabled ? "#4CAF50" : "#666" });
});
