(() => {
  "use strict";
  const SITE = location.hostname.includes("lichess") ? "lichess" : "chesscom";
  console.log(`[Chess Better] Content script loaded v6 (${SITE})`);

  // ── Ad Blocker (chess.com only) ─────────────────────────────
  if (SITE === "chesscom") {
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
    removeAds();
    startAdObserver();
  }

  // ── Defaults ────────────────────────────────────────────────
  const FIELD_DEFAULTS = {
    showJoined: true, showPeak: true, showStreak: true, showLast10: true,
    showH2H: true, showCountry: true, showWinRate: true, showRatingDiff: true,
    showTimeoutRate: true, showTotalGames: true, showAvgOpponent: true, showStatus: true,
  };

  // ── Widget State ────────────────────────────────────────────
  let widgetEnabled = true;
  let fieldSettings = { ...FIELD_DEFAULTS };
  let currentOpponent = null;
  let currentGameId = null;
  let fetching = false;
  let cachedData = {};
  let gameCheckInterval = null;
  let detectedModeCache = null;

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
      if (currentOpponent && cachedData[currentOpponent]) renderWidget(cachedData[currentOpponent]);
    } else { hideWidget(); stopGameLoop(); }
  });

  // ── Game Detection Loop ─────────────────────────────────────
  function startGameLoop() {
    if (gameCheckInterval) return;
    checkGame();
    gameCheckInterval = setInterval(checkGame, 1000);
  }
  function stopGameLoop() {
    if (gameCheckInterval) { clearInterval(gameCheckInterval); gameCheckInterval = null; }
  }

  function checkGame() {
    const { myUsername, opponentUsername } = getPlayers();
    if (!opponentUsername) {
      if (currentOpponent) { hideWidget(); currentOpponent = null; currentGameId = null; }
      return;
    }

    if (SITE === "lichess") {
      const gameId = getLichessGameId();
      if (opponentUsername === currentOpponent && gameId === currentGameId) {
        const w = document.getElementById("cb-widget");
        if (w && w.style.display === "none" && cachedData[opponentUsername]) renderWidget(cachedData[opponentUsername]);
        return;
      }
      currentOpponent = opponentUsername;
      currentGameId = gameId;
      detectedModeCache = null;
      fetching = false;
      console.log(`[Chess Better] Lichess game: ${opponentUsername} (${gameId})`);
      loadOpponentData(opponentUsername, myUsername);
    } else {
      if (opponentUsername === currentOpponent) {
        const w = document.getElementById("cb-widget");
        if (w && w.style.display === "none" && cachedData[opponentUsername]) renderWidget(cachedData[opponentUsername]);
        return;
      }
      currentOpponent = opponentUsername;
      detectedModeCache = null;
      fetching = false;
      console.log(`[Chess Better] New opponent: ${opponentUsername}`);
      loadOpponentData(opponentUsername, myUsername);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ██ SITE-SPECIFIC: Player Detection
  // ══════════════════════════════════════════════════════════════
  function getPlayers() {
    if (SITE === "lichess") return getLichessPlayers();
    return getChesscomPlayers();
  }

  // ── chess.com ───────────────────────────────────────────────
  function getChesscomPlayers() {
    const BOTTOM = [".player-bottom", ".board-layout-bottom", '[class*="player-bottom"]'];
    const TOP = [".player-top", ".board-layout-top", '[class*="player-top"]'];
    let bottom = null, top = null;
    for (const s of BOTTOM) { bottom = getChesscomUsername(s); if (bottom) break; }
    for (const s of TOP) { top = getChesscomUsername(s); if (top) break; }
    return { myUsername: bottom, opponentUsername: top };
  }

  function getChesscomUsername(containerSel) {
    const c = document.querySelector(containerSel);
    if (!c) return null;
    const el = c.querySelector('[data-cy="user-tagline-username"]') ||
      c.querySelector('[data-test-element="user-tagline-username"]') ||
      c.querySelector(".user-tagline-username") ||
      c.querySelector(".cc-user-username-component") ||
      c.querySelector("a.user-username-component") ||
      c.querySelector("a[href*='/member/']");
    if (!el) return null;
    let name = el.textContent.trim();
    name = name.replace(/^(GM|IM|FM|CM|NM|WGM|WIM|WFM|WCM)\s+/i, "");
    name = name.toLowerCase();
    if (!name || name === "opponent" || name === "player" || name.length < 2) return null;
    return name;
  }

  function getChesscomRating(containerSel) {
    const c = document.querySelector(containerSel);
    if (!c) return null;
    const el = c.querySelector('[data-cy="user-tagline-rating"]') ||
      c.querySelector(".user-tagline-rating") ||
      c.querySelector('[class*="cc-user-rating"]') ||
      c.querySelector('[class*="user-rating"]');
    if (!el) return null;
    const m = el.textContent.trim().match(/\d+/);
    return m ? parseInt(m[0]) : null;
  }

  // ── lichess.org ─────────────────────────────────────────────
  function getLichessPlayers() {
    // Lichess game pages have .ruser elements — bottom = me, top = opponent
    // Or .game__meta .player elements
    const users = document.querySelectorAll(".ruser .user-link");
    if (users.length >= 2) {
      // In lichess, the bottom player (index 1) is "me", top (index 0) is opponent
      // But this depends on board orientation. Let's use DOM order.
      const top = extractLichessUsername(users[0]);
      const bottom = extractLichessUsername(users[1]);
      return { myUsername: bottom, opponentUsername: top };
    }
    // Fallback: try .game__meta players
    const metaUsers = document.querySelectorAll(".game__meta .player .user-link");
    if (metaUsers.length >= 2) {
      return {
        myUsername: extractLichessUsername(metaUsers[1]),
        opponentUsername: extractLichessUsername(metaUsers[0]),
      };
    }
    return { myUsername: null, opponentUsername: null };
  }

  function extractLichessUsername(el) {
    if (!el) return null;
    // Lichess user-link href: /@/username
    const href = el.getAttribute("href");
    if (href) {
      const m = href.match(/\/@\/([^/?#]+)/);
      if (m) return m[1].toLowerCase();
    }
    // Fallback: text content
    let name = el.textContent.trim();
    name = name.replace(/^(GM|IM|FM|CM|NM|WGM|WIM|WFM|WCM)\s+/i, "");
    name = name.toLowerCase();
    if (!name || name.length < 2) return null;
    return name;
  }

  function getLichessGameId() {
    const m = location.pathname.match(/^\/([a-zA-Z0-9]{8,12})/);
    return m ? m[1].substring(0, 8) : null;
  }

  function getLichessRating() {
    // Lichess shows ratings in .ruser elements
    const ratings = document.querySelectorAll(".ruser rating");
    if (ratings.length > 0) {
      const m = ratings[0].textContent.trim().match(/\d+/);
      return m ? parseInt(m[0]) : null;
    }
    return null;
  }

  // ══════════════════════════════════════════════════════════════
  // ██ SITE-SPECIFIC: Mode Detection
  // ══════════════════════════════════════════════════════════════
  function detectGameMode(statsOrPerfs, opponent) {
    if (detectedModeCache) return detectedModeCache;
    if (SITE === "lichess") return detectLichessMode(statsOrPerfs);
    return detectChesscomMode(statsOrPerfs, opponent);
  }

  // ── chess.com mode detection ────────────────────────────────
  function detectChesscomMode(stats) {
    // Rating comparison
    const displayed = getChesscomRating(".player-top") || getChesscomRating(".board-layout-top");
    if (displayed) {
      const modes = ["chess_rapid", "chess_blitz", "chess_bullet"];
      let best = null, bestDiff = Infinity;
      for (const m of modes) {
        const cur = stats[m]?.last?.rating;
        if (cur != null) {
          const d = Math.abs(cur - displayed);
          if (d < bestDiff) { bestDiff = d; best = m; }
        }
      }
      if (best && bestDiff < 50) return best;
    }
    // Page title
    const t = document.title.toLowerCase();
    if (t.includes("bullet")) return "chess_bullet";
    if (t.includes("blitz")) return "chess_blitz";
    if (t.includes("rapid")) return "chess_rapid";
    return null;
  }

  // ── lichess mode detection ─────────────────────────────────
  function detectLichessMode(perfs) {
    // 1. Lichess URL/page often contains speed info
    const t = document.title.toLowerCase();
    if (t.includes("bullet")) return "bullet";
    if (t.includes("blitz")) return "blitz";
    if (t.includes("rapid")) return "rapid";
    if (t.includes("classical")) return "classical";

    // 2. Check game info elements
    const gameInfo = document.querySelector(".game__meta .header");
    if (gameInfo) {
      const text = gameInfo.textContent.toLowerCase();
      if (text.includes("bullet")) return "bullet";
      if (text.includes("blitz")) return "blitz";
      if (text.includes("rapid")) return "rapid";
      if (text.includes("classical")) return "classical";
    }

    // 3. Rating comparison against perfs
    const displayed = getLichessRating();
    if (displayed && perfs) {
      const modes = ["rapid", "blitz", "bullet", "classical"];
      let best = null, bestDiff = Infinity;
      for (const m of modes) {
        const cur = perfs[m]?.rating;
        if (cur != null) {
          const d = Math.abs(cur - displayed);
          if (d < bestDiff) { bestDiff = d; best = m; }
        }
      }
      if (best && bestDiff < 50) return best;
    }

    return null;
  }

  // ══════════════════════════════════════════════════════════════
  // ██ SITE-SPECIFIC: API & Data Loading
  // ══════════════════════════════════════════════════════════════
  async function loadOpponentData(opponent, myUsername) {
    if (fetching) return;
    fetching = true;
    try {
      console.log(`[Chess Better] Loading: ${opponent}`);
      showWidgetLoading(opponent);

      if (SITE === "lichess") {
        await loadLichessData(opponent, myUsername);
      } else {
        await loadChesscomData(opponent, myUsername);
      }
    } catch (e) {
      console.error("[Chess Better]", e);
      showWidgetError("Failed to load data");
    } finally {
      fetching = false;
    }
  }

  // ── chess.com data loading ─────────────────────────────────
  async function loadChesscomData(opponent, myUsername) {
    const [profile, stats] = await Promise.all([
      fetchJSON(`https://api.chess.com/pub/player/${opponent}`),
      fetchJSON(`https://api.chess.com/pub/player/${opponent}/stats`),
    ]);
    if (!profile || !stats) { showWidgetError("API request failed"); return; }

    let mode = detectGameMode(stats, opponent);
    if (!mode) {
      mode = await detectChesscomModeFromArchives(opponent);
      if (mode) detectedModeCache = mode;
    }
    console.log("[Chess Better] Mode:", mode);

    let peakRating = null, peakDate = null, currentRating = null, totalGames = null;
    if (mode && stats[mode]) {
      const ms = stats[mode];
      if (ms.best) { peakRating = ms.best.rating; peakDate = ms.best.date; }
      if (ms.last?.rating) currentRating = ms.last.rating;
      if (currentRating && peakRating && currentRating > peakRating) { peakRating = currentRating; peakDate = null; }
      if (ms.record) { const r = ms.record; totalGames = (r.win||0) + (r.loss||0) + (r.draw||0); }
    }

    let winRate = null;
    if (mode && stats[mode]?.record) {
      const r = stats[mode].record;
      const total = (r.win||0) + (r.loss||0) + (r.draw||0);
      if (total > 0) winRate = Math.round(((r.win||0) / total) * 100);
    }

    let country = profile.country ? profile.country.split("/").pop() : null;
    const status = profile.status || null;
    const gamesData = await fetchChesscomGames(opponent, myUsername, mode);

    if (winRate != null) gamesData.winRate = winRate;

    const data = {
      opponent, joined: profile.joined ? new Date(profile.joined * 1000) : null,
      peakRating, peakDate: peakDate ? new Date(peakDate * 1000) : null,
      currentRating, gameMode: mode, country, status, totalGames,
      ...gamesData,
    };
    cachedData[opponent] = data;
    renderWidget(data);
  }

  async function detectChesscomModeFromArchives(opponent) {
    const gameId = location.pathname.match(/\/game\/(?:live\/|daily\/)?(\d+)/)?.[1];
    try {
      const arch = await fetchJSON(`https://api.chess.com/pub/player/${opponent}/games/archives`);
      if (!arch?.archives?.length) return null;
      for (let i = arch.archives.length - 1; i >= Math.max(0, arch.archives.length - 3); i--) {
        const md = await fetchJSON(arch.archives[i]);
        if (!md?.games) continue;
        if (gameId) {
          for (const g of md.games) { if ((g.url||"").includes(gameId)) return "chess_" + g.time_class; }
        }
      }
      const md = await fetchJSON(arch.archives[arch.archives.length - 1]);
      if (md?.games?.length) return "chess_" + md.games[md.games.length - 1].time_class;
    } catch (e) { console.error("[Chess Better] archive error:", e); }
    return null;
  }

  async function fetchChesscomGames(opponent, myUsername, mode) {
    const result = { last10: [], streak: { type: null, count: 0 }, h2h: { w:0, d:0, l:0 }, winRate: null, timeoutRate: null, avgOpponent: null };
    try {
      const arch = await fetchJSON(`https://api.chess.com/pub/player/${opponent}/games/archives`);
      if (!arch?.archives?.length) return result;
      let allGames = [];
      for (let i = arch.archives.length - 1; i >= Math.max(0, arch.archives.length - 3); i--) {
        const md = await fetchJSON(arch.archives[i]);
        if (!md?.games) continue;
        let games = md.games;
        if (mode) games = games.filter(g => g.time_class === mode.replace("chess_", ""));
        allGames = games.concat(allGames);
        if (allGames.length >= 50) break;
      }
      allGames.sort((a, b) => (b.end_time||0) - (a.end_time||0));
      processGames(allGames, opponent, myUsername, result, "chesscom");
    } catch (e) { console.error("[Chess Better] games error:", e); }
    return result;
  }

  // ── lichess data loading ───────────────────────────────────
  async function loadLichessData(opponent, myUsername) {
    const gameId = getLichessGameId();

    // Step 1: Profile + current game API in parallel (all no-cache)
    const [profile, currentGame] = await Promise.all([
      fetchJSON(`https://lichess.org/api/user/${opponent}`, true),
      gameId ? fetchJSON(`https://lichess.org/api/game/${gameId}`, true) : null,
    ]);
    if (!profile) { showWidgetError("API request failed"); return; }

    // Mode detection: game API (most reliable) → DOM fallback
    let mode = currentGame?.speed || null;
    if (!mode) {
      const perfs = profile.perfs || {};
      mode = detectLichessMode(perfs);
    }
    console.log("[Chess Better] Lichess mode:", mode);

    const perfs = profile.perfs || {};
    let currentRating = mode && perfs[mode] ? perfs[mode].rating : null;
    const country = profile.profile?.country || null;
    const status = profile.online ? "online" : "offline";
    const joined = profile.createdAt ? new Date(profile.createdAt) : null;

    // Step 2: Perf stats (aggregate) + recent games (last10/streak/h2h) in parallel
    const [perfData, gamesData] = await Promise.all([
      mode ? fetchJSON(`https://lichess.org/api/user/${opponent}/perf/${mode}`, true) : null,
      fetchLichessGames(opponent, myUsername, mode),
    ]);

    // Aggregate stats from perf API (primary source)
    let peakRating = null, peakDate = null, totalGames = null;
    let winRate = null, avgOpponent = null;

    if (perfData?.stat) {
      const st = perfData.stat;
      if (st.highest) {
        peakRating = st.highest.int;
        peakDate = st.highest.at ? new Date(st.highest.at) : null;
      }
      if (st.count) {
        totalGames = st.count.all;
        const total = (st.count.win||0) + (st.count.loss||0) + (st.count.draw||0);
        if (total > 0) winRate = Math.round(((st.count.win||0) / total) * 100);
        if (st.count.opAvg) avgOpponent = Math.round(st.count.opAvg);
      }
    }

    // Fallback: compute from games if perf API failed
    if (!peakRating && gamesData._peakRating) {
      peakRating = gamesData._peakRating;
      peakDate = gamesData._peakDate ? new Date(gamesData._peakDate) : null;
    }
    if (!peakRating && currentRating) peakRating = currentRating;
    if (!totalGames && mode && perfs[mode]) totalGames = perfs[mode].games;

    const data = {
      opponent, joined, peakRating, peakDate,
      currentRating, gameMode: mode, country, status, totalGames,
      ...gamesData,
    };
    // Perf API overrides games-computed values
    if (winRate != null) data.winRate = winRate;
    if (avgOpponent != null) data.avgOpponent = avgOpponent;
    delete data._peakRating;
    delete data._peakDate;
    cachedData[opponent] = data;
    renderWidget(data);
  }

  async function fetchLichessGames(opponent, myUsername, mode) {
    const result = { last10: [], streak: { type: null, count: 0 }, h2h: { w:0, d:0, l:0 }, winRate: null, timeoutRate: null, avgOpponent: null, _peakRating: null, _peakDate: null };
    try {
      let url = `https://lichess.org/api/games/user/${opponent}?max=50`;
      if (mode) url += `&perfType=${mode}`;
      console.log(`[Chess Better] Fetching lichess games: ${url}`);
      const res = await fetch(url, { headers: { Accept: "application/x-ndjson" }, cache: "no-store" });
      if (!res.ok) { console.error(`[Chess Better] Lichess games API error: ${res.status}`); return result; }
      const text = await res.text();
      const allGames = text.trim().split("\n").filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
      console.log(`[Chess Better] Parsed ${allGames.length} lichess games`);

      // Track peak rating (fallback if perf API fails)
      let peak = 0, peakTimestamp = null;
      for (const g of allGames) {
        const side = g.players?.white?.user?.id?.toLowerCase() === opponent ? "white" : "black";
        const rating = g.players?.[side]?.rating;
        if (rating && rating > peak) { peak = rating; peakTimestamp = g.createdAt || null; }
      }
      if (peak > 0) { result._peakRating = peak; result._peakDate = peakTimestamp; }

      processGames(allGames, opponent, myUsername, result, "lichess");
    } catch (e) { console.error("[Chess Better] lichess games error:", e); }
    return result;
  }

  // ══════════════════════════════════════════════════════════════
  // ██ SHARED: Game Processing
  // ══════════════════════════════════════════════════════════════
  function processGames(allGames, opponent, myUsername, result, site) {
    const recent = allGames.slice(0, 10);
    let totalW = 0, totalL = 0, totalD = 0, timeouts = 0;
    let ratingSum = 0, ratingCount = 0;

    for (const g of allGames) {
      const { side, gameResult, opponentRating, isTimeout } = parseGameResult(g, opponent, site);
      if (gameResult === "W") totalW++;
      else if (gameResult === "L") { totalL++; if (isTimeout) timeouts++; }
      else totalD++;
      if (opponentRating && ratingCount < 20) { ratingSum += opponentRating; ratingCount++; }
    }

    for (const g of recent) {
      const { gameResult } = parseGameResult(g, opponent, site);
      result.last10.push(gameResult);
    }

    // Streak
    if (result.last10.length > 0) {
      const first = result.last10[0];
      result.streak = { type: first, count: 1 };
      for (let i = 1; i < result.last10.length; i++) {
        if (result.last10[i] === first) result.streak.count++;
        else break;
      }
    }

    // Win rate
    const total = totalW + totalL + totalD;
    if (total > 0) result.winRate = Math.round((totalW / total) * 100);

    // Timeout rate
    result.timeoutRate = total > 0 ? Math.round((timeouts / total) * 100) : 0;

    // Avg opponent (from first 20)
    if (ratingCount > 0) result.avgOpponent = Math.round(ratingSum / ratingCount);

    // H2H
    if (myUsername) {
      for (const g of allGames) {
        const { whiteUser, blackUser, gameResult } = parseGameResult(g, opponent, site);
        if (!((whiteUser === opponent && blackUser === myUsername) || (whiteUser === myUsername && blackUser === opponent))) continue;
        if (gameResult === "W") result.h2h.l++;
        else if (gameResult === "L") result.h2h.w++;
        else result.h2h.d++;
      }
    }
  }

  function parseGameResult(game, opponent, site) {
    if (site === "lichess") {
      const wUser = game.players?.white?.user?.id?.toLowerCase();
      const bUser = game.players?.black?.user?.id?.toLowerCase();
      const side = wUser === opponent ? "white" : "black";
      const opSide = side === "white" ? "black" : "white";
      const winner = game.winner; // "white", "black", or undefined (draw)
      const opponentRating = game.players?.[opSide]?.rating;
      const isTimeout = game.status === "outoftime";
      let gameResult = "D";
      if (winner === side) gameResult = "W";
      else if (winner && winner !== side) gameResult = "L";
      return { side, gameResult, opponentRating, isTimeout, whiteUser: wUser, blackUser: bUser };
    } else {
      // chess.com
      const wUser = game.white?.username?.toLowerCase();
      const bUser = game.black?.username?.toLowerCase();
      const side = wUser === opponent ? "white" : "black";
      const opSide = side === "white" ? "black" : "white";
      const r = game[side]?.result;
      const opponentRating = game[opSide]?.rating;
      const isTimeout = r === "timeout";
      let gameResult = "D";
      if (r === "win") gameResult = "W";
      else if (["checkmated", "timeout", "resigned", "abandoned"].includes(r)) gameResult = "L";
      return { side, gameResult, opponentRating, isTimeout, whiteUser: wUser, blackUser: bUser };
    }
  }

  // ══════════════════════════════════════════════════════════════
  // ██ SHARED: Utilities
  // ══════════════════════════════════════════════════════════════
  async function fetchJSON(url, noCache = false) {
    try {
      const opts = noCache ? { cache: "no-store" } : {};
      const res = await fetch(url, opts);
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  function countryFlag(code) {
    if (!code || code.length !== 2) return "";
    const offset = 0x1F1E6 - 65;
    return String.fromCodePoint(code.charCodeAt(0) + offset, code.charCodeAt(1) + offset);
  }

  function pad(n) { return String(n).padStart(2, "0"); }

  // ══════════════════════════════════════════════════════════════
  // ██ SHARED: Widget Rendering
  // ══════════════════════════════════════════════════════════════
  function getWidget() { return document.getElementById("cb-widget"); }
  function hideWidget() { const w = getWidget(); if (w) w.style.display = "none"; }

  function showWidgetLoading(opponent) {
    let w = getWidget(); if (!w) w = createWidget();
    w.style.display = "";
    w.querySelector(".cb-body").innerHTML = `<div class="cb-loading">Loading ${opponent}...</div>`;
  }

  function showWidgetError(msg) {
    const w = getWidget(); if (!w) return;
    w.querySelector(".cb-body").innerHTML = `<div class="cb-error">${msg}</div>`;
  }

  function renderWidget(data) {
    let w = getWidget(); if (!w) w = createWidget();
    w.style.display = "";
    const body = w.querySelector(".cb-body");
    const title = w.querySelector(".cb-opponent-name");
    const flag = fieldSettings.showCountry && data.country ? countryFlag(data.country) + " " : "";
    title.textContent = flag + data.opponent;

    const rows = [];
    const s = fieldSettings;

    if (s.showStatus && data.status) {
      const map = { online: '<span class="cb-status-online">● online</span>', offline: '<span class="cb-status-offline">○ offline</span>' };
      rows.push(row("Status", map[data.status] || data.status));
    }
    if (s.showCountry && data.country) rows.push(row("Country", `${countryFlag(data.country)} ${data.country}`));
    if (s.showJoined) {
      const j = data.joined ? `${data.joined.getFullYear()}.${pad(data.joined.getMonth()+1)}.${pad(data.joined.getDate())}` : "N/A";
      rows.push(row("Joined", j));
    }
    if (s.showPeak) {
      let p = data.peakRating ? `${data.peakRating}` : "N/A";
      if (data.peakDate) { const d = data.peakDate; p += ` (${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())})`; }
      rows.push(row("Peak Elo", p));
    }
    if (s.showRatingDiff && data.currentRating && data.peakRating) {
      const diff = data.currentRating - data.peakRating;
      const cls = diff >= 0 ? "cb-result-w" : "cb-result-l";
      rows.push(row("vs Peak", `<span class="${cls}">${diff >= 0 ? "+" : ""}${diff}</span>`));
    }
    if (s.showTotalGames && data.totalGames != null) rows.push(row("Games", `${data.totalGames.toLocaleString()}`));
    if (s.showWinRate && data.winRate != null) rows.push(row("Win Rate", `${data.winRate}%`));
    if (s.showAvgOpponent && data.avgOpponent != null) rows.push(row("Avg Opp", `${data.avgOpponent}`));
    if (s.showStreak) {
      let str = "-";
      if (data.streak.count > 0) {
        if (data.streak.type === "W") str = `🔥 ${data.streak.count}W streak`;
        else if (data.streak.type === "L") str = `📉 ${data.streak.count}L streak`;
        else str = `➖ ${data.streak.count} draws`;
      }
      rows.push(row("Streak", str));
    }
    if (s.showLast10) {
      const html = data.last10.map(r => {
        const c = r === "W" ? "cb-result-w" : r === "L" ? "cb-result-l" : "cb-result-d";
        return `<span class="${c}">${r}</span>`;
      }).join("") || "N/A";
      rows.push(row("Last 10", `<span class="cb-last10">${html}</span>`));
    }
    if (s.showTimeoutRate && data.timeoutRate != null) rows.push(row("Timeout", `${data.timeoutRate}%`));
    if (s.showH2H) {
      const h = data.h2h;
      const str = h.w + h.d + h.l > 0
        ? `<span class="cb-result-w">${h.w}W</span> <span class="cb-result-d">${h.d}D</span> <span class="cb-result-l">${h.l}L</span>`
        : "No record";
      rows.push(row("H2H", str));
    }
    body.innerHTML = rows.join("");
  }

  function row(label, value) {
    return `<div class="cb-row"><span class="cb-label">${label}</span><span class="cb-value">${value}</span></div>`;
  }

  function createWidget() {
    const w = document.createElement("div");
    w.id = "cb-widget";
    w.innerHTML = `<div class="cb-header"><span class="cb-opponent-name"></span><span class="cb-drag-handle">⠿</span></div><div class="cb-body"></div>`;
    document.body.appendChild(w);
    makeDraggable(w);
    restorePosition(w);
    return w;
  }

  // ── Drag ────────────────────────────────────────────────────
  function makeDraggable(el) {
    const header = el.querySelector(".cb-header");
    let dragging = false, ox = 0, oy = 0;
    header.addEventListener("mousedown", (e) => { dragging = true; ox = e.clientX - el.offsetLeft; oy = e.clientY - el.offsetTop; header.style.cursor = "grabbing"; e.preventDefault(); });
    document.addEventListener("mousemove", (e) => { if (!dragging) return; let x = Math.max(0, Math.min(e.clientX - ox, window.innerWidth - el.offsetWidth)); let y = Math.max(0, Math.min(e.clientY - oy, window.innerHeight - el.offsetHeight)); el.style.left = x + "px"; el.style.top = y + "px"; });
    document.addEventListener("mouseup", () => { if (!dragging) return; dragging = false; header.style.cursor = ""; savePosition(el); });
  }

  function savePosition(el) { chrome.storage.local.set({ cbWidgetPos: { left: el.offsetLeft, top: el.offsetTop } }); }
  function restorePosition(el) {
    chrome.storage.local.get("cbWidgetPos", (res) => {
      const pos = res.cbWidgetPos;
      if (pos) { el.style.left = Math.max(0, Math.min(pos.left, window.innerWidth - 320)) + "px"; el.style.top = Math.max(0, Math.min(pos.top, window.innerHeight - 200)) + "px"; }
      else { el.style.right = "20px"; el.style.top = "80px"; }
    });
  }
})();
