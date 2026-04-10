# Chess Better

Chrome extension that displays opponent information in a draggable widget on chess.com and blocks ads.

## Features

### Opponent Info Widget
When viewing any game on chess.com (live, daily, spectating, or reviewing), the extension detects both players and displays a draggable overlay widget with the **top player's** (opponent) information:

| Field | Description | Source |
|---|---|---|
| **Status** | Online/offline status | `GET /pub/player/{username}` → `status` |
| **Country** | Country flag + code | `GET /pub/player/{username}` → `country` |
| **Joined** | Account creation date (YYYY.MM.DD) | `GET /pub/player/{username}` → `joined` |
| **Peak Elo** | Highest rating + date achieved (mode-specific) | `GET /pub/player/{username}/stats` → `chess_{mode}.best` |
| **vs Peak** | Current rating minus peak rating | `stats.{mode}.last.rating - stats.{mode}.best.rating` |
| **Games** | Total games played (mode-specific) | `stats.{mode}.record` (win+loss+draw) |
| **Win Rate** | Win percentage from recent games | Calculated from recent archives |
| **Avg Opp** | Average opponent rating (last 20 games) | Calculated from recent archives |
| **Streak** | Current win/loss streak | Calculated from last 10 games |
| **Last 10** | W/L/D results of last 10 games | Colored: green=W, red=L, gray=D |
| **Timeout** | Timeout loss percentage | Calculated from recent archives |
| **H2H** | Head-to-head record vs bottom player | Calculated from recent archives |

All game-related stats (Peak Elo, Games, Win Rate, Last 10, Streak, etc.) are **mode-specific** — they only show data for the detected time control (rapid/blitz/bullet).

### Settings Popup
Click the extension icon to open a settings popup with toggles for:
- **Widget Enabled** — master on/off toggle
- **12 individual field toggles** — each info row can be shown/hidden independently
- Settings are saved in `chrome.storage.sync` and apply instantly (no page refresh needed)
- Organized into sections: Profile, Rating, Record

### Ad Blocker
Removes chess.com ads via DOM removal + MutationObserver (always active, independent of widget).

---

## Architecture

```
popup.html/popup.js ──→ chrome.storage.sync("chessBetter") ──→ content.js
(settings UI)              (persisted config)                   (main logic)

background.js ──→ badge "ON"/"OFF" on storage change

content.js:
  ├── Ad Blocker (MutationObserver, 500ms throttle)
  ├── Game Detection Loop (setInterval 1s)
  │     └── getPlayers() → detect top/bottom usernames
  ├── Mode Detection (multi-strategy)
  │     ├── 1. Rating comparison (displayed vs API stats, diff < 50)
  │     ├── 2. Page title scan
  │     └── 3. Archive lookup (game ID from URL → time_class)
  ├── API calls (chess.com public API)
  │     ├── /pub/player/{username} (profile)
  │     ├── /pub/player/{username}/stats (ratings)
  │     └── /pub/player/{username}/games/archives (game history)
  └── Widget (draggable, position saved in chrome.storage.local)
```

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Chrome Extension Manifest V3. Permissions: `storage`, `activeTab`. Host permission: `api.chess.com`. Content script injected at `document_idle` on `chess.com`. |
| `content.js` | Main runtime (~700 lines). Ad blocker, game/player detection, chess.com API integration, mode detection, widget rendering, drag handling. |
| `widget.css` | Widget styling. Dark glassmorphism theme, monospace font, fixed position, z-index 99999. |
| `popup.html` | Settings popup UI (280px wide). Dark theme, toggle switches for each field. |
| `popup.js` | Popup logic. Reads/writes `chrome.storage.sync` key `"chessBetter"`. |
| `background.js` | Service worker. Updates extension badge text (ON/OFF) when settings change. |
| `icons/` | Extension icons (48px, 128px). |

## content.js — Detailed Behavior

### Player Detection
- Uses `setInterval(checkGame, 1000)` to continuously scan for player elements
- Searches `.player-top` and `.player-bottom` (with fallbacks to `.board-layout-top`/`.board-layout-bottom`)
- Username selectors (in priority order):
  1. `[data-cy="user-tagline-username"]`
  2. `[data-test-element="user-tagline-username"]`
  3. `.user-tagline-username`
  4. `.cc-user-username-component`
  5. `a.user-username-component`
  6. `a[href*='/member/']`
- Filters out placeholder text ("opponent", "player") to avoid detecting before Vue renders actual usernames
- Removes title prefixes (GM, IM, FM, etc.)
- Bottom player = me, Top player = opponent

### Rating Element Detection
- Selectors: `[data-cy="user-tagline-rating"]`, `.user-tagline-rating`, `[class*="cc-user-rating"]`, `[class*="user-rating"]`
- Extracts first number from text (handles formats like "(1846)")

### Game Mode Detection (Multi-Strategy)
chess.com doesn't directly expose the time control in the DOM. The extension uses three strategies:

1. **Rating comparison**: Compare opponent's displayed rating against their API stats for each mode (rapid/blitz/bullet). Only trust if diff < 50. This works for live games where displayed rating ≈ current API rating.

2. **Page title**: Scan `document.title` for "bullet", "blitz", "rapid" keywords.

3. **Archive lookup** (most reliable for spectating/reviewing): Extract game ID from URL (`/game/live/167121958364` → `167121958364`), fetch opponent's game archives, find the matching game by URL, and read its `time_class` field. Falls back to latest archive game's time_class if exact game not found.

### API Data Collection
- Profile + stats fetched in parallel via `Promise.all`
- Game archives fetched sequentially from most recent month, up to 3 months back, until 50+ games collected
- Archives are mode-filtered (only games matching detected time_class)

### Widget
- Appended to `document.body` (outside React/Vue tree to survive SPA re-renders)
- Draggable via mousedown/mousemove/mouseup on header
- Position saved to `chrome.storage.local` and restored on next load
- Clamped to viewport boundaries

### Ad Blocker
- 18 CSS selectors targeting ad containers, iframes, and placeholders
- Removes elements from DOM; collapses empty parent containers
- MutationObserver watches for dynamically injected ads (500ms throttle)

## Known Issues / Challenges

### chess.com SPA
chess.com is a Vue.js SPA. Page navigation doesn't trigger full reloads, so the content script must handle state changes carefully:
- `setInterval` polling instead of URL-based detection
- Widget placed on `document.body` to avoid being wiped by Vue re-renders
- `fetching` lock with reset mechanism to handle rapid opponent switches

### Mode Detection Limitations
- **Rating comparison** fails when viewing completed games (displayed rating ≈ in-game rating, not current API rating, so diff is large)
- **Archive lookup** requires extra API calls and may be slow for users with many games
- If mode detection fails entirely, mode-specific fields (Peak Elo, Games, vs Peak, Total Games) show "N/A"

### Username Detection Timing
- chess.com Vue components render asynchronously — username elements may not exist when content script first runs
- Placeholder text "opponent" may appear before actual usernames render
- Solved with: 1s polling interval + placeholder text filtering

## chess.com Public API Endpoints Used

```
GET https://api.chess.com/pub/player/{username}
  → joined, country, status

GET https://api.chess.com/pub/player/{username}/stats
  → chess_rapid/chess_blitz/chess_bullet .best .last .record

GET https://api.chess.com/pub/player/{username}/games/archives
  → list of monthly archive URLs

GET https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}
  → array of game objects with: white, black, time_class, url, end_time, etc.
```

No authentication required. Rate limits apply (undocumented, but generally ~100 req/min is safe).

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `chesscombetter` folder
5. Visit chess.com — widget appears automatically when viewing games
6. Click extension icon to configure visible fields

## License

MIT
