(() => {
  "use strict";

  const STATS_KEY = "saa_stats_v1";
  const BOOKMARK_KEY = "saa_bookmarks_v1";

  let allQuestions = [];
  let stats = {};       // id -> {attempts, correctCount, lastCorrect}
  let bookmarks = new Set();

  let session = null;   // {queue, index, score, missedIds, selected, submitted}

  const $ = (id) => document.getElementById(id);

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
    $("statAttempted").textContent = g.attempted;
    $("statAccuracy").textContent = g.accuracy === null ? "–" : g.accuracy + "%";
    $("statWrong").textContent = g.wrong;
    $("statBookmark").textContent = g.bookmarked;
    $("globalStats").textContent = g.attempted > 0
      ? `已作答 ${g.attempted} 題・正確率 ${g.accuracy}%`
      : "";
    updateModeHint();
  }

  function getSelectedMode() {
    return document.querySelector('input[name="mode"]:checked').value;
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
    const mode = getSelectedMode();
    const pool = poolForMode(mode);
    const labels = {
      random: "隨機出題", sequential: "依題號順序", wrong: "只練錯過的題目",
      bookmark: "只練標記的題目", unseen: "只練沒做過的題目"
    };
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

  function startSession(queue) {
    session = { queue, index: 0, score: 0, missedIds: [], selected: new Set(), submitted: false };
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

    showScreen("resultScreen");
    refreshStatsUI();
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
      $(s).classList.toggle("hidden", s !== id);
    });
    window.scrollTo(0, 0);
  }

  // ---------- init ----------
  function attachEvents() {
    document.querySelectorAll('input[name="mode"]').forEach((el) =>
      el.addEventListener("change", updateModeHint)
    );
    $("startBtn").addEventListener("click", () => {
      const mode = getSelectedMode();
      const count = getSelectedCount();
      const queue = buildQueue(mode, count);
      if (queue.length === 0) return;
      startSession(queue);
    });
    $("submitBtn").addEventListener("click", submitAnswer);
    $("nextBtn").addEventListener("click", nextQuestion);
    $("bookmarkBtn").addEventListener("click", toggleBookmark);
    $("quitBtn").addEventListener("click", () => {
      showScreen("startScreen");
      refreshStatsUI();
    });
    $("backHomeBtn").addEventListener("click", () => {
      showScreen("startScreen");
      refreshStatsUI();
    });
    $("reviewMissedBtn").addEventListener("click", () => {
      const queue = session.missedIds.map((id) => allQuestions.find((x) => x.id === id));
      startSession(queue);
    });
    $("resetStatsBtn").addEventListener("click", () => {
      if (!confirm("確定要清除所有練習紀錄與標記嗎？此動作無法復原。")) return;
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
    attachEvents();
    try {
      const res = await fetch("data/questions.json");
      allQuestions = await res.json();
      $("totalCount").textContent = allQuestions.length;
      refreshStatsUI();
    } catch (err) {
      $("totalCount").textContent = "載入失敗";
      console.error(err);
    }
  }

  init();
})();
