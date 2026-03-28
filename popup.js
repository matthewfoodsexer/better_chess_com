const THEMES = {
  default: {
    bg: "#312e2b", sidebarBg: "#272421", sidebarLink: "#a0a0a0", sidebarLinkHoverBg: "#3a3733",
    panelBg: "#272421", sectionHeaderBg: "#302d2a", btnBg: "#3a3733", btnText: "#c5c1bb",
    btnHoverBg: "#48453f", btnPrimaryBg: "#81b64c", btnPrimaryText: "#ffffff", text: "#c5c1bb", sidebarWidth: 220,
  },
  midnight: {
    bg: "#111111", sidebarBg: "#0c0c0c", sidebarLink: "#888888", sidebarLinkHoverBg: "#1a1a1a",
    panelBg: "#161616", sectionHeaderBg: "#1f1f1f", btnBg: "#1f1f1f", btnText: "#aaaaaa",
    btnHoverBg: "#282828", btnPrimaryBg: "#2a2a2a", btnPrimaryText: "#cccccc", text: "#cccccc", sidebarWidth: 220,
  },
  charcoal: {
    bg: "#1a1a1a", sidebarBg: "#151515", sidebarLink: "#909090", sidebarLinkHoverBg: "#252525",
    panelBg: "#222222", sectionHeaderBg: "#2a2a2a", btnBg: "#2a2a2a", btnText: "#b0b0b0",
    btnHoverBg: "#333333", btnPrimaryBg: "#353535", btnPrimaryText: "#d0d0d0", text: "#d0d0d0", sidebarWidth: 220,
  },
  ocean: {
    bg: "#0a1018", sidebarBg: "#080e16", sidebarLink: "#6688aa", sidebarLinkHoverBg: "#0f1a2a",
    panelBg: "#0f1a2a", sectionHeaderBg: "#142236", btnBg: "#142236", btnText: "#8899aa",
    btnHoverBg: "#1a2e44", btnPrimaryBg: "#1e3550", btnPrimaryText: "#aabbcc", text: "#aabbcc", sidebarWidth: 220,
  },
  forest: {
    bg: "#0a120a", sidebarBg: "#081008", sidebarLink: "#669966", sidebarLinkHoverBg: "#111a11",
    panelBg: "#111a11", sectionHeaderBg: "#162216", btnBg: "#162216", btnText: "#88aa88",
    btnHoverBg: "#1c2e1c", btnPrimaryBg: "#223822", btnPrimaryText: "#aaccaa", text: "#aaccaa", sidebarWidth: 220,
  },
  mocha: {
    bg: "#12100e", sidebarBg: "#0e0c0a", sidebarLink: "#998877", sidebarLinkHoverBg: "#1a1614",
    panelBg: "#1a1614", sectionHeaderBg: "#221e1a", btnBg: "#221e1a", btnText: "#aa9988",
    btnHoverBg: "#2c2622", btnPrimaryBg: "#332e28", btnPrimaryText: "#ccbbaa", text: "#ccbbaa", sidebarWidth: 220,
  },
  amoled: {
    bg: "#000000", sidebarBg: "#000000", sidebarLink: "#777777", sidebarLinkHoverBg: "#0a0a0a",
    panelBg: "#050505", sectionHeaderBg: "#0a0a0a", btnBg: "#0a0a0a", btnText: "#999999",
    btnHoverBg: "#111111", btnPrimaryBg: "#141414", btnPrimaryText: "#bbbbbb", text: "#bbbbbb", sidebarWidth: 220,
  },
  nord: {
    bg: "#2e3440", sidebarBg: "#272c36", sidebarLink: "#8899aa", sidebarLinkHoverBg: "#3b4252",
    panelBg: "#3b4252", sectionHeaderBg: "#434c5e", btnBg: "#434c5e", btnText: "#d8dee9",
    btnHoverBg: "#4c566a", btnPrimaryBg: "#5e81ac", btnPrimaryText: "#eceff4", text: "#d8dee9", sidebarWidth: 220,
  },
  dracula: {
    bg: "#282a36", sidebarBg: "#21222c", sidebarLink: "#8899bb", sidebarLinkHoverBg: "#2e303e",
    panelBg: "#2e303e", sectionHeaderBg: "#353848", btnBg: "#353848", btnText: "#c0c8e0",
    btnHoverBg: "#3e4258", btnPrimaryBg: "#6272a4", btnPrimaryText: "#e0e4f0", text: "#d0d4e4", sidebarWidth: 220,
  },
  solarized: {
    bg: "#002b36", sidebarBg: "#00242d", sidebarLink: "#6c8c8c", sidebarLinkHoverBg: "#073642",
    panelBg: "#073642", sectionHeaderBg: "#0a4050", btnBg: "#0a4050", btnText: "#93a1a1",
    btnHoverBg: "#0e5060", btnPrimaryBg: "#268bd2", btnPrimaryText: "#eee8d5", text: "#93a1a1", sidebarWidth: 220,
  },
  rose: {
    bg: "#1a0f14", sidebarBg: "#150c10", sidebarLink: "#aa7788", sidebarLinkHoverBg: "#22141a",
    panelBg: "#1e1218", sectionHeaderBg: "#28181f", btnBg: "#28181f", btnText: "#cc99aa",
    btnHoverBg: "#331e28", btnPrimaryBg: "#442838", btnPrimaryText: "#ddbbcc", text: "#ccaabb", sidebarWidth: 220,
  },
};

const DEFAULTS = { theme: true, adblock: true, selectedTheme: "midnight", fontFamily: "system", boardTheme: "none", pieceTheme: "none", ...THEMES.midnight};

const FIELDS = {
  theme: { type: "toggle" },
  adblock: { type: "toggle" },
  bg: { type: "color" },
  sidebarBg: { type: "color" },
  sidebarLink: { type: "color" },
  sidebarLinkHoverBg: { type: "color" },
  panelBg: { type: "color" },
  sectionHeaderBg: { type: "color" },
  btnBg: { type: "color" },
  btnText: { type: "color" },
  btnHoverBg: { type: "color" },
  btnPrimaryBg: { type: "color" },
  btnPrimaryText: { type: "color" },
  text: { type: "color" },
  sidebarWidth: { type: "range", valEl: "sidebarWidthVal", unit: "px", parse: parseInt },
  fontFamily: { type: "select" },
  boardTheme: { type: "select" },
  pieceTheme: { type: "select" },
};

const els = {};
for (const key of Object.keys(FIELDS)) {
  els[key] = document.getElementById(key);
}

let currentConfig = { ...DEFAULTS };

function loadUI(config) {
  for (const [key, field] of Object.entries(FIELDS)) {
    const el = els[key];
    if (!el) continue;
    if (field.type === "toggle") el.checked = config[key];
    else if (field.type === "color") el.value = config[key];
    else if (field.type === "select") el.value = config[key];
    else if (field.type === "range") {
      el.value = config[key];
      const valEl = document.getElementById(field.valEl);
      if (valEl) valEl.textContent = config[key] + field.unit;
    }
  }
  // Update active theme card
  document.querySelectorAll(".theme-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.theme === config.selectedTheme);
  });
  updatePiecePreview();
}

function getConfig() {
  const config = { selectedTheme: currentConfig.selectedTheme };
  for (const [key, field] of Object.entries(FIELDS)) {
    const el = els[key];
    if (!el) continue;
    if (field.type === "toggle") config[key] = el.checked;
    else if (field.type === "color") config[key] = el.value;
    else if (field.type === "select") config[key] = el.value;
    else if (field.type === "range") config[key] = (field.parse || parseInt)(el.value);
  }
  return config;
}

function save() {
  currentConfig = getConfig();
  chrome.storage.sync.set({ chessBetter: currentConfig });
}

// Load
chrome.storage.sync.get("chessBetter", (result) => {
  currentConfig = { ...DEFAULTS, ...result.chessBetter };
  loadUI(currentConfig);
});

// Theme preset clicks
document.getElementById("themeGrid").addEventListener("click", (e) => {
  const card = e.target.closest(".theme-card");
  if (!card) return;
  const themeName = card.dataset.theme;
  const preset = THEMES[themeName];
  if (!preset) return;

  currentConfig = { ...currentConfig, ...preset, selectedTheme: themeName };
  loadUI(currentConfig);
});

// Custom toggle
document.getElementById("customToggle").addEventListener("click", () => {
  const panel = document.getElementById("customPanel");
  const toggle = document.getElementById("customToggle");
  const isOpen = panel.classList.toggle("open");
  toggle.textContent = isOpen ? "- Custom Colors" : "+ Custom Colors";
});

// Range live display
for (const [key, field] of Object.entries(FIELDS)) {
  if (field.type === "range") {
    const el = els[key];
    if (!el) continue;
    el.addEventListener("input", () => {
      const valEl = document.getElementById(field.valEl);
      if (valEl) valEl.textContent = el.value + field.unit;
    });
  }
}

// When user changes custom colors, mark theme as "custom"
document.getElementById("customPanel").addEventListener("input", () => {
  currentConfig.selectedTheme = "custom";
  document.querySelectorAll(".theme-card").forEach((c) => c.classList.remove("active"));
});

// Piece preview
const LICHESS_SETS = ["staunty", "dubrovny", "cooke", "california", "cburnett", "merida", "pirouetti"];
const LICHESS_CODE_MAP = { wp: "wP", wn: "wN", wb: "wB", wr: "wR", wq: "wQ", wk: "wK", bp: "bP", bn: "bN", bb: "bB", br: "bR", bq: "bQ", bk: "bK" };

function getPiecePreviewUrl(theme, code) {
  if (LICHESS_SETS.includes(theme)) {
    return `https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/${theme}/${LICHESS_CODE_MAP[code]}.svg`;
  }
  return `https://images.chesscomfiles.com/chess-themes/pieces/${theme}/150/${code}.png`;
}

function updatePiecePreview() {
  const preview = document.getElementById("piecePreview");
  const theme = els.pieceTheme?.value;
  if (!preview) return;
  if (!theme || theme === "none") {
    preview.innerHTML = "";
    return;
  }
  const codes = ["wk", "wq", "wr", "wb", "wn", "wp"];
  preview.innerHTML = codes.map((code) => {
    const url = getPiecePreviewUrl(theme, code);
    return `<img src="${url}" style="width:32px;height:32px;" alt="${code}">`;
  }).join("");
}

if (els.pieceTheme) {
  els.pieceTheme.addEventListener("change", updatePiecePreview);
}

// Apply
document.getElementById("applyBtn").addEventListener("click", save);

// Reset
document.getElementById("resetBtn").addEventListener("click", () => {
  currentConfig = { ...DEFAULTS };
  loadUI(currentConfig);
  save();
});
