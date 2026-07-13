(() => {
  "use strict";

  const STATS_KEY = "saa_stats_v1";
  const BOOKMARK_KEY = "saa_bookmarks_v1";
  const DAILY_KEY = "saa_daily_v1";
  const DAILY_BATCH = 10;

  let allQuestions = [];
  let stats = {};       // id -> {attempts, correctCount, lastCorrect}
  let bookmarks = new Set();
  let daily = { pointer: 0, history: [] }; // history: [{date, ids, results, done}]

  let session = null;   // {queue, index, score, missedIds, selected, submitted, isDaily, dayDate}

  const $ = (id) => document.getElementById(id);
  function on(id, event, handler) {
    const el = $(id);
    if (el) el.addEventListener(event, handler);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // ---------- persistence ----------
  function loadStats() {
    try { stats = JSON.parse(localStorage.getItem(STATS_KEY)) || {}; }
    catch { stats = {}; }
  }
  function saveStats() {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }
  function loadBookmarks() {
    try { bookmarks = new Set(JSON.parse(localStorage.getItem(BOOKMARK_KEY)) || []); }
    catch { bookmarks = new Set(); }
  }
  function saveBookmarks() {
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify([...bookmarks]));
  }

  function loadDaily() {
    try {
      const d = JSON.parse(localStorage.getItem(DAILY_KEY));
      daily = d && typeof d === "object" ? d : { pointer: 0, history: [] };
    } catch { daily = { pointer: 0, history: [] }; }
    if (!Array.isArray(daily.history)) daily.history = [];
    if (typeof daily.pointer !== "number") daily.pointer = 0;
  }
  function saveDaily() {
    localStorage.setItem(DAILY_KEY, JSON.stringify(daily));
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function ensureTodayEntry() {
    const today = todayStr();
    let entry = daily.history.find((h) => h.date === today);
    if (entry) return entry;
    if (daily.pointer >= allQuestions.length) daily.pointer = 0; // finished a full round, start over
    const ids = allQuestions.slice(daily.pointer, daily.pointer + DAILY_BATCH).map((q) => q.id);
    entry = { date: today, ids, results: {}, done: false };
    daily.history.push(entry);
    daily.pointer += ids.length;
    saveDaily();
    return entry;
  }

  function computeStreak() {
    const doneDates = new Set(daily.history.filter((h) => h.done).map((h) => h.date));
    if (doneDates.size === 0) return 0;
    let streak = 0;
    let cursor = new Date();
    // if today isn't done yet, start counting from yesterday
    if (!doneDates.has(todayStr())) cursor.setDate(cursor.getDate() - 1);
    for (;;) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
      if (!doneDates.has(key)) break;
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function refreshDailyUI() {
    if (allQuestions.length === 0 || !$("dailyStartBtn")) return;
    const today = todayStr();
    const todayEntry = daily.history.find((h) => h.date === today);
    const totalPool = allQuestions.length;
    const totalDays = Math.ceil(totalPool / DAILY_BATCH);
    const dayNumber = todayEntry
      ? daily.history.findIndex((h) => h.date === today) + 1
      : daily.history.length + 1;

    const assigned = Math.min(daily.pointer, totalPool);
    $("dailyProgressFill").style.width = `${(assigned / totalPool) * 100}%`;
    $("dailyProgressText").textContent = `已排入進度 ${assigned} / ${totalPool} 題（第 ${Math.min(dayNumber, totalDays)} / ${totalDays} 天）`;

    const streak = computeStreak();
    $("dailyStreak").textContent = streak > 0 ? `🔥 連續 ${streak} 天` : "";

    const startBtn = $("dailyStartBtn");
    if (todayEntry && todayEntry.done) {
      const correctCount = Object.values(todayEntry.results).filter(Boolean).length;
      $("dailyStatus").textContent = `今天已完成！答對 ${correctCount} / ${todayEntry.ids.length} 題。`;
      startBtn.textContent = "重新複習今天的題目";
    } else if (todayEntry && !todayEntry.done) {
      $("dailyStatus").textContent = `今天的 ${todayEntry.ids.length} 題還沒做完，繼續加油！`;
      startBtn.textContent = "繼續今天的10題";
    } else if (daily.pointer >= totalPool) {
      $("dailyStatus").textContent = `🎉 題庫全部 ${totalPool} 題都已排入每日進度！可以重新開始下一輪複習。`;
      startBtn.textContent = "從頭開始下一輪";
    } else {
      $("dailyStatus").textContent = `今天還沒開始，準備好背今天的 10 題了嗎？`;
      startBtn.textContent = "開始今天的10題";
    }

    renderDailyHistory();
  }

  function renderDailyHistory() {
    const panel = $("dailyHistoryPanel");
    if (daily.history.length === 0) {
      panel.innerHTML = `<p style="color:var(--text-dim);font-size:0.85rem;margin:8px 0;">尚無歷史紀錄</p>`;
      return;
    }
    panel.innerHTML = daily.history.slice().reverse().map((h, i) => {
      const dayNum = daily.history.length - i;
      const correctCount = Object.values(h.results).filter(Boolean).length;
      const total = h.ids.length;
      const scoreClass = h.done && correctCount === total ? "full" : "";
      const statusText = h.done ? `${correctCount} / ${total}` : "進行中";
      return `<div class="daily-history-row"><span>第 ${dayNum} 天・${h.date}</span><span class="dh-score ${scoreClass}">${statusText}</span></div>`;
    }).join("");
  }

  function renderHomeDailySummary() {
    if (allQuestions.length === 0 || !$("homeDailyStatus")) return;
    const today = todayStr();
    const todayEntry = daily.history.find((h) => h.date === today);
    const totalPool = allQuestions.length;
    const assigned = Math.min(daily.pointer, totalPool);
    $("homeDailyProgressFill").style.width = `${(assigned / totalPool) * 100}%`;

    const streak = computeStreak();
    $("homeDailyStreak").textContent = streak > 0 ? `🔥 連續 ${streak} 天・已排入 ${assigned}/${totalPool} 題` : `已排入 ${assigned}/${totalPool} 題`;

    if (todayEntry && todayEntry.done) {
      const correctCount = Object.values(todayEntry.results).filter(Boolean).length;
      $("homeDailyStatus").textContent = `今天已完成！答對 ${correctCount} / ${todayEntry.ids.length} 題。`;
    } else if (todayEntry) {
      $("homeDailyStatus").textContent = `今天的 ${todayEntry.ids.length} 題還沒做完，繼續加油！`;
    } else if (assigned >= totalPool) {
      $("homeDailyStatus").textContent = `🎉 題庫全部背完一輪了！`;
    } else {
      $("homeDailyStatus").textContent = `今天還沒開始背題。`;
    }
  }

  function startDailySession() {
    const entry = ensureTodayEntry();
    if (!entry) return;
    const queue = entry.ids.map((id) => allQuestions.find((q) => q.id === id)).filter(Boolean);
    if (queue.length === 0) return;
    startSession(queue, { isDaily: true, dayDate: entry.date });
  }

  function recordAnswer(id, correct) {
    const s = stats[id] || { attempts: 0, correctCount: 0, lastCorrect: false };
    s.attempts += 1;
    if (correct) s.correctCount += 1;
    s.lastCorrect = correct;
    stats[id] = s;
    saveStats();
  }

  // ---------- stats display ----------
  function computeGlobalStats() {
    const ids = Object.keys(stats);
    const attempted = ids.length;
    let totalAttempts = 0, totalCorrect = 0, wrong = 0;
    for (const id of ids) {
      totalAttempts += stats[id].attempts;
      totalCorrect += stats[id].correctCount;
      if (!stats[id].lastCorrect) wrong += 1;
    }
    const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null;
    return { attempted, accuracy, wrong, bookmarked: bookmarks.size };
  }

  function refreshStatsUI() {
    const g = computeGlobalStats();
    if ($("statAttempted")) $("statAttempted").textContent = g.attempted;
    if ($("statAccuracy")) $("statAccuracy").textContent = g.accuracy === null ? "–" : g.accuracy + "%";
    if ($("statWrong")) $("statWrong").textContent = g.wrong;
    if ($("statBookmark")) $("statBookmark").textContent = g.bookmarked;
    updateModeHint();
  }

  function getSelectedMode() {
    const el = document.querySelector('input[name="mode"]:checked');
    return el ? el.value : "random";
  }
  function getSelectedCount() {
    const v = document.querySelector('input[name="count"]:checked').value;
    return v === "all" ? Infinity : parseInt(v, 10);
  }

  function poolForMode(mode) {
    switch (mode) {
      case "wrong":
        return allQuestions.filter((q) => stats[q.id] && !stats[q.id].lastCorrect);
      case "bookmark":
        return allQuestions.filter((q) => bookmarks.has(String(q.id)) || bookmarks.has(q.id));
      case "unseen":
        return allQuestions.filter((q) => !stats[q.id]);
      case "sequential":
        return allQuestions.slice().sort((a, b) => a.id - b.id);
      default:
        return allQuestions;
    }
  }

  function updateModeHint() {
    if (!$("modeHint") || !$("startBtn")) return;
    const mode = getSelectedMode();
    const pool = poolForMode(mode);
    $("modeHint").textContent = `此模式目前可用題目：${pool.length} 題`;
    $("startBtn").disabled = pool.length === 0;
  }

  // ---------- session ----------
  function buildQueue(mode, count) {
    let pool = poolForMode(mode);
    if (mode === "sequential") {
      let startIdx = pool.findIndex((q) => !stats[q.id]);
      if (startIdx === -1) startIdx = 0;
      const n = Math.min(count, pool.length);
      const queue = [];
      for (let i = 0; i < n; i++) queue.push(pool[(startIdx + i) % pool.length]);
      return queue;
    }
    // shuffle copy
    const shuffled = pool.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  function startSession(queue, opts = {}) {
    session = {
      queue, index: 0, score: 0, missedIds: [], selected: new Set(), submitted: false,
      isDaily: !!opts.isDaily, dayDate: opts.dayDate || null,
    };
    showScreen("quizScreen");
    renderQuestion();
  }

  function currentQuestion() {
    return session.queue[session.index];
  }

  function renderQuestion() {
    const q = currentQuestion();
    session.selected = new Set();
    session.submitted = false;

    $("progressText").textContent = `第 ${session.index + 1} 題 / 共 ${session.queue.length} 題`;
    $("progressFill").style.width = `${(session.index / session.queue.length) * 100}%`;
    $("liveScore").textContent = session.score;

    $("qNumber").textContent = `題號 #${q.id}`;
    $("qText").textContent = q.question;
    $("qChooseHint").textContent = q.chooseN > 1 ? `請選擇 ${q.chooseN} 個答案` : "";

    const bookmarked = bookmarks.has(String(q.id));
    const bmBtn = $("bookmarkBtn");
    bmBtn.textContent = bookmarked ? "★" : "☆";
    bmBtn.classList.toggle("active", bookmarked);

    const letters = Object.keys(q.options).sort();
    const inputType = q.chooseN > 1 ? "checkbox" : "radio";
    const list = $("optionsList");
    list.innerHTML = letters.map((letter) => `
      <label class="option" data-letter="${letter}">
        <input type="${inputType}" name="opt" value="${letter}">
        <span class="opt-letter">${letter}.</span>
        <span class="opt-text">${escapeHtml(q.options[letter])}</span>
      </label>
    `).join("");

    list.querySelectorAll(".option").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (session.submitted) return;
        e.preventDefault();
        const input = el.querySelector("input");
        if (inputType === "radio") input.checked = true;
        else input.checked = !input.checked;
        onSelectionChange(inputType, letters);
      });
    });

    $("submitBtn").disabled = true;
    $("submitBtn").classList.remove("hidden");
    $("nextBtn").classList.add("hidden");
    $("feedback").classList.add("hidden");
    $("feedback").innerHTML = "";
  }

  function onSelectionChange(inputType, letters) {
    const list = $("optionsList");
    session.selected = new Set(
      [...list.querySelectorAll("input:checked")].map((i) => i.value)
    );
    letters.forEach((letter) => {
      list.querySelector(`.option[data-letter="${letter}"]`)
        .classList.toggle("selected", session.selected.has(letter));
    });
    $("submitBtn").disabled = session.selected.size === 0;
  }

  function submitAnswer() {
    const q = currentQuestion();
    session.submitted = true;
    const correctSet = new Set(q.correct);
    const isCorrect = correctSet.size === session.selected.size &&
      [...correctSet].every((l) => session.selected.has(l));

    if (isCorrect) session.score += 1;
    else session.missedIds.push(q.id);
    recordAnswer(q.id, isCorrect);

    document.querySelectorAll(".option").forEach((el) => {
      const letter = el.dataset.letter;
      const input = el.querySelector("input");
      input.disabled = true;
      el.classList.add("disabled");
      if (correctSet.has(letter)) el.classList.add("correct");
      else if (session.selected.has(letter)) el.classList.add("incorrect");
    });

    const fb = $("feedback");
    fb.classList.remove("hidden");
    fb.classList.toggle("correct", isCorrect);
    fb.classList.toggle("incorrect", !isCorrect);
    fb.innerHTML = isCorrect
      ? "✅ 答對了！"
      : `❌ 答錯了。正確答案：${[...correctSet].sort().join(", ")}`;

    $("submitBtn").classList.add("hidden");
    $("nextBtn").classList.remove("hidden");
    $("nextBtn").textContent = session.index + 1 >= session.queue.length ? "完成 →" : "下一題 →";
    $("liveScore").textContent = session.score;
    refreshStatsUI();
  }

  function nextQuestion() {
    session.index += 1;
    if (session.index >= session.queue.length) {
      finishSession();
    } else {
      renderQuestion();
    }
  }

  function finishSession() {
    $("progressFill").style.width = "100%";
    const total = session.queue.length;
    const score = session.score;
    const pct = Math.round((score / total) * 100);
    $("resultScore").textContent = `${score} / ${total}（${pct}%）`;
    $("resultBarFill").style.width = `${pct}%`;

    const missedList = $("missedList");
    if (session.missedIds.length > 0) {
      const items = session.missedIds.map((id) => {
        const q = allQuestions.find((x) => x.id === id);
        const preview = q.question.length > 70 ? q.question.slice(0, 70) + "…" : q.question;
        return `<div class="missed-item"><span>#${id}</span><span>${escapeHtml(preview)}</span></div>`;
      }).join("");
      missedList.innerHTML = `<h3>答錯的題目（${session.missedIds.length} 題）</h3>${items}`;
      $("reviewMissedBtn").classList.remove("hidden");
    } else {
      missedList.innerHTML = `<p style="text-align:center;color:var(--green);font-weight:600;">🎉 全部答對！</p>`;
      $("reviewMissedBtn").classList.add("hidden");
    }

    if (session.isDaily && session.dayDate) {
      const entry = daily.history.find((h) => h.date === session.dayDate);
      if (entry) {
        const results = {};
        entry.ids.forEach((id) => { results[id] = !session.missedIds.includes(id); });
        entry.results = results;
        entry.done = true;
        saveDaily();
      }
    }

    showScreen("resultScreen");
    refreshAll();
  }

  function toggleBookmark() {
    const q = currentQuestion();
    const key = String(q.id);
    if (bookmarks.has(key)) bookmarks.delete(key);
    else bookmarks.add(key);
    saveBookmarks();
    const bmBtn = $("bookmarkBtn");
    const active = bookmarks.has(key);
    bmBtn.textContent = active ? "★" : "☆";
    bmBtn.classList.toggle("active", active);
    refreshStatsUI();
  }

  function showScreen(id) {
    ["startScreen", "quizScreen", "resultScreen"].forEach((s) => {
      if ($(s)) $(s).classList.toggle("hidden", s !== id);
    });
    window.scrollTo(0, 0);
  }

  function refreshAll() {
    refreshStatsUI();
    refreshDailyUI();
    renderHomeDailySummary();
  }

  // ---------- init ----------
  function attachEvents() {
    document.querySelectorAll('input[name="mode"]').forEach((el) =>
      el.addEventListener("change", updateModeHint)
    );
    on("startBtn", "click", () => {
      const mode = getSelectedMode();
      const count = getSelectedCount();
      const queue = buildQueue(mode, count);
      if (queue.length === 0) return;
      startSession(queue);
    });
    on("submitBtn", "click", submitAnswer);
    on("nextBtn", "click", nextQuestion);
    on("bookmarkBtn", "click", toggleBookmark);
    on("quitBtn", "click", () => {
      showScreen("startScreen");
      refreshAll();
    });
    on("backHomeBtn", "click", () => {
      showScreen("startScreen");
      refreshAll();
    });
    on("dailyStartBtn", "click", startDailySession);
    on("dailyResetBtn", "click", () => {
      if (!confirm("確定要重設每日背題進度與歷史紀錄嗎？（不會影響練習正確率統計）")) return;
      localStorage.removeItem(DAILY_KEY);
      loadDaily();
      refreshDailyUI();
    });
    on("dailyHistoryToggle", "click", () => {
      const panel = $("dailyHistoryPanel");
      const nowHidden = panel.classList.toggle("hidden");
      $("dailyHistoryToggle").textContent = nowHidden ? "查看歷史紀錄" : "隱藏歷史紀錄";
    });
    on("reviewMissedBtn", "click", () => {
      const queue = session.missedIds.map((id) => allQuestions.find((x) => x.id === id));
      startSession(queue);
    });
    on("resetStatsBtn", "click", () => {
      if (!confirm("確定要清除練習正確率紀錄與標記嗎？（不會影響每日背題進度）此動作無法復原。")) return;
      localStorage.removeItem(STATS_KEY);
      localStorage.removeItem(BOOKMARK_KEY);
      loadStats();
      loadBookmarks();
      refreshStatsUI();
    });
  }

  async function init() {
    loadStats();
    loadBookmarks();
    loadDaily();
    attachEvents();
    try {
      const res = await fetch("data/questions.json");
      allQuestions = await res.json();
      allQuestions.sort((a, b) => a.id - b.id);
      if ($("totalCount")) $("totalCount").textContent = allQuestions.length;
      refreshAll();
    } catch (err) {
      if ($("totalCount")) $("totalCount").textContent = "載入失敗";
      console.error(err);
    }
  }

  init();
})();
