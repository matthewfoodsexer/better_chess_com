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
    text: "#cccccc",
    fontFamily: "system",
  };

  const FONT_MAP = {
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    inter: '"Inter", sans-serif',
    roboto: '"Roboto", sans-serif',
    opensans: '"Open Sans", sans-serif',
    lato: '"Lato", sans-serif',
    nunito: '"Nunito", sans-serif',
    poppins: '"Poppins", sans-serif',
    mono: '"SF Mono", "Fira Code", "Cascadia Code", Menlo, Consolas, monospace',
    jetbrains: '"JetBrains Mono", monospace',
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

  let config = { ...DEFAULTS };

  function loadSettings() {
    chrome.storage.sync.get("chessBetter", (result) => {
      if (result.chessBetter) config = { ...DEFAULTS, ...result.chessBetter };
      ready(apply);
    });
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.chessBetter) {
      config = { ...DEFAULTS, ...changes.chessBetter.newValue };
      apply();
    }
  });

  function ready(fn) {
    if (document.body) fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function apply() {
    if (!document.body) return;

    if (config.theme) {
      document.body.classList.add("dark-mode");
      document.documentElement.classList.add("chess-better-theme");
      applyVars();
    } else {
      document.documentElement.classList.remove("chess-better-theme");
      clearVars();
    }

    if (config.adblock) {
      removeAds();
      startAdObserver();
    }
  }

  function applyVars() {
    const s = document.documentElement.style;
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
    s.setProperty("--cb-text", config.text);
    s.setProperty("--cb-font", FONT_MAP[config.fontFamily] || FONT_MAP.system);
    loadFont(config.fontFamily);
  }

  function loadFont(key) {
    const url = FONT_URLS[key];
    if (!url) return;
    const id = "cb-google-font";
    if (document.getElementById(id)) document.getElementById(id).remove();
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }

  function clearVars() {
    const vars = [
      "--cb-bg", "--cb-sidebar-bg", "--cb-sidebar-link", "--cb-sidebar-link-hover-bg",
      "--cb-sidebar-width", "--cb-panel-bg", "--cb-section-header-bg", "--cb-btn-bg",
      "--cb-btn-text", "--cb-btn-hover-bg", "--cb-btn-primary-bg", "--cb-text", "--cb-font",
    ];
    vars.forEach((v) => document.documentElement.style.removeProperty(v));
  }

  function removeAds() {
    const adSelectors = [
      // Direct ad elements
      '[class*="placeholder-ad"]',
      '[class*="adunit"]',
      '[class*="ad-slot"]',
      '[class*="ad-component"]',
      '[class*="ad-banner"]',
      'iframe[src*="doubleclick"]',
      'iframe[src*="googlesyndication"]',
      'iframe[src*="amazon-adsystem"]',
      'iframe[src*="ad-delivery"]',
      'iframe[src*="aditude"]',
      'iframe[src*="vidazoo"]',
      '[id*="google_ads"]',
      '[id*="div-gpt-ad"]',
      '[id*="AdSlot"]',
      // Chess.com specific ad wrappers
      '[class*="bottom-banner"]',
      '[class*="top-banner"]',
      '[class*="ad-skin"]',
      '[data-cy="ad"]',
      '.gcse-search',
    ];
    const selector = adSelectors.join(", ");
    document.querySelectorAll(selector).forEach((el) => {
      // Walk up to remove empty parent wrappers too
      const parent = el.parentElement;
      el.remove();
      if (parent && parent.children.length === 0 && parent.id !== "body") {
        // If parent is now empty and looks like an ad wrapper, collapse it
        parent.style.display = "none";
        parent.style.height = "0";
        parent.style.margin = "0";
        parent.style.padding = "0";
      }
    });

    // Also collapse any element that only contains hidden iframes
    document.querySelectorAll("div > iframe:only-child").forEach((iframe) => {
      const src = iframe.src || "";
      if (src.includes("ad") || src.includes("doubleclick") || src.includes("googlesyndication") || src.includes("amazon") || src.includes("vidazoo") || src.includes("aditude")) {
        const wrapper = iframe.parentElement;
        if (wrapper) {
          wrapper.remove();
        }
      }
    });
  }

  let adObserver = null;

  function startAdObserver() {
    if (adObserver || !document.body) return;
    adObserver = new MutationObserver(() => removeAds());
    adObserver.observe(document.body, { childList: true, subtree: true });
  }

  loadSettings();
})();
