/**
 * Shorts Killer — content script (v0.8.0)
 *
 * Core responsibilities:
 * - Detect Shorts and YouTube SPA navigation.
 * - Protect every new Shorts video once.
 * - Keep statistics as append-only events to avoid multi-tab lost updates.
 * - Enforce daily and strict limits in the content script.
 * - Hide Shorts cards without hiding unrelated YouTube content.
 * - Keep all normal statistics local to the browser.
 */

(function () {
  "use strict";

  const EXTENSION_VERSION = "0.8.0";
  const BLOCKED_REDIRECT_URL = "https://www.youtube.com/";
  const EVENT_PREFIX = "shortsKillerEvent:";
  const LEGACY_MIGRATION_PREFIX = "legacy:";

  const DEFAULT_SETTINGS = {
    mode: "soft",
    timerSeconds: 10,
    dailyLimit: 5,
    strictLimit: false,
    botToken: "",
    chatId: "",
    strictLimitDate: null,
    strictLimitValue: null,
    hideShortsEverywhere: false,
  };

  const QUESTIONS = [
    "Это приближает тебя к цели?",
    "Ты правда хотел это посмотреть, или просто кликнул?",
    "Через 10 минут ты будешь рад, что посмотрел это?",
    "Сколько полезного ты получил от последних 5 Shorts?",
    "Ты сейчас скучаешь или просто избегаешь дела?",
    "Это стоит тех минут, которые ты сейчас тратишь?",
    "Ты уже смотрел что-то похожее сегодня?",
    "Что полезнее: этот Shorts или 1 страница учебника?",
    "Ты контролируешь просмотр или просмотр контролирует тебя?",
    "Зачем тебе это прямо сейчас?",
    "Ты сможешь остановиться после одного, или будет ещё 10?",
    "Это развлечение или просто привычка?",
    "Какую задачу ты сейчас откладываешь?",
    "Если бы Shorts стоили 10 рублей за штуку — ты бы всё равно нажал?",
    "Ты сейчас отдыхаешь или прокрастинируешь?",
    "Что ты почувствуешь через час после этого просмотра?",
    "Есть ли что-то более важное, чем этот ролик?",
    "Ты открыл Shorts специально или рука сама потянулась?",
    "Сколько ещё раз ты сегодня так сделаешь?",
    "Это помогает тебе стать лучше?",
    "Ты бы порекомендовал этот Shorts другу как полезный?",
    "Что важнее: 60 секунд дофамина или прогресс?",
    "Ты уже знаешь, что здесь почти наверняка ничего ценного?",
    "Можешь честно сказать себе, зачем ты это смотришь?",
    "Если бы сейчас был экзамен — ты бы всё равно открыл?",
    "Ты хочешь посмотреть или просто боишься скуки?",
    "Сколько времени ты уже сегодня потерял на Shorts?",
    "Это последний раз сегодня? Честно?",
    "Ты управляешь вниманием или оно управляет тобой?",
    "Что бы сказал тебе будущий ты через год?",
    "Стоит ли этот ролик того, чтобы снова сорваться?",
    "Ты сейчас выбираешь лёгкий путь. Он тебя устраивает?",
    "Можешь просто закрыть и вернуться к делу?",
  ];

  let settings = { ...DEFAULT_SETTINGS };
  let currentShortId = null;
  let overlayElement = null;
  let timerInterval = null;
  let protectionActive = false;
  let visibilityObserver = null;
  let lastSavedEventAt = 0;

  function getToday() {
    const d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  }

  function getEventKey(type, id = crypto.randomUUID()) {
    return `${EVENT_PREFIX}${Date.now()}:${id}:${type}`;
  }

  function setStorage(values) {
    return chrome.storage.local.set(values);
  }

  async function getStorage(keys = null) {
    return chrome.storage.local.get(keys);
  }

  async function writeEvent(type, extra = {}) {
    const event = {
      version: 1,
      type,
      date: getToday(),
      timestamp: Date.now(),
      ...extra,
    };
    await setStorage({ [getEventKey(type)]: event });
    return event;
  }

  function isEventKey(key) {
    return typeof key === "string" && key.startsWith(EVENT_PREFIX);
  }

  function normalizeEvent(value) {
    if (!value || typeof value !== "object") return null;
    if (!value.type || !value.date) return null;
    return value;
  }

  async function migrateLegacyStatsIfNeeded() {
    const data = await getStorage(null);
    const legacy = data.stats;
    if (!legacy || data[`${EVENT_PREFIX}migrationDone`]) return;

    const date = String(legacy.date || getToday());
    const triggers = Math.max(0, Number(legacy.triggers) || 0);
    const watched = Math.max(0, Number(legacy.watched) || 0);
    const saved = Math.max(0, Number(legacy.savedMinutes) || 0);
    const values = {};

    for (let i = 0; i < triggers; i += 1) {
      values[`${EVENT_PREFIX}${LEGACY_MIGRATION_PREFIX}${date}:trigger:${i}`] = {
        version: 1,
        type: "trigger",
        date,
        timestamp: Date.now(),
        migrated: true,
      };
    }

    for (let i = 0; i < watched; i += 1) {
      values[`${EVENT_PREFIX}${LEGACY_MIGRATION_PREFIX}${date}:watched:${i}`] = {
        version: 1,
        type: "watched",
        date,
        timestamp: Date.now(),
        migrated: true,
      };
    }

    for (let i = 0; i < saved; i += 1) {
      values[`${EVENT_PREFIX}${LEGACY_MIGRATION_PREFIX}${date}:saved:${i}`] = {
        version: 1,
        type: "saved_estimate",
        date,
        timestamp: Date.now(),
        migrated: true,
      };
    }

    values[`${EVENT_PREFIX}migrationDone`] = {
      version: 1,
      type: "migration",
      date: getToday(),
      timestamp: Date.now(),
    };

    await setStorage(values);
  }

  async function getEvents() {
    const data = await getStorage(null);
    return Object.entries(data)
      .filter(([key]) => isEventKey(key))
      .map(([, value]) => normalizeEvent(value))
      .filter(Boolean);
  }

  async function getStatsSnapshot() {
    const events = await getEvents();
    const today = getToday();
    const todayEvents = events.filter((event) => event.date === today);
    const triggers = todayEvents.filter((event) => event.type === "trigger").length;
    const watched = todayEvents.filter((event) => event.type === "watched").length;
    const savedEstimate = todayEvents.filter((event) => event.type === "saved_estimate").length;

    const historyMap = new Map();
    for (const event of events) {
      if (!historyMap.has(event.date)) {
        historyMap.set(event.date, { date: event.date, triggers: 0, watched: 0, savedEstimate: 0 });
      }
      const day = historyMap.get(event.date);
      if (event.type === "trigger") day.triggers += 1;
      if (event.type === "watched") day.watched += 1;
      if (event.type === "saved_estimate") day.savedEstimate += 1;
    }

    const history = [...historyMap.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    return { date: today, triggers, watched, savedEstimate, history };
  }

  async function cleanupOldEvents() {
    const cutoff = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const data = await getStorage(null);
    const removeKeys = [];

    for (const [key, value] of Object.entries(data)) {
      if (!isEventKey(key) || key.endsWith("migrationDone")) continue;
      const timestamp = Number(value?.timestamp) || 0;
      if (timestamp && timestamp < cutoff) removeKeys.push(key);
    }

    if (removeKeys.length) await chrome.storage.local.remove(removeKeys);
  }

  function normalizeSettings(raw) {
    const merged = { ...DEFAULT_SETTINGS, ...(raw || {}) };
    merged.mode = merged.mode === "hard" ? "hard" : "soft";
    merged.timerSeconds = Math.max(3, Math.min(60, Number(merged.timerSeconds) || 10));
    merged.dailyLimit = Math.max(0, Math.min(50, Number(merged.dailyLimit) || 0));
    merged.strictLimit = !!merged.strictLimit;
    merged.hideShortsEverywhere = !!merged.hideShortsEverywhere;
    return merged;
  }

  async function loadData() {
    const data = await getStorage(["settings"]);
    settings = normalizeSettings(data.settings);
    await migrateLegacyStatsIfNeeded();
    await cleanupOldEvents();
    rolloverStrictLimitIfNeeded();
  }

  function rolloverStrictLimitIfNeeded() {
    const today = getToday();
    if (settings.strictLimitDate !== today) {
      settings.strictLimitDate = null;
      settings.strictLimitValue = null;
      setStorage({ settings }).catch(() => {});
    }
  }

  async function saveSettings() {
    settings = normalizeSettings(settings);
    await setStorage({ settings });
  }

  async function enforceStrictLimit(stats) {
    if (!settings.strictLimit || settings.dailyLimit <= 0) return;
    const today = getToday();
    if (settings.strictLimitDate !== today) {
      settings.strictLimitDate = null;
      settings.strictLimitValue = null;
    }

    if (settings.strictLimitDate === today) {
      const locked = Number(settings.strictLimitValue);
      if (Number.isFinite(locked) && settings.dailyLimit > locked) {
        settings.dailyLimit = locked;
        await saveSettings();
      }
      return;
    }

    if (stats.watched >= settings.dailyLimit) {
      settings.strictLimitDate = today;
      settings.strictLimitValue = settings.dailyLimit;
      await saveSettings();
    }
  }

  function isShortsUrl(url) {
    return typeof url === "string" && /\/shorts\/[^/?#]+/i.test(url);
  }

  function getShortId(url) {
    if (!isShortsUrl(url)) return null;
    const match = url.match(/\/shorts\/([^/?#]+)/i);
    return match ? match[1] : null;
  }

  const SHORTS_ITEM_SELECTORS = [
    "ytd-reel-shelf-renderer",
    "ytd-rich-shelf-renderer",
    "ytd-rich-item-renderer",
    "ytd-grid-video-renderer",
    "ytd-video-renderer",
    "ytd-compact-video-renderer",
  ];

  function getShortsAnchors(root = document) {
    if (!root?.querySelectorAll) return [];
    return root.querySelectorAll('a[href*="/shorts/"]');
  }

  function findHideTarget(anchor) {
    if (!anchor) return null;
    const target = anchor.closest(SHORTS_ITEM_SELECTORS.join(","));
    if (target) return target;

    // Safer fallback: only walk a few levels and prefer compact containers.
    let node = anchor.parentElement;
    for (let i = 0; i < 4 && node && node !== document.body; i += 1) {
      if (
        node.matches?.("ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer")
      ) {
        return node;
      }
      node = node.parentElement;
    }

    return anchor;
  }

  function setHidden(element, hidden) {
    if (!element) return;
    if (hidden) element.setAttribute("data-shorts-killer-hidden", "true");
    else element.removeAttribute("data-shorts-killer-hidden");
  }

  function applyShortsVisibility(root = document) {
    const enabled = !!settings.hideShortsEverywhere;
    const onShortsPage = isShortsUrl(window.location.href);

    if (!enabled || onShortsPage) {
      document.querySelectorAll('[data-shorts-killer-hidden="true"]').forEach((el) => setHidden(el, false));
      return;
    }

    if (root.nodeType === Node.ELEMENT_NODE && root.matches?.('a[href*="/shorts/"]')) {
      setHidden(findHideTarget(root), true);
    }

    getShortsAnchors(root).forEach((anchor) => setHidden(findHideTarget(anchor), true));
  }

  function initVisibilityObserver() {
    if (visibilityObserver) return;
    visibilityObserver = new MutationObserver((mutations) => {
      if (!settings.hideShortsEverywhere || isShortsUrl(window.location.href)) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) applyShortsVisibility(node);
        }
      }
    });
    visibilityObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function getRandomQuestion() {
    return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  }

  async function finalizeActiveProtection() {
    if (!protectionActive) return;
    protectionActive = false;
    const now = Date.now();
    if (now - lastSavedEventAt < 250) return;
    lastSavedEventAt = now;
    await writeEvent("saved_estimate", { minutes: 1 });
  }

  async function triggerProtection(shortId) {
    if (!shortId || currentShortId === shortId) return;

    currentShortId = shortId;
    const stats = await getStatsSnapshot();
    await enforceStrictLimit(stats);

    await writeEvent("trigger", { shortId });

    const freshStats = await getStatsSnapshot();
    const limitReached = settings.dailyLimit > 0 && freshStats.watched >= settings.dailyLimit;

    if (settings.mode === "hard" || limitReached) {
      await blockShort();
    } else {
      showOverlay(freshStats);
    }
  }

  async function blockShort() {
    protectionActive = false;
    await writeEvent("saved_estimate", { minutes: 1, reason: "blocked" });
    // Do not hijack the user into unrelated content. Return to a neutral YouTube page.
    window.location.replace(BLOCKED_REDIRECT_URL);
  }

  function showOverlay(stats) {
    removeOverlay();
    protectionActive = true;

    const question = getRandomQuestion();
    const limitText = settings.dailyLimit > 0
      ? `Разрешено сегодня: ${stats.watched} / ${settings.dailyLimit}`
      : "Лимит не установлен";

    overlayElement = document.createElement("div");
    overlayElement.id = "shorts-killer-overlay";

    const title = document.createElement("h1");
    title.textContent = "Это Shorts";

    const description = document.createElement("p");
    description.innerHTML = "Остановись на несколько секунд и реши осознанно, хочешь ли ты продолжить.";

    const questionEl = document.createElement("div");
    questionEl.id = "shorts-killer-question";
    questionEl.textContent = question;

    const timerEl = document.createElement("div");
    timerEl.id = "shorts-killer-timer";
    timerEl.textContent = String(settings.timerSeconds);

    const btn = document.createElement("button");
    btn.id = "shorts-killer-btn";
    btn.type = "button";
    btn.textContent = "Я осознанно хочу посмотреть";

    const statsEl = document.createElement("div");
    statsEl.id = "shorts-killer-stats";
    statsEl.textContent = `Сегодня защита сработала: ${stats.triggers + 1} раз\nВсё равно посмотрел: ${stats.watched} раз\n${limitText}`;

    overlayElement.append(title, description, questionEl, timerEl, btn, statsEl);
    document.documentElement.appendChild(overlayElement);

    let remaining = Math.max(3, Number(settings.timerSeconds) || 10);
    timerInterval = setInterval(() => {
      remaining -= 1;
      if (timerEl) timerEl.textContent = String(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        if (btn) btn.style.display = "inline-block";
        if (timerEl) timerEl.style.display = "none";
      }
    }, 1000);

    btn.addEventListener("click", async () => {
      const fresh = await getStatsSnapshot();
      if (settings.dailyLimit > 0 && fresh.watched >= settings.dailyLimit) {
        removeOverlay();
        await blockShort();
        return;
      }

      await writeEvent("watched", { shortId: currentShortId });
      protectionActive = false;
      removeOverlay();
    }, { once: true });
  }

  function removeOverlay() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (overlayElement) {
      overlayElement.remove();
      overlayElement = null;
    }
  }

  async function onLeftShorts() {
    await finalizeActiveProtection();
    removeOverlay();
    currentShortId = null;
  }

  async function checkCurrentPage() {
    applyShortsVisibility();
    const shortId = getShortId(window.location.href);

    if (!shortId) {
      await onLeftShorts();
      return;
    }

    if (currentShortId === shortId) return;

    await finalizeActiveProtection();
    removeOverlay();
    await triggerProtection(shortId);
  }

  async function init() {
    await loadData();
    initVisibilityObserver();
    await checkCurrentPage();

    document.addEventListener("yt-navigate-finish", () => {
      setTimeout(() => checkCurrentPage().catch(() => {}), 120);
    });

    window.addEventListener("popstate", () => {
      setTimeout(() => checkCurrentPage().catch(() => {}), 50);
    });

    setInterval(() => {
      checkCurrentPage().catch(() => {});
    }, 1000);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;

      if (changes.settings) {
        settings = normalizeSettings(changes.settings.newValue);
        rolloverStrictLimitIfNeeded();
        applyShortsVisibility();
      }
    });
  }

  // Prevent unused-version lint noise in plain browser execution.
  void EXTENSION_VERSION;
  init().catch(() => {});
})();
