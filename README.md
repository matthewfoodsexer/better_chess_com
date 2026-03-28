# Chess Better

A Chrome extension that enhances chess.com with customizable dark themes and ad blocking.

## Features

- **11 Dark Themes** - Midnight, Charcoal, AMOLED, Ocean, Forest, Mocha, Rose, Nord, Dracula, Solarized, and chess.com Default
- **Custom Colors** - Full control over sidebar, panels, buttons, and text colors
- **Ad Blocker** - Removes ads and collapses empty ad containers
- **Font Selection** - Choose from 9 font options including Inter, Roboto, Poppins, JetBrains Mono, and more
- **Sidebar Width** - Adjustable sidebar width (150px - 350px)
- **Flat UI** - Removes rounded corners and shadows for a clean look

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
- **Custom colors**: Expand "+ Custom Colors" to fine-tune individual colors
- **Apply**: Click Apply to save and apply changes
- **Reset**: Click Reset to restore default settings

## Files

| File | Description |
|---|---|
| `manifest.json` | Chrome extension manifest (v3) |
| `content.js` | Injects CSS variables and handles ad removal |
| `theme.css` | Dark theme styles using CSS custom properties |
| `popup.html` | Settings popup UI |
| `popup.js` | Popup logic, theme presets, and storage |

## License

MIT
