(() => {
  "use strict";

  const DEFAULTS = {
    theme: true,
    adblock: true,
    bg: "#111111",
    sidebarBg: "#0c0c0c",
    sidebarLink: "#888888",
    sidebarLinkHoverBg: "#1a1a1a",
    sidebarWidth: 220,
    panelBg: "#161616",
    sectionHeaderBg: "#1f1f1f",
    btnBg: "#1f1f1f",
    btnText: "#aaaaaa",
    btnHoverBg: "#282828",
    btnPrimaryBg: "#2a2a2a",
    btnPrimaryText: "#cccccc",
    text: "#cccccc",
    fontFamily: "system",
    boardTheme: "none",
    pieceTheme: "none",
  };

  const CODES = ["wp", "wn", "wb", "wr", "wq", "wk", "bp", "bn", "bb", "br", "bq", "bk"];
  const LC = { wp:"wP",wn:"wN",wb:"wB",wr:"wR",wq:"wQ",wk:"wK",bp:"bP",bn:"bN",bb:"bB",br:"bR",bq:"bQ",bk:"bK" };
  const LICHESS = new Set(["staunty","dubrovny","cooke","california","cburnett","merida","pirouetti"]);

  const FONTS = {
    system: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    inter: '"Inter",sans-serif',
    roboto: '"Roboto",sans-serif',
    opensans: '"Open Sans",sans-serif',
    lato: '"Lato",sans-serif',
    nunito: '"Nunito",sans-serif',
    poppins: '"Poppins",sans-serif',
    mono: '"SF Mono","Fira Code",Menlo,Consolas,monospace',
    jetbrains: '"JetBrains Mono",monospace',
  };

  const FONT_URLS = {
    inter: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    roboto: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap",
    opensans: "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&display=swap",
    lato: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap",
    nunito: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap",
    poppins: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap",
    jetbrains: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap",
  };

  const AD_SELECTOR = [
    '[class*="placeholder-ad"]','[class*="adunit"]','[class*="ad-slot"]',
    '[class*="ad-component"]','[class*="ad-banner"]','[class*="ad-skin"]',
    '[class*="bottom-banner"]','[class*="top-banner"]','[data-cy="ad"]',
    '[id*="div-gpt-ad"]','[id*="AdSlot"]','[id*="google_ads"]',
    'iframe[src*="doubleclick"]','iframe[src*="googlesyndication"]',
    'iframe[src*="amazon-adsystem"]','iframe[src*="ad-delivery"]',
    'iframe[src*="aditude"]','iframe[src*="vidazoo"]',
  ].join(",");

  let config = { ...DEFAULTS };
  let adObserver = null;
  let adThrottleId = 0;

  // --- Init ---
  chrome.storage.sync.get("chessBetter", (r) => {
    if (r.chessBetter) config = { ...DEFAULTS, ...r.chessBetter };
    if (document.body) apply();
    else document.addEventListener("DOMContentLoaded", apply);
  });

  chrome.storage.onChanged.addListener((c) => {
    if (c.chessBetter) {
      config = { ...DEFAULTS, ...c.chessBetter.newValue };
      apply();
    }
  });

  // --- Apply all ---
  function apply() {
    if (!document.body) return;
    const s = document.documentElement.style;

    if (config.theme) {
      document.body.classList.add("dark-mode");
      document.documentElement.classList.add("chess-better-theme");
      s.setProperty("--cb-bg", config.bg);
      s.setProperty("--cb-sidebar-bg", config.sidebarBg);
      s.setProperty("--cb-sidebar-link", config.sidebarLink);
      s.setProperty("--cb-sidebar-link-hover-bg", config.sidebarLinkHoverBg);
      s.setProperty("--cb-sidebar-width", config.sidebarWidth + "px");
      s.setProperty("--cb-panel-bg", config.panelBg);
      s.setProperty("--cb-section-header-bg", config.sectionHeaderBg);
      s.setProperty("--cb-btn-bg", config.btnBg);
      s.setProperty("--cb-btn-text", config.btnText);
      s.setProperty("--cb-btn-hover-bg", config.btnHoverBg);
      s.setProperty("--cb-btn-primary-bg", config.btnPrimaryBg);
      s.setProperty("--cb-btn-primary-text", config.btnPrimaryText);
      s.setProperty("--cb-text", config.text);
      s.setProperty("--cb-font", FONTS[config.fontFamily] || FONTS.system);
      loadFont(config.fontFamily);
    } else {
      document.documentElement.classList.remove("chess-better-theme");
      document.body.classList.remove("dark-mode");
      ["--cb-bg","--cb-sidebar-bg","--cb-sidebar-link","--cb-sidebar-link-hover-bg",
       "--cb-sidebar-width","--cb-panel-bg","--cb-section-header-bg","--cb-btn-bg",
       "--cb-btn-text","--cb-btn-hover-bg","--cb-btn-primary-bg","--cb-btn-primary-text","--cb-text","--cb-font"
      ].forEach((v) => s.removeProperty(v));
      // Also clear board/piece/font overrides
      s.removeProperty("--theme-board-style-image");
      for (const c of CODES) s.removeProperty(`--theme-piece-set-${c}`);
      const fontEl = document.getElementById("cb-font");
      if (fontEl) fontEl.remove();
      loadedFont = "";
    }

    if (!config.theme) {
      // Ad block still runs
      if (config.adblock) { removeAds(); startAdObserver(); }
      return;
    }

    // Board theme
    if (config.boardTheme && config.boardTheme !== "none") {
      s.setProperty("--theme-board-style-image",
        `url('https://images.chesscomfiles.com/chess-themes/boards/${config.boardTheme}/150.png')`, "important");
    } else {
      s.removeProperty("--theme-board-style-image");
    }

    // Piece theme
    if (config.pieceTheme && config.pieceTheme !== "none") {
      const isLichess = LICHESS.has(config.pieceTheme);
      for (const c of CODES) {
        const url = isLichess
          ? `https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/${config.pieceTheme}/${LC[c]}.svg`
          : `https://images.chesscomfiles.com/chess-themes/pieces/${config.pieceTheme}/150/${c}.png`;
        s.setProperty(`--theme-piece-set-${c}`, `url('${url}')`, "important");
      }
    } else {
      for (const c of CODES) s.removeProperty(`--theme-piece-set-${c}`);
    }

    // Ad block
    if (config.adblock) {
      removeAds();
      startAdObserver();
    }
  }

  // --- Font loading ---
  let loadedFont = "";
  function loadFont(key) {
    const url = FONT_URLS[key];
    if (!url || key === loadedFont) return;
    loadedFont = key;
    let el = document.getElementById("cb-font");
    if (el) el.href = url;
    else {
      el = document.createElement("link");
      el.id = "cb-font";
      el.rel = "stylesheet";
      el.href = url;
      document.head.appendChild(el);
    }
  }

  // --- Ad removal (throttled) ---
  function removeAds() {
    document.querySelectorAll(AD_SELECTOR).forEach((el) => {
      const p = el.parentElement;
      el.remove();
      if (p && p.children.length === 0 && p !== document.body) {
        p.style.cssText = "display:none!important;height:0!important;margin:0!important;padding:0!important";
      }
    });
  }

  function startAdObserver() {
    if (adObserver) return;
    adObserver = new MutationObserver(() => {
      if (adThrottleId) return;
      adThrottleId = setTimeout(() => {
        adThrottleId = 0;
        removeAds();
      }, 500);
    });
    adObserver.observe(document.body, { childList: true, subtree: true });
  }
})();
