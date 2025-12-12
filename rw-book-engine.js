/* rw-book-engine.js
   Ravenwood Book Engine (clean + reusable for Book I / Book II / …)

   ✅ Fixes:
   - Supports page.body as string OR function(state)
   - No duplicate echoes
   - System messages do NOT "flash" away on book pages (no auto-hide by default)
   - Rolls + success/fail flags
   - Safe navigation (missing page shows system message instead of breaking)
   - Progress persistence: Supabase (if available) + localStorage fallback

   ✅ Echo improvements (requested):
   - Echo shows the *choice text* (not p5_forward, etc.)
   - Default echo renderer + CSS class hooks
   - Optional "Manor mood" line if available (window.rwManorAttitude or flags.__attitudeScore)

   Expected globals (optional):
     window.supabaseClient   (from app.js)
     window.rwEmail          (player email) OR localStorage.ravenwoodEmail
     window.rollCheck(check) (optional; else engine provides fallback d20)
*/

(function () {
  "use strict";

  // ---------- tiny utils ----------
  function $(sel) { return document.querySelector(sel); }
  function toStr(v) { return (v == null) ? "" : String(v); }
  function safeJsonParse(raw, fallback) { try { return JSON.parse(raw); } catch { return fallback; } }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function getEmail() {
    return window.rwEmail || localStorage.getItem("ravenwoodEmail") || "";
  }

  // ---------- default roll (d20) ----------
  function defaultRollCheck(check) {
    const statKey = check?.stat || check?.key || "insight";
    const dc = Number(check?.dc ?? check?.target ?? 12);
    const d20 = 1 + Math.floor(Math.random() * 20);

    // If your stats are raw ability scores (8-18), mod should be derived.
    // If they're already modifiers, this still works (it just uses them as-is).
    const stats = window.rwStats || window.rwCharacterStats || {};
    const raw = Number(stats?.[statKey] ?? 0);

    // Heuristic: if score looks like an ability score (>=6), convert to mod; else treat as mod.
    const mod = raw >= 6 ? Math.floor((raw - 10) / 2) : raw;

    const total = d20 + mod;
    const success = total >= dc;

    return { stat: statKey, dc, d20, mod, total, success };
  }

  // ---------- default echo renderer ----------
  function defaultEchoHtml(state) {
    const last = state?.lastChoice || null;
    if (!last || !last.text) return "";

    const safeText = toStr(last.text);

    // Optional manor mood (if you provide it)
    let manorLine = "";
    if (typeof window.rwManorAttitude === "string" && window.rwManorAttitude.trim()) {
      manorLine = `<div class="rw-echo-manor">The manor feels <strong>${toStr(window.rwManorAttitude)}</strong>.</div>`;
    } else {
      // If you store attitude score in flags.__attitudeScore, we can label it
      const s = Number(state?.flags?.__attitudeScore);
      if (Number.isFinite(s)) {
        const label = s >= 2 ? "welcoming" : (s <= -2 ? "wary" : "watchful");
        manorLine = `<div class="rw-echo-manor">The manor feels <strong>${label}</strong>.</div>`;
      }
    }

    const roll = last.roll;
    const rollLine = roll && typeof roll === "object"
      ? `<div class="rw-echo-roll">
           <span class="rw-echo-roll-label">${toStr(roll.stat || "check")}</span>
           <span class="rw-echo-roll-pill ${roll.success ? "is-success" : "is-fail"}">
             ${roll.success ? "Success" : "Fail"} · ${toStr(roll.total ?? "")}${roll.dc != null ? ` vs DC ${toStr(roll.dc)}` : ""}
           </span>
         </div>`
      : "";

    return `
      <div class="rw-choice-echo" role="note" aria-label="Echo of your last choice">
        <div class="rw-echo-title">Echo</div>
        <div class="rw-echo-choice"><strong>You chose:</strong> ${safeText}</div>
        ${rollLine}
        ${manorLine}
      </div>
    `;
  }

  // ---------- engine factory ----------
  function createBookEngine(opts) {
    const options = opts || {};
    const pages = options.pages || {};
    const startPageId = toStr(options.startPageId || "1");

    const dom = {
      meta: options.metaEl ? $(options.metaEl) : $("#rwBookPageMeta"),
      title: options.titleEl ? $(options.titleEl) : $("#rwBookPageTitle"),
      body: options.bodyEl ? $(options.bodyEl) : $("#rwBookPageBody"),
      choices: options.choicesEl ? $(options.choicesEl) : $("#rwBookChoices"),
      sys: options.systemEl ? $(options.systemEl) : $("#rwBookSystemMessage"),
      image: options.imageEl ? $(options.imageEl) : $("#rwBookImage"),
      imageFallback: options.imageFallbackEl ? $(options.imageFallbackEl) : $("#rwBookImageFallback"),
    };

    const progress = {
      column: toStr(options.progressColumn || "book1_progress"),
      localKey: toStr(options.localStorageKey || "rwBook1Progress"),
      stateLocalKey: toStr(options.stateLocalStorageKey || ""),
      saveFullState: !!options.saveFullState,
    };

    const hooks = {
      // If you don’t provide a hook, we render a clean default echo using choice.text
      buildEchoHtml: (typeof options.buildEchoHtml === "function") ? options.buildEchoHtml : null,
      onBeforeRender: (typeof options.onBeforeRender === "function") ? options.onBeforeRender : null,
      onAfterRender: (typeof options.onAfterRender === "function") ? options.onAfterRender : null,
      onChoice: (typeof options.onChoice === "function") ? options.onChoice : null,
      onNavigate: (typeof options.onNavigate === "function") ? options.onNavigate : null,
      applyBranches: (typeof options.applyBranches === "function") ? options.applyBranches : null,
    };

    const state = options.state || {
      currentPageId: startPageId,
      flags: {},
      lastChoiceKey: null,
      lastRoll: null,

      // ✅ new fields for echo
      lastChoice: null,        // { key, text, from, to, roll, at }
      echoes: [],              // optional history (not required, but handy)
    };

    if (options.exposeState !== false) window.BOOK_STATE = state;

    // ---------- system message ----------
    function showSystemMessage(msg) {
      if (!dom.sys) return;
      const text = toStr(msg).trim();
      if (!text) {
        dom.sys.textContent = "";
        dom.sys.classList.add("d-none");
        return;
      }
      dom.sys.textContent = text;
      dom.sys.classList.remove("d-none");

      // Book pages should NOT auto-hide (prevents gold "flash" bug).
      const ms = Number(options.autoHideSystemMs || 0);
      if (ms > 0) {
        window.clearTimeout(showSystemMessage._t);
        showSystemMessage._t = window.setTimeout(() => {
          if (!dom.sys) return;
          dom.sys.classList.add("d-none");
        }, ms);
      }
    }

    // ---------- image ----------
    function setPageImage(src) {
      const url = toStr(src).trim();
      if (!dom.image) return;

      if (!url) {
        dom.image.style.display = "none";
        if (dom.imageFallback) dom.imageFallback.style.display = "block";
        return;
      }

      dom.image.src = url;
      dom.image.style.display = "block";
      if (dom.imageFallback) dom.imageFallback.style.display = "none";

      dom.image.onerror = () => {
        dom.image.style.display = "none";
        if (dom.imageFallback) dom.imageFallback.style.display = "block";
      };
    }

    // ---------- persistence ----------
    async function saveProgress(pageId) {
      const pid = toStr(pageId || state.currentPageId || startPageId);

      try { localStorage.setItem(progress.localKey, pid); } catch {}

      if (progress.saveFullState && progress.stateLocalKey) {
        try { localStorage.setItem(progress.stateLocalKey, JSON.stringify(state)); } catch {}
      }

      const sb = window.supabaseClient || null;
      const email = getEmail();
      if (!sb || !email) return;

      try {
        const patch = {};
        patch[progress.column] = pid;

        if (progress.saveFullState && options.stateColumn) {
          patch[options.stateColumn] = state; // requires jsonb column
        }

        const { error } = await sb
          .from("data")
          .update(patch)
          .eq("email", email);

        if (error) throw error;
      } catch (e) {
        console.warn("saveProgress failed:", e);
      }
    }

    async function loadProgress() {
      const sb = window.supabaseClient || null;
      const email = getEmail();

      if (sb && email) {
        try {
          const { data, error } = await sb
            .from("data")
            .select(progress.column)
            .eq("email", email)
            .maybeSingle();

          if (!error && data && data[progress.column]) {
            const pid = toStr(data[progress.column]);
            try { localStorage.setItem(progress.localKey, pid); } catch {}
            return pid;
          }
        } catch (e) {
          console.warn("loadProgress failed:", e);
        }
      }

      try {
        const raw = localStorage.getItem(progress.localKey);
        return raw ? toStr(raw) : null;
      } catch {
        return null;
      }
    }

    // ---------- choice rendering ----------
    function renderChoices(page) {
      if (!dom.choices) return;
      dom.choices.innerHTML = "";

      const choices = Array.isArray(page?.choices) ? page.choices : [];
      if (!choices.length) return;

      choices.forEach((c) => {
        const btn = document.createElement("button");
        btn.className = options.choiceButtonClass || "btn btn-outline-light";
        btn.type = "button";
        btn.textContent = c?.text || "Continue";

        btn.addEventListener("click", async () => {
          await resolveChoice(c);
        });

        dom.choices.appendChild(btn);
      });
    }

    // ---------- choice resolution ----------
    function applyChoiceFlags(choice, roll) {
      state.flags = state.flags || {};
      if (choice?.key) state.flags[choice.key] = true;

      if (roll && (choice?.key || choice?.check?.flagKey)) {
        const k = choice.key || choice.check.flagKey;
        state.flags[`${k}_${roll.success ? "success" : "fail"}`] = true;
      }
    }

    function applyChoiceDeltas(choice) {
      if (typeof options.applyDeltas === "function") {
        options.applyDeltas(choice, state);
      }
    }

    function resolveDestination(choice, roll) {
      if (toStr(choice?.to).toUpperCase() === "END") return "END";

      if (choice?.to && typeof choice.to === "object") {
        const s = !!roll?.success;
        return toStr(s ? (choice.to.success || choice.to.ok) : (choice.to.fail || choice.to.no));
      }

      if (roll && (choice?.toSuccess || choice?.toFail)) {
        return toStr(roll.success ? choice.toSuccess : choice.toFail);
      }

      return toStr(choice?.to || "");
    }

    function rememberChoice(choice, roll, dest) {
      const entry = {
        key: choice?.key || null,
        text: choice?.text || choice?.label || null,
        from: state.currentPageId || null,
        to: dest || null,
        roll: roll || null,
        at: new Date().toISOString(),
      };

      state.lastChoice = entry;
      // keep small history for debugging / future features
      state.echoes = Array.isArray(state.echoes) ? state.echoes : [];
      state.echoes.push(entry);
      const max = clamp(Number(options.maxEchoHistory || 20), 0, 100);
      if (state.echoes.length > max) state.echoes.splice(0, state.echoes.length - max);
    }

    async function resolveChoice(choice) {
      if (!choice) return;

      state.lastChoiceKey = choice.key || null;

      let roll = null;
      if (choice.check) {
        const roller = (typeof window.rollCheck === "function") ? window.rollCheck : null;

// Normalize various rollCheck implementations:
// - Engine defaultRollCheck(checkObj) -> { stat, dc, d20, mod, total, success }
// - app.js rollCheck(stat, difficulty) -> { roll, bonus, total, result: "strong"|"partial"|"fail" }
if (roller) {
  let res = null;

  // If the function looks like it expects (stat, dc), call it that way.
  try {
    if (roller.length >= 2) res = roller(choice.check?.stat || choice.check?.key, Number(choice.check?.dc ?? choice.check?.target ?? 12));
    else res = roller(choice.check);
  } catch (e) {
    console.warn("rollCheck threw; falling back to engine roll:", e);
    res = null;
  }

  if (res && typeof res === "object") {
    // Convert {result:"strong"/"partial"/"fail"} into boolean success
    if (typeof res.success !== "boolean") {
      if (typeof res.result === "string") res.success = (res.result.toLowerCase() !== "fail");
      else if (typeof res.passed === "boolean") res.success = res.passed;
      else res.success = false;
    }

    // Ensure fields the engine uses exist
    if (!("stat" in res)) res.stat = choice.check?.stat || choice.check?.key || res.stat || "insight";
    if (!("dc" in res)) res.dc = Number(choice.check?.dc ?? choice.check?.target ?? 12);

    // If app.js uses {roll, bonus} rename-friendly fields for echo
    if (!("d20" in res) && "roll" in res) res.d20 = res.roll;
    if (!("mod" in res) && "bonus" in res) res.mod = res.bonus;

    roll = res;
  } else {
    roll = defaultRollCheck(choice.check);
  }
} else {
  roll = defaultRollCheck(choice.check);
}
        state.lastRoll = roll;
      }

      applyChoiceFlags(choice, roll);
      applyChoiceDeltas(choice);

      const dest = resolveDestination(choice, roll);
      rememberChoice(choice, roll, dest);

      if (typeof hooks.onChoice === "function") {
        try { hooks.onChoice(choice, roll, state); } catch {}
      }

      if (dest === "END") {
        window.location.href = options.endHref || "ravenwood.html";
        return;
      }

      if (!dest) {
        showSystemMessage("That path has no destination (yet).");
        return;
      }

      await goToPage(dest);
    }

    // ---------- render ----------
    function buildEcho(pageId) {
      if (hooks.buildEchoHtml) {
        try { return toStr(hooks.buildEchoHtml(state, pageId) || ""); } catch { return ""; }
      }
      return defaultEchoHtml(state);
    }

    function renderPage(pageId) {
      const pid = toStr(pageId || startPageId);
      const page = pages[pid];

      if (!page) {
        showSystemMessage(`That page isn’t written yet (${pid}).`);
        return;
      }

      state.currentPageId = pid;

      if (typeof hooks.onBeforeRender === "function") {
        try { hooks.onBeforeRender(pid, page, state); } catch {}
      }

      if (dom.meta) {
        const n = pid.split("_")[0];
        dom.meta.textContent = `Page ${n}`;
      }

      if (dom.title) dom.title.textContent = toStr(page.title);

      const bodyHtml = (typeof page.body === "function") ? toStr(page.body(state)) : toStr(page.body);
      const echoHtml = buildEcho(pid);

      if (dom.body) dom.body.innerHTML = echoHtml + bodyHtml;

      setPageImage(page.image || "");
      showSystemMessage(page.systemMessage || "");

      renderChoices(page);

      if (typeof hooks.applyBranches === "function") {
        try { hooks.applyBranches(state, pid, page); } catch {}
      }

      if (typeof hooks.onAfterRender === "function") {
        try { hooks.onAfterRender(pid, page, state); } catch {}
      }

      if (typeof hooks.onNavigate === "function") {
        try { hooks.onNavigate(pid, page, state); } catch {}
      }
    }

    // ---------- navigation ----------
    async function goToPage(pageId) {
      const pid = toStr(pageId || startPageId);
      await saveProgress(pid);
      renderPage(pid);
    }

    // ---------- public api ----------
    async function start() {
      if (progress.saveFullState && progress.stateLocalKey) {
        try {
          const raw = localStorage.getItem(progress.stateLocalKey);
          const restored = safeJsonParse(raw, null);
          if (restored && typeof restored === "object") {
            Object.assign(state, restored);
          }
        } catch {}
      }

      const saved = await loadProgress();
      const first = (saved && pages[saved]) ? saved : (pages[startPageId] ? startPageId : Object.keys(pages)[0] || "1");
      await goToPage(first);
    }

    return {
      state,
      start,
      renderPage,
      goToPage,
      showSystemMessage,
      saveProgress,
      loadProgress,
    };
  }

  window.RWBookEngine = { create: createBookEngine };
})();
