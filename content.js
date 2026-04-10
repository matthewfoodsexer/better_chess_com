(() => {
  "use strict";

  // ===== Ad Blocking =====
  const AD_SELECTOR = [
    '[class*="placeholder-ad"]','[class*="adunit"]','[class*="ad-slot"]',
    '[class*="ad-component"]','[class*="ad-banner"]','[class*="ad-skin"]',
    '[class*="bottom-banner"]','[class*="top-banner"]','[data-cy="ad"]',
    '[id*="div-gpt-ad"]','[id*="AdSlot"]','[id*="google_ads"]',
    'iframe[src*="doubleclick"]','iframe[src*="googlesyndication"]',
    'iframe[src*="amazon-adsystem"]','iframe[src*="ad-delivery"]',
    'iframe[src*="aditude"]','iframe[src*="vidazoo"]',
  ].join(",");

  let adObserver = null;
  let adThrottleId = 0;

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
      adThrottleId = setTimeout(() => { adThrottleId = 0; removeAds(); }, 500);
    });
    adObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ===== Opponent Info =====
  let shownForOpponent = "";
  let checkInterval = null;

  async function fetchJSON(url) {
    try {
      const r = await fetch(url, { credentials: "omit" });
      if (!r.ok) return null;
      return r.json();
    } catch { return null; }
  }

  function getMyUsername() {
    const sidebarUser = document.querySelector(".home-username-link");
    if (sidebarUser) return sidebarUser.textContent.trim().toLowerCase();
    const profileLinks = document.querySelectorAll('#sidebar-main-menu a[href*="/member/"]');
    for (const a of profileLinks) {
      const m = a.href.match(/\/member\/([^/?#]+)/);
      if (m) return m[1].toLowerCase();
    }
    const bottomPlayer = document.querySelector(
      '.board-player-default-bottom [data-test-element="user-tagline-username"],' +
      '.board-player-bottom [data-test-element="user-tagline-username"]'
    );
    if (bottomPlayer) return bottomPlayer.textContent.trim().toLowerCase();
    return null;
  }

  function getOpponentEl() {
    const topPlayer = document.querySelector(
      '.board-player-default-top [data-test-element="user-tagline-username"],' +
      '.board-player-top [data-test-element="user-tagline-username"]'
    );
    if (topPlayer) return topPlayer;
    const my = getMyUsername();
    if (!my) return null;
    const allNames = document.querySelectorAll('[data-test-element="user-tagline-username"]');
    for (const el of allNames) {
      if (el.textContent.trim().toLowerCase() !== my) return el;
    }
    return null;
  }

  // Detect time control by matching displayed rating against stats
  function detectTimeControl(oppEl, stats) {
    if (!oppEl || !stats) return null;

    // Find the rating number shown next to opponent name on the board
    const container = oppEl.closest('[class*="board-player"]') || oppEl.parentElement;
    if (!container) return null;

    const ratingEl = container.querySelector(
      '[data-test-element="user-tagline-rating"],' +
      '[class*="user-tagline-rating"]'
    );

    let displayedRating = null;
    if (ratingEl) {
      const num = ratingEl.textContent.replace(/[^0-9]/g, "");
      if (num) displayedRating = parseInt(num);
    }

    // If we couldn't find a rating element, try finding any number in parens near the name
    if (!displayedRating) {
      const text = container.textContent || "";
      const m = text.match(/\((\d{3,4})\)/);
      if (m) displayedRating = parseInt(m[1]);
    }

    if (!displayedRating) return null;

    // Match against each mode's current rating
    const modes = ["chess_rapid", "chess_blitz", "chess_bullet", "chess_daily"];
    let bestMatch = null;
    let bestDiff = Infinity;

    for (const mode of modes) {
      const s = stats[mode];
      if (!s || !s.last) continue;
      const diff = Math.abs(s.last.rating - displayedRating);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = mode;
      }
    }

    // Trust if within 10 points (small variance possible)
    if (bestMatch && bestDiff <= 10) return bestMatch;
    return null;
  }

  function formatDate(ts) {
    const d = new Date(ts * 1000);
    return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
  }

  async function getH2H(myUsername, oppUsername) {
    const data = await fetchJSON(`https://api.chess.com/pub/player/${myUsername}/games/archives`);
    if (!data || !data.archives) return { w: 0, d: 0, l: 0 };

    const results = await Promise.allSettled(data.archives.map((u) => fetchJSON(u)));
    const drawResults = new Set(["agreed","stalemate","repetition","insufficient","timevsinsufficient","50move","draw"]);
    let w = 0, d = 0, l = 0;

    for (const r of results) {
      if (r.status !== "fulfilled" || !r.value || !r.value.games) continue;
      for (const g of r.value.games) {
        const wn = g.white.username.toLowerCase();
        const bn = g.black.username.toLowerCase();
        const amWhite = wn === myUsername;
        if (!amWhite && bn !== myUsername) continue;
        const opp = amWhite ? bn : wn;
        if (opp !== oppUsername) continue;
        const res = amWhite ? g.white.result : g.black.result;
        if (res === "win") w++;
        else if (drawResults.has(res)) d++;
        else l++;
      }
    }
    return { w, d, l };
  }

  function buildInfoHTML(profile, h2h, peakRating, peakDate) {
    let html = "";

    if (profile && profile.joined) {
      html += formatDate(profile.joined);
    }

    html += ` | <span class="cb-w">${h2h.w}</span>/<span class="cb-l">${h2h.l}</span>/${h2h.d}`;

    if (peakRating) {
      html += ` | <span class="cb-peak-num">${peakRating}</span> (${peakDate})`;
    }

    return html;
  }

  async function showOpponentInfo() {
    const my = getMyUsername();
    if (!my) return;

    const oppEl = getOpponentEl();
    if (!oppEl) return;

    const oppName = oppEl.textContent.trim().toLowerCase();
    if (!oppName || oppName === my) return;
    if (oppName === shownForOpponent && document.getElementById("cb-opponent-info")) return;

    const old = document.getElementById("cb-opponent-info");
    if (old) old.remove();

    shownForOpponent = oppName;

    const infoEl = document.createElement("span");
    infoEl.id = "cb-opponent-info";
    infoEl.innerHTML = '<span class="cb-item" style="color:#666">···</span>';

    // Insert after the flag (country flag is usually the last element in the tagline)
    const tagline = oppEl.closest('[class*="user-tagline"]') || oppEl.parentElement;
    tagline.appendChild(infoEl);

    // Fetch profile + stats first (fast), show immediately, then H2H (slow)
    const [profile, stats] = await Promise.all([
      fetchJSON(`https://api.chess.com/pub/player/${oppName}`),
      fetchJSON(`https://api.chess.com/pub/player/${oppName}/stats`),
    ]);

    let peakRating = null;
    let peakDate = null;

    if (stats) {
      const mode = detectTimeControl(oppEl, stats);
      if (mode && stats[mode] && stats[mode].best) {
        peakRating = stats[mode].best.rating;
        peakDate = formatDate(stats[mode].best.date);
      } else {
        let best = null;
        for (const k of ["chess_rapid", "chess_blitz", "chess_bullet", "chess_daily"]) {
          const s = stats[k];
          if (s && s.best && (!best || s.best.rating > best.rating)) {
            best = s.best;
          }
        }
        if (best) {
          peakRating = best.rating;
          peakDate = formatDate(best.date);
        }
      }
    }

    // Show profile + peak immediately, H2H loading
    infoEl.innerHTML = buildInfoHTML(profile, { w: "·", d: "·", l: "·" }, peakRating, peakDate);

    // Then fetch H2H and update
    const h2h = await getH2H(my, oppName);
    infoEl.innerHTML = buildInfoHTML(profile, h2h, peakRating, peakDate);
  }

  function startOpponentCheck() {
    if (checkInterval) return;
    checkInterval = setInterval(() => {
      const isGame = /\/(game|play)\//i.test(location.href);
      if (!isGame) {
        const old = document.getElementById("cb-opponent-info");
        if (old) { old.remove(); shownForOpponent = ""; }
        return;
      }
      showOpponentInfo();
    }, 2000);
  }

  // ===== Init =====
  removeAds();
  startAdObserver();
  startOpponentCheck();
})();
