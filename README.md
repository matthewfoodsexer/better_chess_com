# Chess Better

A Chrome extension that enhances chess.com with customizable dark themes, custom board/piece sets, and ad blocking.

## Features

- **11 Dark Themes** - Midnight, Charcoal, AMOLED, Ocean, Forest, Mocha, Rose, Nord, Dracula, Solarized, and chess.com Default
- **Custom Board Themes** - 14 board styles including Walnut, Burled Wood, Dark Wood, Tournament, and more
- **Custom Piece Sets** - 16 piece sets from chess.com and Lichess open-source collections (Staunty, Dubrovny, Cooke, California, Cburnett, Merida, Pirouetti, and more)
- **Custom Colors** - Full control over sidebar, panels, buttons, and text colors
- **Ad Blocker** - Removes ads and collapses empty ad containers
- **Font Selection** - Choose from 9 font options including Inter, Roboto, Poppins, JetBrains Mono, and more
- **Sidebar Width** - Adjustable sidebar width (150px - 350px)
- **Flat UI** - Removes rounded corners and shadows for a clean look
- **Live Apply** - Changes apply instantly without page refresh

## Installation

1. Clone or download this repository
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the `chesscombetter` folder
6. Visit chess.com

## Usage

Click the extension icon in the toolbar to open the settings popup.

- **Theme presets**: Click a theme card to load its colors
- **Board / Pieces**: Select from dropdown menus, preview pieces before applying
- **Custom colors**: Expand "+ Custom Colors" to fine-tune individual colors
- **Apply**: Click Apply to save and apply changes (no refresh needed)
- **Reset**: Click Reset to restore default settings

## Piece Sets

### Chess.com Built-in
Neo Wood, Wood, Tournament, Classic, Neo, Marble, Metal, Vintage, Glass

### Lichess Open Source
Staunty, Dubrovny, Cooke, California, Cburnett, Merida, Pirouetti

## How It Works

### Architecture

Chess Better is a Chrome Extension (Manifest V3) that uses `storage` permission and runs content scripts on `chess.com`. It has no background service worker; all logic runs in the content script and the popup.

```
popup.js  -->  chrome.storage.sync("chessBetter")  -->  content.js  -->  CSS variables on <html>
  (user saves)         (storage event fires)          (apply() runs)     (theme.css reads vars)
```

### Files

| File | Role |
|---|---|
| `manifest.json` | Chrome extension manifest (v3). Injects `theme.css` and `content.js` into `chess.com` at `document_start`. Uses only the `storage` permission. |
| `content.js` | Core runtime. Reads config from `chrome.storage.sync`, sets CSS custom properties (`--cb-*`) on `<html>`, manages board/piece theme URLs, loads Google Fonts, and removes ads. |
| `theme.css` | All visual styles. Only active when `.chess-better-theme` class is present on `<html>`. Uses CSS custom properties set by `content.js` to style every part of the page. Also contains a standalone ad-blocking section that hides ad elements via CSS regardless of theme state. |
| `popup.html` | Settings popup UI (300px wide). Contains toggles, dropdowns, color pickers, range sliders, and a theme preset grid. All styling is inline. |
| `popup.js` | Popup logic. Defines 11 theme presets as color objects, manages UI state, reads/writes config to `chrome.storage.sync`, and handles piece preview rendering. |

### content.js - Detailed Behavior

**Initialization**
1. Runs at `document_start` (before DOM is ready) inside an IIFE with `"use strict"`.
2. Reads saved config from `chrome.storage.sync` key `"chessBetter"`, merged with `DEFAULTS`.
3. If `document.body` exists, calls `apply()` immediately; otherwise waits for `DOMContentLoaded`.
4. Listens to `chrome.storage.onChanged` so changes from the popup apply instantly without refresh.

**`apply()` - Theme Application**
- Adds `.chess-better-theme` to `<html>` and `.dark-mode` to `<body>` (activates theme.css rules and chess.com's own dark mode).
- Sets 14 CSS custom properties (`--cb-bg`, `--cb-sidebar-bg`, `--cb-text`, `--cb-font`, etc.) on `document.documentElement.style`.
- Overrides chess.com's own CSS variables (`--globalBackground`, `--globalSecondaryBackground`, etc.) to ensure consistent dark backgrounds.
- When theme is disabled, removes all custom properties and classes, restoring chess.com defaults.

**Board Theme**
- Sets `--theme-board-style-image` to a chess.com CDN URL (`images.chesscomfiles.com/chess-themes/boards/{name}/150.png`) with `!important`, overriding chess.com's board texture.

**Piece Theme**
- For each of 12 piece codes (`wp`, `wn`, `wb`, ... `bk`), sets `--theme-piece-set-{code}` to the piece image URL.
- Chess.com pieces: PNG from `images.chesscomfiles.com/chess-themes/pieces/{name}/150/{code}.png`.
- Lichess pieces (staunty, dubrovny, cooke, california, cburnett, merida, pirouetti): SVG from GitHub raw (`lichess-org/lila/master/public/piece/{name}/{Code}.svg`), using a mapping table (`wp` -> `wP`, etc.).

**Font Loading**
- Dynamically injects a `<link>` element pointing to Google Fonts CSS for the selected font (Inter, Roboto, Open Sans, Lato, Nunito, Poppins, JetBrains Mono).
- Tracks `loadedFont` to avoid reloading the same font. Reuses the existing `<link>` element if one exists.
- System Default and Monospace don't require external loading.

**Ad Removal**
- Runs independently of theme (works even with theme disabled).
- Matches 18 CSS selectors targeting ad containers: `[class*="adunit"]`, `[id*="div-gpt-ad"]`, `iframe[src*="doubleclick"]`, etc.
- Removes matched elements from the DOM. If the parent becomes empty, collapses it with `display:none; height:0`.
- Uses a `MutationObserver` on `document.body` (watching `childList` + `subtree`) to catch dynamically injected ads.
- Throttled at 500ms to avoid excessive DOM operations.

### theme.css - Detailed Behavior

**Activation**: All theme rules are scoped under `.chess-better-theme` (added to `<html>` by content.js). Without this class, only the ad-blocking CSS is active.

**Flat UI**: Globally removes `border-radius`, `box-shadow`, and `text-shadow` from all elements, creating a flat look. Circular elements (`.pie-chart`, `.hint`) are explicitly preserved with `border-radius: 50%`.

**Font Override**: Applies `--cb-font` to `body` and all descendants via `body *` selector with `!important`. Icon fonts are protected by excluding elements with classes containing `icon`, `Icon`, `fa-`, `glyph`, `chess-`, or `font-`, plus `<i>` tags and `[data-icon]` attributes. `<button>` and `<input>` elements with icon classes are also excluded.

**Styled Sections**:
- **Sidebar** (`#sidebar-main-menu`, `.sidebar-container`): Custom background, link colors, hover states, and adjustable width via `--cb-sidebar-width`.
- **Top Bar** (`[class*="toolbar"]`, `#tb`): Matches sidebar background.
- **Side Panel** (`.layout-column-two`): Uses page background color for consistency.
- **Sections** (`.v5-section`): Panel background with dark borders.
- **Buttons** (`.ui_v5-button-component`, `.cc-button-component`, etc.): Custom background, text, and hover colors for both regular and primary buttons.
- **Chat, Move List, Modals, Alerts, Promotion Window**: All use `--cb-panel-bg` for consistent dark backgrounds.
- **Player Info / Clock**: Text color override for readability.
- **Evaluation Bar**: Slightly transparent (0.85 opacity).
- **Scrollbar**: Thin (5px) dark scrollbar.
- **Links**: Muted color (`#777`) with lighter hover (`#aaa`).

**Semantic Color Preservation**: Win/loss/draw colors in the tricolor bar are explicitly preserved (`#81b64c` green for wins, `#e5533b` red for losses, `#a0a0a0` gray for draws) to prevent the link color override from hiding them.

**Ad Blocking (CSS)**: A standalone section (not scoped to `.chess-better-theme`) that hides ad elements using `display:none`, zero dimensions, `position:absolute`, and `opacity:0`. Targets the same selectors as the JS removal for double coverage.

### popup.js - Detailed Behavior

**Theme Presets**: Defines 11 theme objects, each containing 13 color values + sidebar width. Clicking a theme card merges its colors into the current config and updates all UI controls.

**Config Management**:
- `loadUI(config)`: Sets all form controls (checkboxes, color pickers, selects, range sliders) to match the given config. Updates the active theme card highlight and piece preview.
- `getConfig()`: Reads all form control values into a config object.
- `save()`: Writes the current config to `chrome.storage.sync` under key `"chessBetter"`. This triggers `onChanged` in the content script for instant application.

**Custom Colors**: A collapsible panel with 10 color pickers (sidebar BG, link color, hover BG, page BG, panel BG, section header, button BG, button text, hover BG, primary BG, primary text, text color) and a sidebar width slider (150-350px). Changing any custom color marks the theme as "custom" and deselects all preset cards.

**Piece Preview**: When a piece set is selected, renders 6 preview images (King, Queen, Rook, Bishop, Knight, Pawn) in the popup. Uses the same URL logic as content.js (chess.com CDN for built-in sets, GitHub raw for Lichess sets).

**Reset**: Restores all settings to defaults (Midnight theme, system font, no custom board/pieces, ad block on) and saves immediately.

## Credits

- Lichess piece sets are from [lichess-org/lila](https://github.com/lichess-org/lila) (AGPL-3.0)

## License

MIT
