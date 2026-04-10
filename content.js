(() => {
  "use strict";
  console.log("[Chess Better] Content script loaded v5");

  // ── Ad Blocker ──────────────────────────────────────────────
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
        p.style.cssText =
          "display:none!important;height:0!important;margin:0!important;padding:0!important";
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

  removeAds();
  startAdObserver();

  // ── Defaults ────────────────────────────────────────────────
  const FIELD_DEFAULTS = {
    showJoined: true,
    showPeak: true,
    showStreak: true,
    showLast10: true,
    showH2H: true,
    showCountry: true,
    showWinRate: true,
    showRatingDiff: true,
    showTimeoutRate: true,
    showTotalGames: true,
    showAvgOpponent: true,
    showStatus: true,
  };

  // ── Widget State ────────────────────────────────────────────
  let widgetEnabled = true;
  let fieldSettings = { ...FIELD_DEFAULTS };
  let currentOpponent = null;
  let fetching = false;
  let cachedData = {};
  let gameCheckInterval = null;

  // ── Init ────────────────────────────────────────────────────
  chrome.storage.sync.get("chessBetter", (res) => {
    const cfg = res.chessBetter || {};
    widgetEnabled = cfg.enabled !== false;
    Object.assign(fieldSettings, cfg.fields || {});
    if (widgetEnabled) startGameLoop();
    else hideWidget();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (!changes.chessBetter) return;
    const cfg = changes.chessBetter.newValue || {};
    widgetEnabled = cfg.enabled !== false;
    Object.assign(fieldSettings, cfg.fields || {});
    if (widgetEnabled) {
      startGameLoop();
      // Re-render with cached data if available
      if (currentOpponent && cachedData[currentOpponent]) {
        renderWidget(cachedData[currentOpponent]);
      }
    } else {
      hideWidget();
      stopGameLoop();
    }
  });

  // ── Game Detection Loop ─────────────────────────────────────
  function startGameLoop() {
    if (gameCheckInterval) return;
    checkGame();
    gameCheckInterval = setInterval(checkGame, 1000);
  }

  function stopGameLoop() {
    if (gameCheckInterval) {
      clearInterval(gameCheckInterval);
      gameCheckInterval = null;
    }
  }

  function checkGame() {
    const { myUsername, opponentUsername } = getPlayers();
    if (!opponentUsername) {
      // No players found — hide widget if showing
      if (currentOpponent) {
        hideWidget();
        currentOpponent = null;
      }
      return;
    }

    if (opponentUsername === currentOpponent) {
      // Same opponent — make sure widget is visible if we have data
      const w = document.getElementById("cb-widget");
      if (w && w.style.display === "none" && cachedData[opponentUsername]) {
        renderWidget(cachedData[opponentUsername]);
      }
      return;
    }

    currentOpponent = opponentUsername;
    detectedModeFromArchive = null;
    fetching = false; // cancel any in-progress fetch for previous opponent
    console.log(`[Chess Better] New opponent detected: ${opponentUsername} (me: ${myUsername})`);
    loadOpponentData(opponentUsername, myUsername);
  }

  // ── Player Detection ────────────────────────────────────────
  function getPlayers() {
    const BOTTOM_SELS = [".player-bottom", ".board-layout-bottom", '[class*="player-bottom"]'];
    const TOP_SELS = [".player-top", ".board-layout-top", '[class*="player-top"]'];
    let bottom = null, top = null;
    for (const sel of BOTTOM_SELS) { bottom = getUsernameFrom(sel); if (bottom) break; }
    for (const sel of TOP_SELS) { top = getUsernameFrom(sel); if (top) break; }
    return { myUsername: bottom, opponentUsername: top };
  }

  function getUsernameFrom(containerSel) {
    const container = document.querySelector(containerSel);
    if (!container) return null;
    const el =
      container.querySelector('[data-cy="user-tagline-username"]') ||
      container.querySelector('[data-test-element="user-tagline-username"]') ||
      container.querySelector(".user-tagline-username") ||
      container.querySelector(".cc-user-username-component") ||
      container.querySelector("a.user-username-component") ||
      container.querySelector("a[href*='/member/']");
    if (!el) return null;
    let name = el.textContent.trim();
    // Remove title prefixes like "GM", "IM", "FM" etc
    name = name.replace(/^(GM|IM|FM|CM|NM|WGM|WIM|WFM|WCM)\s+/i, "");
    name = name.toLowerCase();
    // Filter out placeholder/generic names
    if (!name || name === "opponent" || name === "player" || name.length < 2) return null;
    return name;
  }

  function getRatingFrom(containerSel) {
    const container = document.querySelector(containerSel);
    if (!container) return null;
    const el =
      container.querySelector('[data-cy="user-tagline-rating"]') ||
      container.querySelector(".user-tagline-rating") ||
      container.querySelector('[class*="cc-user-rating"]') ||
      container.querySelector('[class*="user-rating"]');
    if (!el) return null;
    const foundEl = el;
    const text = foundEl.textContent.trim();
    // Extract first number from text like "(1234)" or "1234"
    const match = text.match(/\d+/);
    if (!match) return null;
    const num = parseInt(match[0]);
    console.log(`[Chess Better] getRating(${containerSel}): "${text}" → ${num}`);
    return isNaN(num) ? null : num;
  }

  // ── Game Mode Detection ─────────────────────────────────────
  // Cache: store mode detected from game archives
  let detectedModeFromArchive = null;

  function detectGameMode(stats, opponent) {
    // 1. If we already found mode from archive, use it
    if (detectedModeFromArchive) {
      console.log(`[Chess Better] Mode from archive cache: ${detectedModeFromArchive}`);
      return detectedModeFromArchive;
    }

    // 2. Try to find game ID from URL and match in archives (most accurate)
    //    This is async so handled separately in loadOpponentData

    // 3. Match displayed rating against API stats
    if (stats) {
      const displayed =
        getRatingFrom(".player-top") || getRatingFrom(".board-layout-top");
      console.log(`[Chess Better] Displayed rating: ${displayed}`);
      if (displayed) {
        const modes = ["chess_rapid", "chess_blitz", "chess_bullet"];
        let bestMatch = null;
        let bestDiff = Infinity;
        for (const m of modes) {
          const cur = stats[m]?.last?.rating;
          if (cur != null) {
            const diff = Math.abs(cur - displayed);
            console.log(`[Chess Better]   ${m}: api=${cur}, diff=${diff}`);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestMatch = m;
            }
          }
        }
        if (bestMatch && bestDiff < 50) {
          console.log(`[Chess Better] Detected mode: ${bestMatch} (diff=${bestDiff})`);
          return bestMatch;
        }
        console.log(`[Chess Better] Rating match too loose (bestDiff=${bestDiff}), skipping`);
      }
    }

    // 4. Check page title
    const title = document.title.toLowerCase();
    if (title.includes("bullet")) return "chess_bullet";
    if (title.includes("blitz")) return "chess_blitz";
    if (title.includes("rapid")) return "chess_rapid";

    console.warn("[Chess Better] Mode detection failed, will try from archives");
    return null;
  }

  // Extract game ID from current URL (e.g. /game/167124122310 → "167124122310")
  function getGameIdFromUrl() {
    const match = location.pathname.match(/\/game\/(?:live\/|daily\/)?(\d+)/);
    return match ? match[1] : null;
  }

  // Find this specific game in archives and return its time_class
  async function detectModeFromArchives(opponent) {
    const gameId = getGameIdFromUrl();
    console.log(`[Chess Better] Looking for game ID: ${gameId}`);

    try {
      const archivesRes = await fetchJSON(
        `https://api.chess.com/pub/player/${opponent}/games/archives`
      );
      if (!archivesRes?.archives?.length) return null;

      // Search from most recent month backwards
      for (let i = archivesRes.archives.length - 1; i >= Math.max(0, archivesRes.archives.length - 3); i--) {
        const monthData = await fetchJSON(archivesRes.archives[i]);
        if (!monthData?.games) continue;

        // If we have a game ID, find the exact game
        if (gameId) {
          for (const g of monthData.games) {
            const gUrl = g.url || "";
            if (gUrl.includes(gameId)) {
              const mode = "chess_" + g.time_class;
              console.log(`[Chess Better] Found exact game in archives: ${mode}`);
              return mode;
            }
          }
        }
      }

      // Fallback: if no game ID match, use latest game's time_class
      const latestUrl = archivesRes.archives[archivesRes.archives.length - 1];
      const monthData = await fetchJSON(latestUrl);
      if (!monthData?.games?.length) return null;
      // Find the most recent game — its time_class is likely what we're looking at
      const lastGame = monthData.games[monthData.games.length - 1];
      if (lastGame?.time_class) {
        const mode = "chess_" + lastGame.time_class;
        console.log(`[Chess Better] Mode from latest archive game: ${mode}`);
        return mode;
      }
    } catch (e) {
      console.error("[Chess Better] detectModeFromArchives error:", e);
    }
    return null;
  }

  // ── API ─────────────────────────────────────────────────────
  async function loadOpponentData(opponent, myUsername) {
    if (fetching) return;
    fetching = true;

    try {
      console.log(`[Chess Better] Loading data for: ${opponent}`);
      showWidgetLoading(opponent);

      const [profile, stats] = await Promise.all([
        fetchJSON(`https://api.chess.com/pub/player/${opponent}`),
        fetchJSON(`https://api.chess.com/pub/player/${opponent}/stats`),
      ]);

      if (!profile || !stats) {
        showWidgetError("API request failed");
        return;
      }

      // Determine game mode
      let mode = detectGameMode(stats, opponent);
      // If mode detection failed, try from archives
      if (!mode) {
        mode = await detectModeFromArchives(opponent);
        if (mode) detectedModeFromArchive = mode;
      }
      console.log("[Chess Better] Final detected mode:", mode);

      // All stats are mode-specific only — no fallbacks
      let peakRating = null;
      let peakDate = null;
      let currentRating = null;
      let totalGames = null;

      if (mode && stats[mode]) {
        const modeStats = stats[mode];
        // Peak
        if (modeStats.best) {
          peakRating = modeStats.best.rating;
          peakDate = modeStats.best.date;
        }
        // Current
        if (modeStats.last?.rating) {
          currentRating = modeStats.last.rating;
        }
        // Guard: if current > peak, current IS peak
        if (currentRating && peakRating && currentRating > peakRating) {
          peakRating = currentRating;
          peakDate = null;
        }
        // Total games
        if (modeStats.record) {
          const rec = modeStats.record;
          totalGames = (rec.win || 0) + (rec.loss || 0) + (rec.draw || 0);
        }
      }

      // Country
      let country = null;
      if (profile.country) {
        country = profile.country.split("/").pop();
      }

      // Online status
      const status = profile.status || null;

      // Fetch recent games
      const gamesData = await fetchRecentGames(opponent, myUsername, mode);

      const data = {
        opponent,
        joined: profile.joined ? new Date(profile.joined * 1000) : null,
        peakRating,
        peakDate: peakDate ? new Date(peakDate * 1000) : null,
        currentRating,
        gameMode: mode,
        country,
        status,
        totalGames,
        last10: gamesData.last10,
        streak: gamesData.streak,
        h2h: gamesData.h2h,
        winRate: gamesData.winRate,
        timeoutRate: gamesData.timeoutRate,
        avgOpponent: gamesData.avgOpponent,
      };

      cachedData[opponent] = data;
      renderWidget(data);
    } catch (e) {
      console.error("[Chess Better]", e);
      showWidgetError("Failed to load data");
    } finally {
      fetching = false;
    }
  }

  async function fetchJSON(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function fetchRecentGames(opponent, myUsername, mode) {
    const result = {
      last10: [],
      streak: { type: null, count: 0 },
      h2h: { w: 0, d: 0, l: 0 },
      winRate: null,
      timeoutRate: null,
      avgOpponent: null,
    };

    try {
      const archivesRes = await fetchJSON(
        `https://api.chess.com/pub/player/${opponent}/games/archives`
      );
      if (!archivesRes?.archives?.length) return result;

      const archives = archivesRes.archives;
      let allGames = [];

      for (let i = archives.length - 1; i >= Math.max(0, archives.length - 3); i--) {
        const monthData = await fetchJSON(archives[i]);
        if (!monthData?.games) continue;

        let games = monthData.games;
        if (mode) {
          games = games.filter((g) => g.time_class === mode.replace("chess_", ""));
        }
        allGames = games.concat(allGames);
        if (allGames.length >= 50) break;
      }

      allGames.sort((a, b) => (b.end_time || 0) - (a.end_time || 0));

      // Last 10
      const recent = allGames.slice(0, 10);
      let totalW = 0, totalL = 0, totalD = 0, timeouts = 0;

      for (const g of allGames) {
        const side = g.white?.username?.toLowerCase() === opponent ? "white" : "black";
        const r = g[side]?.result;
        if (r === "win") totalW++;
        else if (["checkmated", "timeout", "resigned", "abandoned"].includes(r)) {
          totalL++;
          if (r === "timeout") timeouts++;
        } else totalD++;
      }

      for (const g of recent) {
        const side = g.white?.username?.toLowerCase() === opponent ? "white" : "black";
        const r = g[side]?.result;
        if (r === "win") result.last10.push("W");
        else if (["checkmated", "timeout", "resigned", "abandoned"].includes(r))
          result.last10.push("L");
        else result.last10.push("D");
      }

      // Streak
      if (result.last10.length > 0) {
        const first = result.last10[0];
        result.streak.type = first;
        result.streak.count = 1;
        for (let i = 1; i < result.last10.length; i++) {
          if (result.last10[i] === first) result.streak.count++;
          else break;
        }
      }

      // Win rate
      const total = totalW + totalL + totalD;
      if (total > 0) {
        result.winRate = Math.round((totalW / total) * 100);
      }

      // Timeout rate
      if (totalL > 0) {
        result.timeoutRate = Math.round((timeouts / (totalW + totalL + totalD)) * 100);
      } else {
        result.timeoutRate = 0;
      }

      // Average opponent rating (from recent games)
      const recentForAvg = allGames.slice(0, 20);
      let ratingSum = 0, ratingCount = 0;
      for (const g of recentForAvg) {
        const opSide = g.white?.username?.toLowerCase() === opponent ? "black" : "white";
        const opRating = g[opSide]?.rating;
        if (opRating) { ratingSum += opRating; ratingCount++; }
      }
      if (ratingCount > 0) {
        result.avgOpponent = Math.round(ratingSum / ratingCount);
      }

      // H2H
      if (myUsername) {
        for (const g of allGames) {
          const whiteUser = g.white?.username?.toLowerCase();
          const blackUser = g.black?.username?.toLowerCase();
          if (
            !(
              (whiteUser === opponent && blackUser === myUsername) ||
              (whiteUser === myUsername && blackUser === opponent)
            )
          )
            continue;

          const opSide = whiteUser === opponent ? "white" : "black";
          const opResult = g[opSide]?.result;
          if (opResult === "win") result.h2h.l++;
          else if (["checkmated", "timeout", "resigned", "abandoned"].includes(opResult))
            result.h2h.w++;
          else result.h2h.d++;
        }
      }
    } catch (e) {
      console.error("[Chess Better] fetchRecentGames error:", e);
    }

    return result;
  }

  // ── Country Code → Flag Emoji ───────────────────────────────
  function countryFlag(code) {
    if (!code || code.length !== 2) return "";
    const offset = 0x1F1E6 - 65;
    return String.fromCodePoint(
      code.charCodeAt(0) + offset,
      code.charCodeAt(1) + offset
    );
  }

  // ── Widget Rendering ────────────────────────────────────────
  function getWidget() {
    return document.getElementById("cb-widget");
  }

  function hideWidget() {
    const w = getWidget();
    if (w) w.style.display = "none";
  }

  function showWidgetLoading(opponent) {
    let w = getWidget();
    if (!w) w = createWidget();
    w.style.display = "";
    w.querySelector(".cb-body").innerHTML =
      `<div class="cb-loading">Loading ${opponent}...</div>`;
  }

  function showWidgetError(msg) {
    const w = getWidget();
    if (!w) return;
    w.querySelector(".cb-body").innerHTML =
      `<div class="cb-error">${msg}</div>`;
  }

  function renderWidget(data) {
    let w = getWidget();
    if (!w) w = createWidget();
    w.style.display = "";

    const body = w.querySelector(".cb-body");
    const title = w.querySelector(".cb-opponent-name");

    // Name + flag (flag always shown in header, country row is separate toggle)
    const flag = fieldSettings.showCountry && data.country ? countryFlag(data.country) + " " : "";
    title.textContent = flag + data.opponent;

    const rows = [];
    const s = fieldSettings;

    // Status
    if (s.showStatus && data.status) {
      const statusMap = {
        online: '<span class="cb-status-online">● online</span>',
        offline: '<span class="cb-status-offline">○ offline</span>',
      };
      rows.push(row("Status", statusMap[data.status] || data.status));
    }

    // Country
    if (s.showCountry && data.country) {
      rows.push(row("Country", `${countryFlag(data.country)} ${data.country}`));
    }

    // Joined
    if (s.showJoined) {
      const joinedStr = data.joined
        ? `${data.joined.getFullYear()}.${pad(data.joined.getMonth() + 1)}.${pad(data.joined.getDate())}`
        : "N/A";
      rows.push(row("Joined", joinedStr));
    }

    // Peak Elo
    if (s.showPeak) {
      let peakStr = data.peakRating ? `${data.peakRating}` : "N/A";
      if (data.peakDate) {
        const d = data.peakDate;
        peakStr += ` (${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())})`;
      }
      rows.push(row("Peak Elo", peakStr));
    }

    // Rating diff (current vs peak)
    if (s.showRatingDiff && data.currentRating && data.peakRating) {
      const diff = data.currentRating - data.peakRating;
      const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
      const cls = diff >= 0 ? "cb-result-w" : "cb-result-l";
      rows.push(row("vs Peak", `<span class="${cls}">${diffStr}</span>`));
    }

    // Total games
    if (s.showTotalGames && data.totalGames != null) {
      rows.push(row("Games", `${data.totalGames.toLocaleString()}`));
    }

    // Win rate
    if (s.showWinRate && data.winRate != null) {
      rows.push(row("Win Rate", `${data.winRate}%`));
    }

    // Avg opponent
    if (s.showAvgOpponent && data.avgOpponent != null) {
      rows.push(row("Avg Opp", `${data.avgOpponent}`));
    }

    // Streak
    if (s.showStreak) {
      let streakStr = "-";
      if (data.streak.count > 0) {
        if (data.streak.type === "W") streakStr = `🔥 ${data.streak.count}W streak`;
        else if (data.streak.type === "L") streakStr = `📉 ${data.streak.count}L streak`;
        else streakStr = `➖ ${data.streak.count} draws`;
      }
      rows.push(row("Streak", streakStr));
    }

    // Last 10
    if (s.showLast10) {
      const last10Html = data.last10
        .map((r) => {
          const cls = r === "W" ? "cb-result-w" : r === "L" ? "cb-result-l" : "cb-result-d";
          return `<span class="${cls}">${r}</span>`;
        })
        .join("") || "N/A";
      rows.push(row("Last 10", `<span class="cb-last10">${last10Html}</span>`));
    }

    // Timeout rate
    if (s.showTimeoutRate && data.timeoutRate != null) {
      rows.push(row("Timeout", `${data.timeoutRate}%`));
    }

    // H2H
    if (s.showH2H) {
      const h = data.h2h;
      const h2hStr =
        h.w + h.d + h.l > 0
          ? `<span class="cb-result-w">${h.w}W</span> <span class="cb-result-d">${h.d}D</span> <span class="cb-result-l">${h.l}L</span>`
          : "No record";
      rows.push(row("H2H", h2hStr));
    }

    body.innerHTML = rows.join("");
  }

  function row(label, value) {
    return `<div class="cb-row"><span class="cb-label">${label}</span><span class="cb-value">${value}</span></div>`;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function createWidget() {
    const w = document.createElement("div");
    w.id = "cb-widget";
    w.innerHTML = `
      <div class="cb-header">
        <span class="cb-opponent-name"></span>
        <span class="cb-drag-handle">⠿</span>
      </div>
      <div class="cb-body"></div>
    `;
    document.body.appendChild(w);
    makeDraggable(w);
    restorePosition(w);
    return w;
  }

  // ── Drag ────────────────────────────────────────────────────
  function makeDraggable(el) {
    const header = el.querySelector(".cb-header");
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    header.addEventListener("mousedown", (e) => {
      dragging = true;
      offsetX = e.clientX - el.offsetLeft;
      offsetY = e.clientY - el.offsetTop;
      header.style.cursor = "grabbing";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      let x = e.clientX - offsetX;
      let y = e.clientY - offsetY;
      x = Math.max(0, Math.min(x, window.innerWidth - el.offsetWidth));
      y = Math.max(0, Math.min(y, window.innerHeight - el.offsetHeight));
      el.style.left = x + "px";
      el.style.top = y + "px";
    });

    document.addEventListener("mouseup", () => {
      if (!dragging) return;
      dragging = false;
      header.style.cursor = "";
      savePosition(el);
    });
  }

  function savePosition(el) {
    chrome.storage.local.set({
      cbWidgetPos: { left: el.offsetLeft, top: el.offsetTop },
    });
  }

  function restorePosition(el) {
    chrome.storage.local.get("cbWidgetPos", (res) => {
      const pos = res.cbWidgetPos;
      if (pos) {
        const x = Math.min(pos.left, window.innerWidth - 320);
        const y = Math.min(pos.top, window.innerHeight - 200);
        el.style.left = Math.max(0, x) + "px";
        el.style.top = Math.max(0, y) + "px";
      } else {
        el.style.right = "20px";
        el.style.top = "80px";
      }
    });
  }
})();
