# Chess Better

Chrome extension that displays opponent information in a draggable widget on **chess.com** and **lichess.org**, and blocks ads on chess.com.

## Supported Sites

| Site | Opponent Widget | Ad Blocker | Mode Detection |
|---|---|---|---|
| **chess.com** | Yes | Yes | Rating comparison, page title, archive lookup |
| **lichess.org** | Yes | N/A (no ads) | Page title, game info, game API, rating comparison |

## Features

### Opponent Info Widget
When viewing any game (live, daily, spectating, or reviewing), the extension detects both players and displays a draggable overlay widget with the **top player's** (opponent) information:

| Field | Description |
|---|---|
| **Status** | Online/offline status |
| **Country** | Country flag + code |
| **Joined** | Account creation date (YYYY.MM.DD) |
| **Peak Elo** | Highest rating (mode-specific). chess.com: from stats API. lichess: computed from recent games |
| **vs Peak** | Current rating minus peak rating |
| **Games** | Total games played (mode-specific) |
| **Win Rate** | Win percentage from recent games |
| **Avg Opp** | Average opponent rating (last 20 games) |
| **Streak** | Current win/loss streak |
| **Last 10** | W/L/D results of last 10 games (colored: green=W, red=L, gray=D) |
| **Timeout** | Timeout loss percentage |
| **H2H** | Head-to-head record vs bottom player |

All game-related stats are **mode-specific** — only data for the detected time control (rapid/blitz/bullet/classical).

### Settings Popup
Click the extension icon to open a settings popup with toggles for:
- **Widget Enabled** — master on/off toggle
- **12 individual field toggles** — each info row can be shown/hidden independently
- Settings saved in `chrome.storage.sync`, apply instantly
- Organized into sections: Profile, Rating, Record

### Ad Blocker (chess.com only)
Removes chess.com ads via DOM removal + MutationObserver (always active, independent of widget).

---

## Architecture

```
popup.html/popup.js ──→ chrome.storage.sync("chessBetter") ──→ content.js
(settings UI)              (persisted config)                   (main logic)

background.js ──→ badge "ON"/"OFF" on storage change

content.js:
  ├── SITE detection (hostname → "chesscom" | "lichess")
  ├── Ad Blocker (chess.com only, MutationObserver, 500ms throttle)
  ├── Game Detection Loop (setInterval 1s)
  │     ├── chess.com: getChesscomPlayers()
  │     └── lichess:   getLichessPlayers()
  ├── Mode Detection (site-specific, multi-strategy)
  │     ├── chess.com: rating comparison → page title → archive lookup
  │     └── lichess:   page title → game info → game API → rating comparison
  ├── API calls (site-specific)
  │     ├── chess.com: /pub/player, /pub/player/stats, /pub/player/games/archives
  │     └── lichess:   /api/user/{user}, /api/games/user/{user}, /api/game/{id}
  ├── Game Processing (shared: parseGameResult handles both sites)
  └── Widget (shared: draggable, position saved in chrome.storage.local)
```

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Manifest V3. Content script injected on `chess.com` and `lichess.org`. Host permissions for both APIs. |
| `content.js` | Main runtime. Site detection → site-specific player/mode/API logic → shared widget rendering. |
| `widget.css` | Widget styling. Dark glassmorphism, monospace font, fixed position, z-index 99999. |
| `popup.html` | Settings popup UI (280px). Dark theme, toggle switches. |
| `popup.js` | Popup logic. Reads/writes `chrome.storage.sync` key `"chessBetter"`. |
| `background.js` | Service worker. Updates badge text (ON/OFF) on settings change. |
| `icons/` | Extension icons (48px, 128px). |

## content.js — Site-Specific Behavior

### Player Detection

**chess.com:**
- Containers: `.player-top`, `.player-bottom` (fallbacks: `.board-layout-top/bottom`)
- Username selectors (priority): `[data-cy="user-tagline-username"]`, `[data-test-element="user-tagline-username"]`, `.user-tagline-username`, `.cc-user-username-component`, `a.user-username-component`, `a[href*='/member/']`
- Rating selectors: `[data-cy="user-tagline-rating"]`, `.user-tagline-rating`, `[class*="cc-user-rating"]`
- Filters placeholder text ("opponent", "player")

**lichess.org:**
- Username from `.ruser .user-link` elements — extracts username from `href` (`/@/username`)
- Falls back to `.game__meta .player .user-link`
- Rating from `.ruser rating` elements
- DOM order: index 0 = top (opponent), index 1 = bottom (me)

### Game Mode Detection

**chess.com (3 strategies):**
1. Rating comparison: displayed rating vs API `stats.chess_{mode}.last.rating` (trust if diff < 50)
2. Page title scan for "bullet"/"blitz"/"rapid"
3. Archive lookup: extract game ID from URL → search archives for matching game → read `time_class`

**lichess.org (4 strategies):**
1. Page title scan
2. `.game__meta .header` text scan
3. Rating comparison: displayed rating vs `perfs.{mode}.rating`
4. Game API: `GET /api/game/{gameId}` → read `speed` field

### API Endpoints

**chess.com:**
```
GET https://api.chess.com/pub/player/{username}
  → joined, country, status

GET https://api.chess.com/pub/player/{username}/stats
  → chess_rapid/chess_blitz/chess_bullet .best .last .record

GET https://api.chess.com/pub/player/{username}/games/archives
  → list of monthly archive URLs

GET https://api.chess.com/pub/player/{username}/games/{YYYY}/{MM}
  → array of game objects with: white, black, time_class, url, end_time
```

**lichess.org:**
```
GET https://lichess.org/api/user/{username}
  → createdAt, profile.country, online, perfs.{mode}.rating/.games

GET https://lichess.org/api/games/user/{username}?max=50&perfType={mode}
  → NDJSON stream of game objects with: players, winner, status, speed

GET https://lichess.org/api/game/{gameId}
  → single game object with speed field (for mode detection)
```

No authentication required for either API.

### Game Result Parsing

Shared `parseGameResult()` function handles both sites:

**chess.com:** `game[side].result` — "win" = W, "checkmated"/"timeout"/"resigned"/"abandoned" = L, else = D

**lichess.org:** `game.winner` — matches side = W, doesn't match = L, undefined = D. Timeout detected via `game.status === "outoftime"`

### Peak Elo

**chess.com:** Available directly from stats API (`chess_{mode}.best.rating` + `.best.date`)

**lichess.org:** Not in profile API. Computed by scanning recent games and finding the highest rating the player had.

## Known Issues / Challenges

### chess.com SPA
- Vue.js SPA — `setInterval` polling instead of URL-based detection
- Widget on `document.body` to survive re-renders
- `fetching` lock with reset on opponent switch

### Mode Detection
- chess.com rating comparison fails for completed/spectated games (displayed = in-game rating, not current)
- Archive lookup requires extra API calls
- lichess game API fallback is most reliable

### Username Detection Timing
- Both sites render player elements asynchronously
- Placeholder text filtered out; 1s polling waits for real data

### Lichess Peak Rating
- No API endpoint for historical peak — only approximated from recent games (max 50)
- Actual all-time peak may be higher than what's shown

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the `chesscombetter` folder
5. Visit chess.com or lichess.org — widget appears automatically when viewing games
6. Click extension icon to configure visible fields

## License

MIT
