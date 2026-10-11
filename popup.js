/**
 * Shorts Killer — popup script (v0.8.0)
 */

document.addEventListener("DOMContentLoaded", async () => {
  const screenMain = document.getElementById("screen-main");
  const screenSettings = document.getElementById("screen-settings");
  const btnSettings = document.getElementById("btn-settings");
  const btnBack = document.getElementById("btn-back");

  const triggersEl = document.getElementById("triggers");
  const blockedEl = document.getElementById("blocked");
  const watchedEl = document.getElementById("watched");
  const blockRateEl = document.getElementById("block-rate");
  const savedEl = document.getElementById("saved");
  const weekBlockedEl = document.getElementById("week-blocked");
  const resetInfoEl = document.getElementById("reset-info");

  const modeSoft = document.getElementById("mode-soft");
  const modeHard = document.getElementById("mode-hard");
  const timerInput = document.getElementById("timer");
  const limitInput = document.getElementById("limit");
  const strictLimitCheckbox = document.getElementById("strict-limit");
  const hideShortsEverywhereCheckbox = document.getElementById("hide-shorts-everywhere");
  const botTokenInput = document.getElementById("bot-token");
  const chatIdInput = document.getElementById("chat-id");
  const btnSendReport = document.getElementById("btn-send-report");
  const tgStatus = document.getElementById("tg-status");
  const saveBtn = document.getElementById("save-btn");
  const saveStatus = document.getElementById("save-status");

  const EVENT_PREFIX = "shortsKillerEvent:";
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

  function getToday() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  }

  function normalizeSettings(raw) {
    const settings = { ...DEFAULT_SETTINGS, ...(raw || {}) };
    settings.mode = settings.mode === "hard" ? "hard" : "soft";
    settings.timerSeconds = Math.max(3, Math.min(60, Number(settings.timerSeconds) || 10));
    settings.dailyLimit = Math.max(0, Math.min(50, Number(settings.dailyLimit) || 0));
    settings.strictLimit = !!settings.strictLimit;
    settings.hideShortsEverywhere = !!settings.hideShortsEverywhere;
    return settings;
  }

  async function getEvents() {
    const data = await chrome.storage.local.get(null);
    return Object.entries(data)
      .filter(([key]) => key.startsWith(EVENT_PREFIX) && !key.endsWith("migrationDone"))
      .map(([, value]) => value)
      .filter((event) => event && event.date && event.type);
  }

  function buildStats(events) {
    const today = getToday();
    const todayEvents = events.filter((event) => event.date === today);
    const triggers = todayEvents.filter((event) => event.type === "trigger").length;
    const watched = todayEvents.filter((event) => event.type === "watched").length;
    const savedEstimate = todayEvents
      .filter((event) => event.type === "saved_estimate")
      .reduce((sum, event) => sum + (Number(event.minutes) || 1), 0);

    const historyMap = new Map();
    for (const event of events) {
      if (!historyMap.has(event.date)) historyMap.set(event.date, { date: event.date, triggers: 0, watched: 0 });
      const day = historyMap.get(event.date);
      if (event.type === "trigger") day.triggers += 1;
      if (event.type === "watched") day.watched += 1;
    }

    return { today, triggers, watched, savedEstimate, history: [...historyMap.values()] };
  }

  function getWeekBlocked(history) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 6);
    const startKey = [start.getFullYear(), String(start.getMonth() + 1).padStart(2, "0"), String(start.getDate()).padStart(2, "0")].join("-");
    return history
      .filter((day) => String(day.date) >= startKey)
      .reduce((sum, day) => sum + Math.max(0, day.triggers - day.watched), 0);
  }

  function renderStats(stats) {
    const triggers = stats.triggers;
    const watched = stats.watched;
    const blocked = Math.max(0, triggers - watched);
    const blockRate = triggers ? Math.round((blocked / triggers) * 100) : 0;

    triggersEl.textContent = triggers;
    blockedEl.textContent = blocked;
    watchedEl.textContent = watched;
    blockRateEl.textContent = `${blockRate}%`;
    savedEl.textContent = stats.savedEstimate;
    weekBlockedEl.textContent = getWeekBlocked(stats.history);
    resetInfoEl.textContent = "сброс завтра";
  }

  const data = await chrome.storage.local.get(["settings"]);
  let settings = normalizeSettings(data.settings);
  let events = await getEvents();
  let stats = buildStats(events);

  if (settings.strictLimitDate !== getToday()) {
    settings.strictLimitDate = null;
    settings.strictLimitValue = null;
    await chrome.storage.local.set({ settings });
  }

  renderStats(stats);

  modeSoft.checked = settings.mode === "soft";
  modeHard.checked = settings.mode === "hard";
  timerInput.value = settings.timerSeconds;
  limitInput.value = settings.dailyLimit;
  strictLimitCheckbox.checked = settings.strictLimit;
  hideShortsEverywhereCheckbox.checked = settings.hideShortsEverywhere;
  botTokenInput.value = settings.botToken || "";
  chatIdInput.value = settings.chatId || "";

  btnSettings.addEventListener("click", () => {
    screenMain.classList.add("hidden");
    screenSettings.classList.remove("hidden");
  });

  btnBack.addEventListener("click", () => {
    screenSettings.classList.add("hidden");
    screenMain.classList.remove("hidden");
  });

  function applyStrictLimitLogic() {
    const locked = settings.strictLimit && settings.strictLimitDate === getToday() && Number.isFinite(Number(settings.strictLimitValue));
    if (locked) {
      limitInput.max = String(Number(settings.strictLimitValue));
      limitInput.title = "Строгий лимит: нельзя увеличить до завтра";
    } else {
      limitInput.max = "50";
      limitInput.title = "";
    }
  }

  applyStrictLimitLogic();

  async function saveMode(mode) {
    settings.mode = mode;
    await chrome.storage.local.set({ settings });
  }

  modeSoft.addEventListener("change", () => {
    if (modeSoft.checked) saveMode("soft").catch(() => {});
  });
  modeHard.addEventListener("change", () => {
    if (modeHard.checked) saveMode("hard").catch(() => {});
  });

  strictLimitCheckbox.addEventListener("change", () => {
    settings.strictLimit = strictLimitCheckbox.checked;
    applyStrictLimitLogic();
  });

  saveBtn.addEventListener("click", async () => {
    events = await getEvents();
    stats = buildStats(events);

    let newLimit = Math.max(0, Math.min(50, Number.parseInt(limitInput.value, 10) || 0));
    const strictLocked = settings.strictLimit && settings.strictLimitDate === getToday() && Number.isFinite(Number(settings.strictLimitValue));

    if (strictLocked) {
      newLimit = Math.min(newLimit, Number(settings.strictLimitValue));
    }

    const newSettings = {
      ...settings,
      mode: modeHard.checked ? "hard" : "soft",
      timerSeconds: Math.max(3, Math.min(60, Number.parseInt(timerInput.value, 10) || 10)),
      dailyLimit: newLimit,
      strictLimit: strictLimitCheckbox.checked,
      hideShortsEverywhere: hideShortsEverywhereCheckbox.checked,
      botToken: botTokenInput.value.trim(),
      chatId: chatIdInput.value.trim(),
    };

    if (!newSettings.strictLimit || newSettings.dailyLimit === 0) {
      newSettings.strictLimitDate = null;
      newSettings.strictLimitValue = null;
    } else if (!newSettings.strictLimitDate && stats.watched >= newSettings.dailyLimit) {
      newSettings.strictLimitDate = getToday();
      newSettings.strictLimitValue = newSettings.dailyLimit;
    }

    settings = normalizeSettings(newSettings);
    await chrome.storage.local.set({ settings });
    applyStrictLimitLogic();

    saveStatus.textContent = "Сохранено ✓";
    saveStatus.style.color = "#4ade80";
    setTimeout(() => { saveStatus.textContent = ""; }, 1500);
  });

  btnSendReport.addEventListener("click", async () => {
    const token = botTokenInput.value.trim();
    const chatId = chatIdInput.value.trim();

    if (!token || !chatId) {
      tgStatus.textContent = "Укажи токен и Chat ID";
      tgStatus.style.color = "#ff4d4d";
      return;
    }

    tgStatus.textContent = "Отправляю...";
    tgStatus.style.color = "#aaa";

    events = await getEvents();
    stats = buildStats(events);
    const dateStr = new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    const modeName = settings.mode === "hard" ? "Жёсткий" : "Мягкий";
    const limitText = settings.dailyLimit > 0 ? `${settings.dailyLimit} Shorts` : "без лимита";
    const blocked = Math.max(0, stats.triggers - stats.watched);
    const rate = stats.triggers ? Math.round((blocked / stats.triggers) * 100) : 0;

    const text = [
      "🛡️ <b>Shorts Killer — отчёт</b>",
      `📅 ${dateStr}`,
      "",
      `Защита сработала: <b>${stats.triggers}</b> раз`,
      `Не продолжено: <b>${blocked}</b> раз`,
      `Всё равно посмотрел: <b>${stats.watched}</b> раз`,
      `Доля остановленных попыток: <b>${rate}%</b>`,
      `Оценочно сэкономлено: <b>${stats.savedEstimate}</b> мин`,
      "",
      `Режим: ${modeName}`,
      `Лимит: ${limitText}`,
      `Строгий лимит: ${settings.strictLimit ? "включён" : "выключен"}`,
    ].join("\n");

    try {
      const response = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.description || "Telegram API error");
      tgStatus.textContent = "Отправлено ✓";
      tgStatus.style.color = "#4ade80";
    } catch (error) {
      tgStatus.textContent = `Ошибка: ${error.message || "сеть"}`;
      tgStatus.style.color = "#ff4d4d";
    }

    setTimeout(() => { tgStatus.textContent = ""; }, 4000);
  });
});
