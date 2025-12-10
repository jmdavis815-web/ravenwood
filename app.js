// app.js — Ravenwood + Supabase Auth (email/password) + character profile

// ---------- SUPABASE CONFIG ----------
const SUPABASE_URL = "https://podzqfefcvbadczxijje.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvZHpxZmVmY3ZiYWRjenhpamplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMzE5NzQsImV4cCI6MjA4MDgwNzk3NH0._E9pmrdATTl4djSUuv-E9vXRajUTKx91riHcxElI_ZU";

// Create Supabase client (global from the CDN script)
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// LocalStorage keys
const RAVENWOOD_EMAIL_KEY = "ravenwoodEmail";
const RAVENWOOD_SECRETS_KEY = "ravenwoodTownSecrets";
const DEFAULT_AVATAR = "f-mystic";
const RAVENWOOD_INVENTORY_KEY = "ravenwoodInventory";
const RAVENWOOD_LOCATION_KEY = "ravenwoodLocation";

// DEV NOTE:
// If you want to fully clear local dev saves ONCE, you can run
// localStorage.removeItem(...) manually in the console.
// We *won't* auto-wipe on every load so Supabase progress can stick.
// -----------------------------------------------------------
// try {
//   localStorage.removeItem(RAVENWOOD_SECRETS_KEY);
//   localStorage.removeItem(RAVENWOOD_INVENTORY_KEY);
//   localStorage.removeItem(RAVENWOOD_LOCATION_KEY);
// } catch (e) {
//   console.warn("Couldn't clear local dev storage:", e);
// }

// ---------- ONLINE PROGRESS HELPERS (Supabase) ----------

async function syncSecretsToSupabase(secrets) {
  const email = window.rwEmail;
  if (!email) return;
  try {
    const { error } = await supabaseClient
      .from("data")
      .update({ secrets })
      .eq("email", email);

    if (error) {
      console.error("Failed to sync secrets:", error);
    } else {
      // also cache locally (new saves only, not old)
      saveSecrets(secrets);
    }
  } catch (err) {
    console.error("Unexpected secrets sync error:", err);
  }
}

async function syncInventoryToSupabase(inventory) {
  const email = window.rwEmail;
  if (!email) return;
  try {
    const { error } = await supabaseClient
      .from("data")
      .update({ inventory })
      .eq("email", email);

    if (error) {
      console.error("Failed to sync inventory:", error);
    } else {
      // also cache locally (new saves only, not old)
      saveInventory(inventory);
    }
  } catch (err) {
    console.error("Unexpected inventory sync error:", err);
  }
}

// ---------- COIN HELPERS ----------

function updateCoinDisplay() {
  const el = document.getElementById("rwCoinsAmount");
  if (!el) return;
  el.textContent = window.rwCoins ?? 0;
}

async function syncCoinsToSupabase() {
  const email = window.rwEmail;
  if (!email) return;
  try {
    const { error } = await supabaseClient
      .from("data")
      .update({ coins: window.rwCoins ?? 0 })
      .eq("email", email);

    if (error) {
      console.error("Failed to sync coins:", error);
    }
  } catch (err) {
    console.error("Unexpected coins sync error:", err);
  }
}

async function addCoins(amount) {
  const delta = Number(amount) || 0;
  window.rwCoins = (window.rwCoins || 0) + delta;
  if (window.rwCoins < 0) window.rwCoins = 0;

  updateCoinDisplay();
  await syncCoinsToSupabase();
}

// Make coin helpers accessible if needed elsewhere
window.rwAddCoins = addCoins;

// ---------- JOURNAL HELPERS ----------

// in-memory journal entries for this session
window.rwJournalEntries = window.rwJournalEntries || [];
window.rwJournalIndex = window.rwJournalIndex || 0;

function makeJournalDateLabel(isoString) {
  try {
    const d = isoString ? new Date(isoString) : new Date();
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString || "";
  }
}

function normalizeJournalEntries(raw) {
  if (!Array.isArray(raw)) return [];

  return raw.map((e, idx) => {
    // Legacy entries saved as plain strings
    if (typeof e === "string") {
      return {
        id: `legacy_${idx}`,
        created_at: null,
        source: "system",
        location: null,
        text: e,
        dateLabel: makeJournalDateLabel(), // use "now" as label
      };
    }

    // Already objects, but be defensive
    const text =
      typeof e.text === "string"
        ? e.text
        : typeof e.body === "string"
        ? e.body
        : "";

    const dateLabel =
      e.dateLabel || makeJournalDateLabel(e.created_at || e.date || null);

    return {
      id: e.id || `entry_${idx}`,
      created_at: e.created_at || null,
      source: e.source || null,
      location: e.location || null,
      text,
      dateLabel,
    };
  });
}

async function syncJournalToSupabase() {
  const email = window.rwEmail;
  if (!email) return;

  const entries = Array.isArray(window.rwJournalEntries)
    ? window.rwJournalEntries
    : [];

  try {
    const { error } = await supabaseClient
      .from("data")
      .update({ journal_entries: entries })
      .eq("email", email);

    if (error) {
      console.error("Failed to sync journal:", error);
    }
  } catch (err) {
    console.error("Unexpected journal sync error:", err);
  }
}

function renderJournal() {
  const bodyEl = document.getElementById("rwJournalBody");
  const dateEl = document.getElementById("rwJournalDate");
  const pageEl = document.getElementById("rwJournalPageIndicator");

  const entries = Array.isArray(window.rwJournalEntries)
    ? window.rwJournalEntries
    : [];

  if (!entries.length) {
    if (bodyEl) {
      bodyEl.textContent =
        "No entries yet. Your journal will begin writing itself the first time the town truly notices you.";
    }
    if (dateEl) dateEl.textContent = "";
    if (pageEl) pageEl.textContent = "Page 0 / 0";
    return;
  }

  const idxRaw = window.rwJournalIndex ?? 0;
  const idx = Math.min(Math.max(idxRaw, 0), entries.length - 1);
  window.rwJournalIndex = idx;

  const rawEntry = entries[idx];
const entry =
  typeof rawEntry === "string"
    ? { text: rawEntry, dateLabel: "" }
    : rawEntry || { text: "", dateLabel: "" };

if (bodyEl) {
  const text = entry.text || "";
  const formatted = text
    .split("\n")
    .map((line) => `<p>${line}</p>`)
    .join("");
  bodyEl.innerHTML = formatted;
}

if (dateEl) dateEl.textContent = entry.dateLabel || "";
  if (pageEl) pageEl.textContent = `Page ${idx + 1} / ${entries.length}`;
}

async function addJournalEntry(text, meta = {}) {
  if (!text) return;

  const entries = Array.isArray(window.rwJournalEntries)
    ? window.rwJournalEntries
    : [];

  const nowIso = new Date().toISOString();

  const entry = {
    id: meta.id || `j_${nowIso}`,
    created_at: nowIso,
    source: meta.source || null,
    location: meta.location || null,
    text,
    dateLabel: makeJournalDateLabel(nowIso),
  };

  entries.push(entry);
  window.rwJournalEntries = entries;
  window.rwJournalIndex = entries.length - 1;

  renderJournal();
  await syncJournalToSupabase();
}

// expose for quests / notices etc.
window.rwAddJournalEntry = addJournalEntry;

// ---------- SECRETS STORAGE ----------
function loadSecrets() {
  try {
    const raw = JSON.parse(localStorage.getItem(RAVENWOOD_SECRETS_KEY));
    if (!Array.isArray(raw)) return [];
    // Backwards-compatible: allow old string-only arrays
    return raw.map((item) =>
      typeof item === "string" ? { key: null, text: item } : item
    );
  } catch {
    return [];
  }
}

function saveSecrets(secrets) {
  try {
    localStorage.setItem(RAVENWOOD_SECRETS_KEY, JSON.stringify(secrets));
  } catch {
    // ignore storage errors
  }
}

// ---------- INVENTORY HELPERS ----------

function loadInventory() {
  try {
    const raw = localStorage.getItem(RAVENWOOD_INVENTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("Failed to load inventory from localStorage:", e);
    return [];
  }
}

function saveInventory(items) {
  try {
    localStorage.setItem(RAVENWOOD_INVENTORY_KEY, JSON.stringify(items || []));
  } catch (e) {
    console.warn("Failed to save inventory to localStorage:", e);
  }
}

// ---------- ITEM METADATA + CLICK MENU ----------

const ITEM_METADATA = {
  old_talisman: {
    title: "Old Talisman",
    description:
      "A bronze talisman etched with a Triquetra. It remembers old wards and answers doors that have forgotten how to open.",
  },
  // Add more items here as you introduce them.
};

function getItemMetadata(item) {
  if (!item) return null;
  const base = ITEM_METADATA[item.id] || {};
  return {
    id: item.id,
    title: base.title || item.name || "Unknown Item",
    description:
      base.description ||
      "You’re not sure what this does yet. Maybe someone in Ravenwood knows.",
    icon: item.icon || base.icon || "",
  };
}

let rwItemMenuModalInstance = null;
let rwItemDescModalInstance = null;
let rwItemMenuContext = null;

function ensureItemMenuModal() {
  let el = document.getElementById("rwItemMenuModal");
  if (el) return el;

  el = document.createElement("div");
  el.id = "rwItemMenuModal";
  el.className = "modal fade";
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-sm">
      <div class="modal-content rw-card">
        <div class="modal-header py-2">
          <h5 class="modal-title" id="rwItemMenuTitle">Item</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body py-3">
          <button type="button" class="btn rw-btn-main w-100 mb-2" id="rwItemMenuUseBtn">Use</button>
          <button type="button" class="btn btn-outline-light w-100" id="rwItemMenuDescBtn">Description</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function ensureItemDescModal() {
  let el = document.getElementById("rwItemDescriptionModal");
  if (el) return el;

  el = document.createElement("div");
  el.id = "rwItemDescriptionModal";
  el.className = "modal fade";
  el.tabIndex = -1;
  el.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content rw-card">
        <div class="modal-header py-2">
          <h5 class="modal-title" id="rwItemDescTitle">Item</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="text-center mb-3">
            <img id="rwItemDescImage"
                 src=""
                 alt=""
                 class="img-fluid rounded shadow-sm"
                 style="max-height:160px;object-fit:contain;">
          </div>
          <p id="rwItemDescBody" class="rw-body mb-0 small"></p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function showItemDescription(item) {
  const meta = getItemMetadata(item);
  const el = ensureItemDescModal();
  const titleEl = el.querySelector("#rwItemDescTitle");
  const imgEl = el.querySelector("#rwItemDescImage");
  const bodyEl = el.querySelector("#rwItemDescBody");

  if (titleEl) titleEl.textContent = meta.title;

  if (imgEl) {
    if (meta.icon) {
      imgEl.src = meta.icon;
      imgEl.alt = meta.title;
      imgEl.style.display = "";
    } else {
      imgEl.style.display = "none";
    }
  }

  if (bodyEl) bodyEl.textContent = meta.description;

  if (window.bootstrap && window.bootstrap.Modal) {
    rwItemDescModalInstance =
      rwItemDescModalInstance || new bootstrap.Modal(el);
    rwItemDescModalInstance.show();
  } else {
    // Fallback if Bootstrap fails
    alert(meta.title + "\n\n" + meta.description);
  }
}

// Decide what "Use" does based on context
function handleItemUse(item, context) {
  const ctx = context || {};

  // In the book, delegate to the book engine handler
  if (ctx.origin === "book" && typeof window.rwBookHandleItemUse === "function") {
    window.rwBookHandleItemUse(item);
    return;
  }

  // Default: nothing to use it on
  alert("Nothing happens.");
}

// Open the small menu for an item
function openItemMenu(item, context) {
  const meta = getItemMetadata(item);
  rwItemMenuContext = { item, context };

  const el = ensureItemMenuModal();
  const titleEl = el.querySelector("#rwItemMenuTitle");
  if (titleEl) titleEl.textContent = meta.title;

  const useBtn = el.querySelector("#rwItemMenuUseBtn");
  const descBtn = el.querySelector("#rwItemMenuDescBtn");

  if (useBtn) {
    useBtn.onclick = () => {
      if (rwItemMenuContext) {
        handleItemUse(rwItemMenuContext.item, rwItemMenuContext.context);
      }
      if (rwItemMenuModalInstance) rwItemMenuModalInstance.hide();
    };
  }

  if (descBtn) {
    descBtn.onclick = () => {
      if (rwItemMenuContext) {
        showItemDescription(rwItemMenuContext.item);
      }
    };
  }

  if (window.bootstrap && window.bootstrap.Modal) {
    rwItemMenuModalInstance =
      rwItemMenuModalInstance || new bootstrap.Modal(el);
    rwItemMenuModalInstance.show();
  } else {
    // Fallback if Bootstrap isn't available for some reason
    const choice = window.prompt(
      meta.title +
        "\n\nType 'use' to use it, or anything else for description:"
    );
    if (choice && choice.toLowerCase().startsWith("u")) {
      handleItemUse(item, context);
    } else {
      showItemDescription(item);
    }
  }
}

// Expose globally so book-1 and other pages can call it
window.rwOpenItemMenu = openItemMenu;

// Draw the inventory inside #rwInventoryGrid
function renderInventory(items = [], highlightItemId = null) {
  const grid = document.getElementById("rwInventoryGrid");
  if (!grid) return;

  const maxSlots = 16; // 4×4 grid
  grid.innerHTML = "";

    const safeItems = (Array.isArray(items) ? items : []).filter(
    (item) => !item || item.id !== "coins"
  );

  safeItems.forEach((item) => {
    const slot = document.createElement("div");
    slot.className = "rw-inventory-slot";

    if (highlightItemId && item && item.id === highlightItemId) {
      slot.classList.add("rw-inventory-slot--highlight");
    }

    if (item && item.icon) {
      const img = document.createElement("img");
      img.src = item.icon;
      img.alt = item.name || "Item";
      img.className = "rw-inventory-item-icon";
      slot.appendChild(img);

      // 🔹 NEW: click to open Use / Description menu
      if (window.rwOpenItemMenu) {
        img.addEventListener("click", () =>
          window.rwOpenItemMenu(item, { origin: "world" })
        );
      }
    }

    if (item && item.quantity && item.quantity > 1) {
      const badge = document.createElement("span");
      badge.className = "rw-inventory-qty";
      badge.textContent = item.quantity;
      slot.appendChild(badge);
    }

    grid.appendChild(slot);
  });

  // Fill remaining empty slots
  for (let i = safeItems.length; i < maxSlots; i++) {
    const emptySlot = document.createElement("div");
    emptySlot.className = "rw-inventory-slot";
    grid.appendChild(emptySlot);
  }
}

// Variant helper
function getVariantText(map, archetype, affinity) {
  if (!map) return "";
  const combo = (archetype || "") + ":" + (affinity || "");
  return (
    map[combo] ||
    (affinity && map[affinity]) ||
    (archetype && map[archetype]) ||
    map.default ||
    ""
  );
}

// ---------- LOCATION HELPERS ----------
function loadSavedLocation() {
  try {
    const key = localStorage.getItem(RAVENWOOD_LOCATION_KEY);
    return typeof key === "string" ? key : null;
  } catch {
    return null;
  }
}

function saveLocationKey(key) {
  try {
    if (key) {
      localStorage.setItem(RAVENWOOD_LOCATION_KEY, key);
    }
  } catch (e) {
    console.warn("Failed to save location to localStorage:", e);
  }
}

// ---------- SMALL DOM & EMAIL HELPERS ----------
function $(sel) {
  return document.querySelector(sel);
}

function saveEmail(email) {
  if (!email) return;
  localStorage.setItem(RAVENWOOD_EMAIL_KEY, email.toLowerCase());
}

function getSavedEmail() {
  return localStorage.getItem(RAVENWOOD_EMAIL_KEY);
}

function clearSavedEmail() {
  localStorage.removeItem(RAVENWOOD_EMAIL_KEY);
}

// ---------- CHARACTER TABLE HELPERS (Supabase) ----------

// Get first character row for an email from "data" table
async function fetchCharacterByEmail(email) {
  const { data, error } = await supabaseClient
    .from("data")
    .select("*")
    .eq("email", email.toLowerCase());

  if (error) {
    throw new Error("Supabase SELECT failed: " + error.message);
  }

  return data && data.length ? data[0] : null;
}

// Insert a new character into "data"
async function createCharacterOnSupabase(payload) {
  const { data, error } = await supabaseClient
    .from("data")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw new Error("Supabase INSERT failed: " + error.message);
  }

  return data;
}

// ---------- PAGE INIT: CREATE (SIGN-UP) ----------
// ---------- PAGE INIT: CREATE (SIGN-UP) ----------
function initCreatePage() {
  const form = $("#characterForm");
  if (!form) return;

  const statusEl = $("#rwStatus");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const displayName = $("#displayName")?.value.trim();
    const archetype = $("#archetype")?.value;
    const affinity = $("#affinity")?.value;
    const familiarName = $("#familiarName")?.value.trim();
    const journeyTone = document.querySelector(
      "input[name='journeyTone']:checked"
    )?.value;

    const avatar =
      document.querySelector("input[name='avatar']:checked")?.value ||
      DEFAULT_AVATAR;

    const email = $("#email")?.value.trim().toLowerCase();
    const password = $("#password")?.value;

    if (!displayName || !archetype || !affinity || !email || !password) {
      alert("Please fill in all required fields (including email & password).");
      return;
    }

    if (password.length < 6) {
      alert("Choose a password at least 6 characters long.");
      return;
    }

    if (statusEl) {
      statusEl.textContent = "Consulting the wards...";
      statusEl.classList.remove("text-danger");
    }

    try {
      // Check if a character already exists for that email
      const existing = await fetchCharacterByEmail(email);
      if (existing) {
        if (statusEl) {
          statusEl.textContent =
            "That email is already bound to Ravenwood. Use the Return to Ravenwood login instead.";
          statusEl.classList.add("text-danger");
        }
        alert("That email already has a Ravenwood self. Please log in instead.");
        return;
      }

      // 1) Create Auth user (Supabase Auth)
      const { data: signUpData, error: signUpError } =
        await supabaseClient.auth.signUp({
          email,
          password,
        });

      if (signUpError) {
        console.error("Supabase signUp error:", signUpError);
        if (statusEl) {
          statusEl.textContent =
            "The wards rejected that email/password. Try again.";
          statusEl.classList.add("text-danger");
        }
        alert(signUpError.message || "Could not create your Ravenwood account.");
        return;
      }

      console.log("Auth created:", signUpData);

      // 2) Create character profile row in "data" table
            const payload = {
        email,
        display_name: displayName,
        archetype,
        affinity,
        familiar_name: familiarName || null,
        journey_tone: journeyTone || null,
        avatar,
        created_at: new Date().toISOString(),
        coins: 0,
        secrets: [],      // start empty
        inventory: [],
        journal_entries: [],    // start empty
        manor_unlocked: false,
        intro_seen: false,     // first time in Ravenwood, show intro
        manor_intro_seen: false,
        inventory_intro_seen: false,
        book1_started: false,
        book1_last_page: null,
      };

      const inserted = await createCharacterOnSupabase(payload);
      console.log("Created character:", inserted);

      // Remember email on this device
      saveEmail(email);

      if (statusEl) {
        statusEl.textContent = "The gates of Ravenwood open…";
      }

      // 🔐 Make sure they're actually logged in before sending them to Ravenwood
      try {
        const { error: signInError } =
          await supabaseClient.auth.signInWithPassword({
            email,
            password,
          });

        if (signInError) {
          console.error("Auto-sign in after sign-up failed:", signInError);
          // Fallback: send them to login page if something went wrong
          window.location.href = "login.html";
          return;
        }

        // ✅ Now there is a valid session, so getUser() on ravenwood.html will work,
        // and maybeShowIntroModal(char, email) will run.
        window.location.href = "ravenwood.html";
      } catch (e) {
        console.error("Unexpected auto-signin error:", e);
        window.location.href = "login.html";
      }
    } catch (err) {
      console.error("Error creating character:", err);
      if (statusEl) {
        statusEl.textContent =
          "Something disrupted the ritual. Check your connection or try again.";
        statusEl.classList.add("text-danger");
      }
      alert(
        err.message ||
          "The wards resisted your entry. Please try again in a moment."
      );
    }
  });
}

// ---------- PAGE INIT: LOGIN (RETURNING USERS) ----------
function initLoginPage() {
  const form = $("#loginForm");
  if (!form) return;

  const statusEl = $("#rwLoginStatus");

  // Pre-fill email if saved
  const theSaved = getSavedEmail();
  if (theSaved && $("#loginEmail")) {
    $("#loginEmail").value = theSaved;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = $("#loginEmail")?.value.trim().toLowerCase();
    const password = $("#loginPassword")?.value;

    if (!email || !password) {
      alert("Please enter both email and password.");
      return;
    }

    if (statusEl) {
      statusEl.textContent = "The wards are listening…";
      statusEl.classList.remove("text-danger");
    }

    try {
      // Use Supabase Auth to sign in
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Supabase signIn error:", error);
        if (statusEl) {
          statusEl.textContent = "The manor did not recognize that password.";
          statusEl.classList.add("text-danger");
        }
        alert(error.message || "Incorrect email or password.");
        return;
      }

      console.log("Logged in:", data);

      // Save email locally (optional convenience)
      saveEmail(email);

      if (statusEl) {
        statusEl.textContent = "The manor recognizes your footsteps…";
      }

      window.location.href = "ravenwood.html";
    } catch (err) {
      console.error("Error logging into Ravenwood:", err);
      if (statusEl) {
        statusEl.textContent =
          "The connection to the manor wavered. Please try again.";
        statusEl.classList.add("text-danger");
      }
      alert(err.message || "Unable to log in right now. Please try again.");
    }
  });
}

// ---------- PAGE INIT: WORLD (MAIN HUB / TOWN) ----------
async function initWorldPage() {
  const nameEl = $("#rwUserName");
  const archEl = $("#rwUserArchetype");
    // We'll keep the full character object around for later helpers
  let currentChar = null;

  const navAvatarEl = document.querySelector("#rwAvatar");
  const summaryAvatarEl = document.querySelector("#rwSummaryAvatar");

  // for location variants
  let playerArchetype = null;
  let playerAffinity = null;

  // which avatar class we’re using (rw-avatar-XXXX)
  let avatarKey = DEFAULT_AVATAR;

  function applyAvatar(el) {
    if (!el) return;
    const extra = el.id === "rwSummaryAvatar" ? " rw-avatar-lg" : "";
    el.className = "rw-avatar-circle rw-avatar-" + avatarKey + extra;
    el.setAttribute("data-avatar", avatarKey);
  }

  // --- Map helpers: "You are here" indicator ---
  function setActiveMapLocation(locKey, locTitle) {
    const nodes = document.querySelectorAll(".rw-map-node");
    nodes.forEach((node) => {
      const key = node.getAttribute("data-map-location");
      node.classList.toggle("is-active", key === locKey);
    });

    const labelEl = document.querySelector("#rwMapCurrentLocation");
    if (labelEl && locTitle) {
      labelEl.textContent = locTitle;
    }
  }

  function wireMapNode(node) {
    node.addEventListener("click", () => {
      const key = node.getAttribute("data-map-location");
      if (!key) return;

      // Find matching town card button and reuse its logic
      const btn = document.querySelector(`[data-location="${key}"]`);
      if (btn) {
        btn.click();
      }
    });
  }

    // -------- First-Arrival Intro Modal --------
  function maybeShowIntroModal(char, email) {
    const introModalEl = document.getElementById("rwIntroModal");
    if (!introModalEl || !window.bootstrap || !bootstrap.Modal) return;

    // If they've already seen it (according to Supabase), bail out
    if (char && char.intro_seen === true) return;

    const introModal = new bootstrap.Modal(introModalEl, {
      backdrop: "static",
      keyboard: false,
    });

    introModal.show();

    const beginBtn = document.getElementById("rwIntroBeginBtn");
    if (beginBtn) {
      beginBtn.addEventListener(
        "click",
        async () => {
          try {
            // Mark as seen in Supabase so it won't show again for this email
            const { error } = await supabaseClient
              .from("data")
              .update({ intro_seen: true })
              .eq("email", email);

            if (error) {
              console.error("Failed to mark intro_seen:", error);
            }
          } catch (err) {
            console.error("Unexpected intro_seen error:", err);
          } finally {
            introModal.hide();
          }
        },
        { once: true }
      );
    }
  }

  // Check current authenticated user via Supabase Auth
  const {
    data: { user },
    error,
  } = await supabaseClient.auth.getUser();

  if (error) {
    console.error("Error getting Supabase user:", error);
  }

  if (!user || !user.email) {
    // No logged-in user → send to login
    window.location.href = "login.html";
    return;
  }

  const email = user.email.toLowerCase();

  try {
  // Try to load an existing character row for this email
  let char = await fetchCharacterByEmail(email);

  if (!char) {
  console.warn("No character profile found for", email, "— creating a default one.");

  // Fallback payload so you never get stuck in a redirect loop
            const fallbackPayload = {
        email,
        display_name: email.split("@")[0] || "Wanderer",
        archetype: "shadow-witch",
        affinity: "stone",
        familiar_name: null,
        journey_tone: "cozy",
        avatar: DEFAULT_AVATAR,
        created_at: new Date().toISOString(),

        // ⭐ Start fallback profiles with 0 coins as well
        coins: 0,

        secrets: [],
        inventory: [],
        journal_entries: [],
        manor_unlocked: false,
        intro_seen: false,
        manor_intro_seen: false,
        inventory_intro_seen: false,
        book1_started: false,
        book1_last_page: null,
      };

  // Create the missing row
  char = await createCharacterOnSupabase(fallbackPayload);
}

//------------------------------------------------
// FOGWALK ALLEY RANDOMIZER
//------------------------------------------------

function shouldShowFogwalk(secrets, isFirstVisit) {
  // Brand new characters NEVER see it on first arrival.
  if (isFirstVisit) return false;

  // If they've already seen Fogwalk at least once, allow the 1/20 chance.
  const roll = Math.floor(Math.random() * 20); // 0–19
  return roll === 0; // 1 in 20 chance
}

// -------------------------------------
// ⭐ Coins + character bootstrap
// -------------------------------------

currentChar = char;
window.rwChar = char;

// Load coins from Supabase (default to 0 if missing)
window.rwCoins =
  typeof char.coins === "number" && !Number.isNaN(char.coins)
    ? char.coins
    : 0;
updateCoinDisplay();

  // 🔹 If Book I has been started, show a "Continue" button
  const bookContinueBtn = document.getElementById("rwBook1ContinueBtn");
  if (bookContinueBtn && char.book1_started === true) {
    bookContinueBtn.classList.remove("d-none");
    bookContinueBtn.addEventListener("click", () => {
      window.location.href = "book-1.html";
    });
  }

// -------------------------------------
// Continue with avatar setup, map setup,
// intro modal check, etc.
// -------------------------------------

  // Remove outdated localStorage manor flag (Supabase is the source of truth now)
  localStorage.removeItem("ravenwoodManorUnlocked");

  // Stash identity + current progress for helpers
  window.rwEmail = email;
  window.rwInitialSecrets = Array.isArray(char.secrets) ? char.secrets : [];
    window.rwInitialInventory = Array.isArray(char.inventory)
    ? char.inventory
    : [];

  window.rwInitialInventory = Array.isArray(char.inventory)
  ? char.inventory
  : [];

// Normalize any legacy/plain-string journal entries
window.rwJournalEntries = normalizeJournalEntries(char.journal_entries || []);

window.rwJournalIndex = window.rwJournalEntries.length
  ? window.rwJournalEntries.length - 1
  : 0;

  window.rwManorUnlocked = !!char.manor_unlocked;

  playerArchetype = char.archetype || null;
  playerAffinity = char.affinity || null;

  // Basic identity
  if (nameEl) nameEl.textContent = char.display_name || "Guest";

  if (archEl) {
    const map = {
      "shadow-witch": "Shadow Witch",
      "scholar-of-runes": "Scholar of Runes",
      "guardian-of-gates": "Guardian of Gates",
      "seer-of-moons": "Seer of Moons",
    };
    archEl.textContent = map[char.archetype] || "Circle Walker";
  }

  // Avatar from DB (fallback to default)
  avatarKey = char.avatar || DEFAULT_AVATAR;
  applyAvatar(navAvatarEl);
  applyAvatar(summaryAvatarEl);

  // Snapshot on the right
  const summaryName = $("#rwSummaryName");
  const summaryArch = $("#rwSummaryArchetype");
  const summaryAffinity = $("#rwSummaryAffinity");
  const summaryTone = $("#rwSummaryTone");

  if (summaryName) summaryName.textContent = char.display_name;
  if (summaryArch) {
    summaryArch.textContent = archEl ? archEl.textContent : "";
  }

  if (summaryAffinity && char.affinity) {
    const affMap = {
      stone: "Stone · Wards & Foundations",
      water: "Water · Memory & Dream",
      flame: "Flame · Will & Transformation",
      wind: "Wind · Messages & Thresholds",
    };
    summaryAffinity.textContent =
      affMap[char.affinity] || String(char.affinity);
  }

  if (summaryTone) {
    summaryTone.textContent =
      char.journey_tone === "intense"
        ? "Darker & Intense"
        : "Cozy & Healing";
  }

  // ⭐ Show first-arrival intro if this account hasn't seen it yet
  maybeShowIntroModal(char, email);

} catch (err) {
  console.error("Error loading Ravenwood world:", err);
  alert(
    "Ravenwood couldn’t be reached just now. Try refreshing, or step back through the gate and re-enter."
  );
}

  // ----- Avatar edit modal wiring -----
  const avatarModalEl = document.getElementById("rwAvatarModal");
  let avatarModal = null;

  if (avatarModalEl && window.bootstrap && bootstrap.Modal) {
    avatarModal = new bootstrap.Modal(avatarModalEl);
  }

  if (nameEl && avatarModalEl && avatarModal) {
    nameEl.style.cursor = "pointer";
    nameEl.title = "Click to change your avatar";

    // Open modal when clicking the name in navbar
    nameEl.addEventListener("click", () => {
      const radios = avatarModalEl.querySelectorAll(
        "input[name='rwAvatarChoice']"
      );
      radios.forEach((input) => {
        input.checked = input.value === avatarKey;
      });
      avatarModal.show();
    });

    // Save avatar + update Supabase + refresh UI
    const saveBtn = document.getElementById("rwAvatarSaveBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        const selected = avatarModalEl.querySelector(
          "input[name='rwAvatarChoice']:checked"
        );
        if (!selected) return;

        const newAvatar = selected.value;

        try {
          const { error: updateError } = await supabaseClient
            .from("data")
            .update({ avatar: newAvatar })
            .eq("email", email);

          if (updateError) {
            console.error("Avatar update failed:", updateError);
            alert("The wards resisted that change. Try again.");
            return;
          }

          avatarKey = newAvatar;
          applyAvatar(navAvatarEl);
          applyAvatar(summaryAvatarEl);

          avatarModal.hide();
        } catch (err) {
          console.error("Unexpected avatar update error:", err);
          alert("Something disrupted the ritual. Please try again.");
        }
      });
    }
  }

  // Reset / sign-out button
  const resetBtn = $("#rwResetBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      if (
        confirm(
          "Step away from this Ravenwood self on this device? You’ll need your email and password to return."
        )
      ) {
        clearSavedEmail();
        await supabaseClient.auth.signOut();
        window.location.href = "login.html";
      }
    });
  }

  // ---------- Town Map & Secrets wiring ----------

  const detailTitleEl = $("#rwLocationDetailTitle");
  const detailBodyEl = $("#rwLocationDetailBody");
  const detailHintEl = $("#rwLocationDetailHint");
  const secretsListEl = $("#rwSecretsList");
  const SECRET_FOGWALK = "fogwalk_seen";
  const SECRET_CHAPEL_ITEM = "chapel_relic_obtained";
  const SECRET_MARNE_UNLOCKED = "marne_secret_book";

  // Location definitions, with archetype/affinity variants + secrets
  const locations = {
    square: {
      title: "Town Square",
      body: {
        default:
          "Lanterns cast soft halos over the uneven stones. A cracked fountain burbles with water that never quite freezes. Notices for missing cats, moonlit meetings, and half-torn prophecy fragments flap on the board.",
        "scholar-of-runes":
          "You notice the way the fountain spray lands in repeating patterns — almost a sigil, if you had time to sketch it.",
        "shadow-witch":
          "You feel eyes on you from nowhere in particular. The square remembers who used to rule its shadows.",
      },
      hint: {
        default:
          "Sometimes someone pins a note here meant only for Circle eyes.",
        "guardian-of-gates":
          "Old gate-keys are sometimes traded quietly here, if you know who to nod to.",
      },
      secretText:
        "In the Town Square, you noticed a torn notice about a 'gathering under a silver moon' with no date.",
    },
    moonwell: {
      title: "The Moonwell",
      body: {
        default:
          "The well’s water reflects the moon even when clouds smother the sky. Old offerings line the stone lip: rusted rings, knotted cords, pressed flowers that never quite rot.",
        water:
          "The water thrums against your senses, as if something beneath the surface is breathing slowly in time with you.",
        "seer-of-moons":
          "You catch flickers of futures on the surface, like someone flipping through your life as if it were a book.",
      },
      hint: {
        default:
          "Drop a wish in, but listen closely to what the echo gives back.",
        "seer-of-moons":
          "You know better than to trust the first vision that rises here.",
      },
      secretText:
        "At the Moonwell, you heard an echo whisper a name that no one has spoken in years — maybe your own.",
    },
    market: {
      title: "Market Lane",
      body: {
        default:
          "Stalls crowd close together, thick with incense and the clink of charms. Vendors offer powders that remember your dreams and trinkets that insist they belonged to queens.",
        flame:
          "Heat rolls off cauldrons and braziers. Every stall feels like a different kind of trial by fire.",
      },
      hint: {
        default:
          "One stall sells objects that feel suspiciously like they fell out of your own story.",
      },
      secretText:
        "In Market Lane, a charm seller pressed something into your palm and said, 'You’re late.' You never paid.",
    },
    chapel: {
      title: "Old Chapel",
      body: {
        default:
          "Candles still burn where no one admits to lighting them. The stained glass throws fractured light that makes new symbols on the floor — symbols the old Circle once used.",
        "scholar-of-runes":
          "You recognize half-remembered sigils in the colored light, as if the windows are quietly finishing a lesson you never got.",
      },
      hint: {
        default:
          "Sit in the back pew if you want the ghosts to talk instead of stare.",
      },
      secretText:
        "In the Old Chapel, you sat in the back pew and felt someone sit beside you, though the seat stayed empty.",
    },
    witchwood: {
      title: "Witchwood Edge",
      body: {
        default:
          "The first trees of the Witchwood lean toward the path, crowns whispering together. Runes carved into bark glow faintly whenever the wind comes from the manor’s direction.",
        "shadow-witch":
          "The shadows between the trees part for you just a little, as if recognizing an old friend.",
        stone:
          "You feel the press of bedrock under your feet like a steady hand at your back.",
      },
      hint: {
        default: "The Witchwood doesn’t mind visitors — only liars.",
      },
      secretText:
        "At Witchwood Edge, a rune flared warm under your palm, recognizing something in your blood.",
    },
        fogwalk: {
      title: "Fogwalk Alley",
      body: {
        default:
          "A narrow, shifting alley that only exists when the fog is thick enough to hide your doubts.",
      },
      hint: {
        default: "The fog curls like writing you almost understand.",
      },
      // extra hint pool just for Fogwalk
      hints: [
        "An old chapel bell tolls once somewhere behind the mist.",
        "For a heartbeat you smell candle wax and stone, as if you’ve stepped indoors without noticing.",
        "You glimpse a crooked sign half-hidden by fog — a symbol that looks like a door drawn inside a circle.",
        "The lantern flame leans toward the direction of the chapel, then straightens when you notice.",
        "A whisper brushes your ear: \"Some doors open from the inside.\"",
      ],
      secretText:
        "In Fogwalk Alley, the lantern flared when you thought about turning back — as if warning you that some paths only go one way.",
    },
    overlook: {
      // UNLOCKED after the Moonwell secret
      title: "Ravenwood Overlook",
      body: {
        default:
          "A narrow path climbs above the town to a rocky outcrop. From here you can see the manor, the Moonwell, and the dark border of the Witchwood, all held together by a thin silver mist.",
        wind:
          "The wind tugs at your clothes like an impatient guide, pointing out roads and rooftops as if drawing a map only you can read.",
        "guardian-of-gates":
          "From here you can see every threshold at once. It feels uncomfortably like responsibility.",
      },
      hint: {
        default:
          "Places like this are where circles begin, and where they break.",
      },
      // When this secret fires, you also find the talisman
      secretText:
        "At Ravenwood Overlook, you found an old bronze talisman etched with a Triquetra, lying where the cliff meets the mist.",
      requiresSecretFrom: "moonwell", // unlock condition
      rewardItem: {
        id: "old_talisman",
        name: "Old Talisman",
        icon: "tal-tri.png",
        quantity: 1,
      },
    },
    manor: {
      title: "Ravenwood Manor",
      body: {
        default:
          "The manor towers over the town, its windows burning with a few patient lights. The wards along the gate shiver when you draw near, tasting the metal of the talisman in your pocket.",
      },
      hint: {
        default:
          "Someone inside has been waiting for that talisman to find its way home.",
      },
      secretText:
        "At the gates of Ravenwood Manor, a voice behind the door whispered, 'You brought it back.'",
    },
  };

  // ------------------------------
// FIRST-TIME MANOR ARRIVAL STORY
// ------------------------------
// ------------------------------
// FIRST-TIME MANOR ARRIVAL STORY
// ------------------------------
async function maybeShowManorArrival(char, email) {
  if (!char) return;
  if (char.manor_intro_seen === true) return;

  const modalEl = document.getElementById("rwManorArrivalModal");
  if (!modalEl || !window.bootstrap || !bootstrap.Modal) return;

  const manorModal = new bootstrap.Modal(modalEl, {
    backdrop: "static",
    keyboard: false,
  });

  manorModal.show();

  const btn = document.getElementById("rwManorArrivalBeginBtn");
  if (btn) {
    btn.addEventListener(
      "click",
      async () => {
        try {
          const { error } = await supabaseClient
            .from("data")
            .update({
              manor_unlocked: true,
              manor_intro_seen: true,
              book1_started: true,
              book1_last_page: "1", // start on page 1
            })
            .eq("email", email);

          if (error) {
            console.error("Failed to update manor arrival:", error);
          } else {
            // keep local copy in sync
            char.manor_intro_seen = true;
            char.book1_started = true;
            char.book1_last_page = "1";
            if (window.rwChar) Object.assign(window.rwChar, char);
          }
        } catch (err) {
          console.error("Unexpected manor arrival error:", err);
        } finally {
          manorModal.hide();
          // 🚪 Go straight into the interactive book
          window.location.href = "book-1.html";
        }
      },
      { once: true }
    );
  }
}

  // ---- Secrets: load, render, mutate ----

  // Start from what Supabase has for this character
  let discoveredSecrets = Array.isArray(window.rwInitialSecrets)
    ? window.rwInitialSecrets
    : [];

  // IMPORTANT: we do NOT migrate old localStorage into Supabase anymore.
  // That avoids "ghost" saves from before.
  //
  // If you *really* need to rescue old local secrets on this device:
  // const legacy = loadSecrets();
  // if (!discoveredSecrets.length && Array.isArray(legacy) && legacy.length) {
  //   discoveredSecrets = legacy;
  //   syncSecretsToSupabase(discoveredSecrets);
  // }

  function hasSecretFromLocation(locKey) {
    const loc = locations[locKey];
    if (!loc || !loc.secretText) return false;
    return discoveredSecrets.some((s) => s.text === loc.secretText);
  }

  function renderSecrets() {
    if (!secretsListEl) return;

    secretsListEl.innerHTML = "";

    if (!discoveredSecrets.length) {
      const li = document.createElement("li");
      li.className = "rw-secret-empty text-muted small";
      li.textContent =
        "No secrets yet. The town is still deciding if it trusts you.";
      secretsListEl.appendChild(li);
      return;
    }

    discoveredSecrets.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s.text;
      secretsListEl.appendChild(li);
    });
  }

  // Permanently unlock the manor (once)
  async function unlockManor() {
    if (window.rwManorUnlocked) return; // already unlocked

    window.rwManorUnlocked = true;

    // Save locally (fallback)
    localStorage.setItem("ravenwoodManorUnlocked", "true");

    // Save online in Supabase
    const email = window.rwEmail;
    if (email) {
      try {
        const { error } = await supabaseClient
          .from("data")
          .update({ manor_unlocked: true })
          .eq("email", email);

        if (error) {
          console.error("Failed to update manor_unlocked:", error);
        }
      } catch (err) {
        console.error("Unexpected manor unlock error:", err);
      }
    }

    // Refresh dynamic locations so the card + map pin appear
    maybeSpawnDynamicLocations();
  }

  // ------------------------------
// FIRST TIME INVENTORY JOURNAL
// ------------------------------
function showFirstInventoryModalIfNeeded() {
  const email = window.rwEmail;
  if (!email) return;

  // flag key per player
  const flagKey = `rw_seen_inventory_intro_${email}`;

  // already seen?
  if (localStorage.getItem(flagKey)) return;

  // otherwise, show modal once
  const modalEl = document.getElementById("rwFirstInventoryModal");
  if (modalEl && window.bootstrap) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
  }

  // mark as seen
  localStorage.setItem(flagKey, "yes");
}

  // ---------- Inventory wiring ----------

  // Helper to show the first-time inventory journal intro
  // ---------- Inventory wiring ----------

  // Grab the button + modal from ravenwood.html
    // ---------- Inventory wiring ----------

  // Grab the button + modal from ravenwood.html
  const inventoryBtn = document.getElementById("rwInventoryBtn");
  const inventoryModalEl = document.getElementById("rwInventoryModal");
  let inventoryModal = null;

  if (inventoryModalEl && window.bootstrap && bootstrap.Modal) {
    inventoryModal = new bootstrap.Modal(inventoryModalEl);
  }

  // Local inventory state for this page, seeded from Supabase
  let inventory = Array.isArray(window.rwInitialInventory)
    ? window.rwInitialInventory
    : [];

  // Make sure the grid is populated on load
  renderInventory(inventory);

  // Helper to show the first-time inventory journal intro
  async function maybeShowInventoryIntroThenOpen() {
    const introEl = document.getElementById("rwInventoryIntroModal");
    const btn = document.getElementById("rwInventoryIntroContinueBtn");

    // If we don't have the intro modal, just open inventory normally
    if (!introEl || !window.bootstrap || !bootstrap.Modal || !inventoryModal) {
      inventoryModal && inventoryModal.show();
      return;
    }

    const introModal = new bootstrap.Modal(introEl, {
      backdrop: "static",
      keyboard: false,
    });

    introModal.show();

    if (btn) {
      btn.addEventListener(
        "click",
        async () => {
          try {
            const email = window.rwEmail;
            const char = window.rwChar;

            // Update Supabase so this never shows again for this player
            if (email) {
              const { error } = await supabaseClient
                .from("data")
                .update({ inventory_intro_seen: true })
                .eq("email", email);

              if (error) {
                console.error("Failed to mark inventory_intro_seen:", error);
              }
            }

            // Update the in-memory character too
            if (char) {
              char.inventory_intro_seen = true;
              window.rwChar = char;
            }

            // ✨ FIRST JOURNAL ENTRY: the book writes itself
            if (window.rwAddJournalEntry) {
              const entryText = [
                "I found a journal I don’t remember packing.",
                "The cover is dark leather, warm like it’s been carried for years. A raven is stamped into it, wings half-spread, head turned as if listening.",
                "There was a tiny silver lock on the side. Before I could decide whether to open it, it clicked once and fell away on its own.",
                "The pages were blank for a breath… then ink started to move across the paper, curling into words in my own handwriting.",
                "I don’t remember writing any of it. But the journal feels like it remembers me.",
                "I think this book is going to write what Ravenwood sees, even when I’m trying to look away."
              ].join("\n\n");

              await window.rwAddJournalEntry(entryText, {
                source: "system",
                location: "inventory_intro",
              });
            }
          } catch (err) {
            console.error("Unexpected inventory_intro_seen error:", err);
          } finally {
            // 👉 Close the story modal and open the real inventory
            introModal.hide();
            inventoryModal && inventoryModal.show();
          }
        },
        { once: true }
      );
    }
  }

  // Wire the Inventory button
  if (inventoryBtn && inventoryModal) {
    inventoryBtn.addEventListener("click", () => {
      renderInventory(inventory);

      const char = window.rwChar || {};
      const hasSeenIntro = !!char.inventory_intro_seen;

      if (!hasSeenIntro) {
        // First time ever opening inventory for this account
        maybeShowInventoryIntroThenOpen();
      } else {
        // Normal behavior once the intro has been seen
        inventoryModal.show();
      }
    });
  }

    // ---------- Journal wiring ----------

  const journalBtn = document.getElementById("rwJournalBtn");
  const journalModalEl = document.getElementById("rwJournalModal");
  let journalModal = null;

  if (journalModalEl && window.bootstrap && bootstrap.Modal) {
    journalModal = new bootstrap.Modal(journalModalEl);
  }

  // Open the journal when you click the raven journal image/button
  if (journalBtn && journalModal) {
    journalBtn.addEventListener("click", () => {
      renderJournal();     // fill the current page
      journalModal.show(); // show the parchment popup
    });
  }

  // Page navigation inside the journal
  const journalPrev = document.getElementById("rwJournalPrev");
  const journalNext = document.getElementById("rwJournalNext");

  if (journalPrev) {
    journalPrev.addEventListener("click", () => {
      const entries = Array.isArray(window.rwJournalEntries)
        ? window.rwJournalEntries
        : [];
      if (!entries.length) return;

      const idx = window.rwJournalIndex ?? 0;
      // wrap backwards
      window.rwJournalIndex = idx > 0 ? idx - 1 : entries.length - 1;
      renderJournal();
    });
  }

  if (journalNext) {
    journalNext.addEventListener("click", () => {
      const entries = Array.isArray(window.rwJournalEntries)
        ? window.rwJournalEntries
        : [];
      if (!entries.length) return;

      const idx = window.rwJournalIndex ?? 0;
      // wrap forward
      window.rwJournalIndex = idx < entries.length - 1 ? idx + 1 : 0;
      renderJournal();
    });
  }

  // Make sure journal UI starts in a sane state
  renderJournal();

  function playerHasTalisman() {

    return inventory.some((i) => i.id === "old_talisman");
  }

  window.addItemToInventory = function (newItem) {
  if (!newItem || !newItem.id) return;

  // Work from the in-memory copy (already seeded from Supabase)
  const existing = inventory.find((i) => i.id === newItem.id);
  const isNewItem = !existing;

  if (existing) {
    existing.quantity =
      (existing.quantity || 1) + (newItem.quantity || 1);
  } else {
    inventory.push({
      id: newItem.id,
      name: newItem.name || "Unknown item",
      icon: newItem.icon || "",
      quantity: newItem.quantity || 1,
    });
  }

  // ✅ Save to Supabase (+ cache locally)
  syncInventoryToSupabase(inventory);

  // ✅ If this is a brand-new item, highlight it and pop the inventory open
  if (isNewItem) {
    renderInventory(inventory, newItem.id);

    if (inventoryModal) {
      inventoryModal.show();

      // Remove highlight after a moment
      setTimeout(() => {
        const highlighted = document.querySelector(
          ".rw-inventory-slot--highlight"
        );
        if (highlighted) {
          highlighted.classList.remove("rw-inventory-slot--highlight");
        }
      }, 2200);
    }
  } else {
    // Existing item, just re-render normally
    renderInventory(inventory);
  }
};

  function addSecretFromLocation(locKey) {
    const loc = locations[locKey];
    if (!loc || !loc.secretText) return;

    const exists = discoveredSecrets.some((s) => s.text === loc.secretText);
    if (exists) {
      // even if secret already known, don't double-award items
      return;
    }

    discoveredSecrets.push({ key: locKey, text: loc.secretText });

        // Also log this as a journal entry
    try {
      const locTitle = loc.title || locKey;
      const entryText = `[${locTitle}] ${loc.secretText}`;
      addJournalEntry(entryText, {
        source: "location_secret",
        location: locKey,
      });
    } catch (e) {
      console.warn("Could not add journal entry:", e);
    }

    // Save to Supabase (+ cache locally)
    syncSecretsToSupabase(discoveredSecrets);
    renderSecrets();

    // If this location grants an item (like the old talisman), award it once
    if (loc.rewardItem && window.addItemToInventory) {
      const alreadyHas = inventory.some((i) => i.id === loc.rewardItem.id);
      if (!alreadyHas) {
        window.addItemToInventory(loc.rewardItem);
      }
    }

    // When the Overlook secret is first discovered, permanently unlock the manor
    if (locKey === "overlook") {
      unlockManor();
    }

    maybeSpawnDynamicLocations();
  }

  renderSecrets();

  // ---- Dynamic locations (unlockables) ----

  function renderLocationDetail(key) {
    const loc = locations[key];
    if (!loc) return;

    const bodyText = getVariantText(
      loc.body,
      playerArchetype,
      playerAffinity
    );
        let hintText = getVariantText(
      loc.hint,
      playerArchetype,
      playerAffinity
    );

    // Special case: Fogwalk gets a random hint from its pool
    if (key === "fogwalk" && Array.isArray(loc.hints) && loc.hints.length) {
      const idx = Math.floor(Math.random() * loc.hints.length);
      hintText = loc.hints[idx];
    }

    if (detailTitleEl) detailTitleEl.textContent = loc.title;

    if (detailBodyEl) {
  let html = "";

  // ✅ Special first-visit description for Ravenwood Overlook
  if (key === "overlook" && !hasSecretFromLocation("overlook")) {
    html += `
      <p>${bodyText}</p>
      <p>
        As you edge closer to the cliff, something sharp and bright winks up
        from the moss-dark stone. Kneeling, you brush aside damp leaves and
        grit until your fingers close on a small, weighty disc of metal.
      </p>
      <p>
        It’s an old bronze talisman, its surface worn smooth by years of wind
        and rain, but the etched Triquetra at its center is still clear enough
        to prickle along your skin. The metal hums faintly against your palm,
        as if it recognizes you—or has been waiting.
      </p>
      <p>
        You slip the talisman into your pocket. Far below, the town’s lights
        blur in the mist, and for a heartbeat the distant shape of Ravenwood
        Manor feels almost awake, like a house that just heard its name.
      </p>
    `;
  } else {
    // Normal behavior for all other visits / locations
    html += `<p>${bodyText}</p>`;
  }

  // 🪧 Manor notice in the square (unchanged)
  if (
    key === "square" &&
    hasSecretFromLocation("moonwell") &&
    !hasSecretFromLocation("manor")
  ) {
    html +=
      '<div class="mt-3 p-2 border border-warning rounded small">' +
      "<strong>NOTICE FROM RAVENWOOD MANOR:</strong> To any Circle-touched souls still walking these streets.<br>" +
      "An old bronze talisman bearing the Triquetra has gone missing from the manor under deeply suspicious circumstances. It was not misplaced, and those of us who keep the wards know when something is taken. If this talisman has found its way into your hands, I ask—no, urge—you to return it at once. The wards have grown restless since it vanished, and there are doors I would rather keep closed. A generous reward in coin, favor, and protection from the manor’s Lady will be granted to any who return it discreetly.<br><br>" +
      "Signed,<br>Mira Ashbourne" +
      "</div>";
  }

  detailBodyEl.innerHTML = html;
}

    if (detailHintEl) detailHintEl.textContent = hintText;

    // reflect in the map
    setActiveMapLocation(key, loc.title);
  }

  function wireLocationButton(btn) {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-location");
    if (!locations[key]) return;

    // ⭐ Special case: first time arriving at the Manor
    if (
      key === "manor" &&
      currentChar &&
      currentChar.manor_intro_seen !== true &&
      playerHasTalisman()
    ) {
      maybeShowManorArrival(currentChar, window.rwEmail || "");
      renderLocationDetail(key);
      addSecretFromLocation(key);
      saveLocationKey(key);
      // 🔁 also give Fogwalk (and other unlocks) a chance to update
      maybeSpawnDynamicLocations();
      return;
    }

    // Normal behavior for all other locations (and later manor visits)
    renderLocationDetail(key);
    addSecretFromLocation(key);
    saveLocationKey(key);

    // 🔁 every click can re-check dynamic locations
    maybeSpawnDynamicLocations();
  });
}

  // SPAWN / UPDATE UNLOCKABLE LOCATIONS
  function maybeSpawnDynamicLocations() {
    const townMap = document.querySelector("#rwTownMap");
    if (!townMap) return;

    // 1) Overlook unlocks once Moonwell’s secret is discovered
    const needOverlook =
      locations.overlook &&
      hasSecretFromLocation("moonwell") &&
      !document.querySelector("[data-location='overlook']");

    if (needOverlook) {
      const col = document.createElement("div");
      col.className = "col-md-6 col-xl-4";
      col.innerHTML = `
        <button
          class="rw-location-card w-100 text-start"
          type="button"
          data-location="overlook"
        >
          <div class="rw-location-header d-flex justify-content-between align-items-center">
            <span class="rw-location-name">Ravenwood Overlook</span>
            <span class="rw-location-badge">Unlocked</span>
          </div>
          <p class="rw-location-blurb mb-0">
            A narrow path above the town that only appears once you’ve truly listened to the Moonwell.
          </p>
        </button>
      `;
      townMap.appendChild(col);
      const btn = col.querySelector("[data-location='overlook']");
      if (btn) wireLocationButton(btn);

      // also un-hide Overlook on the map if you want
      const mapNode = document.querySelector(
        ".rw-map-node[data-map-location='overlook']"
      );
      if (mapNode) {
        mapNode.classList.remove("d-none");
      }
    }

        // 3) Fogwalk Alley — rare secret, never on brand-new characters
    const alreadyHasFogwalkCard = townMap.querySelector("[data-location='fogwalk']");
    const playerHasAnySecrets =
      Array.isArray(discoveredSecrets) && discoveredSecrets.length > 0;

    // Only roll if:
    //  - there isn't already a Fogwalk button on the map
    //  - the player has at least one secret (so not on their very first visit)
    if (!alreadyHasFogwalkCard && playerHasAnySecrets) {
      // 1-in-20 chance each time we render the town
      const roll = Math.floor(Math.random() * 20); // 0..19
      if (roll === 0) {
        const col = document.createElement("div");
        col.className = "col-md-6 col-xl-4";
        col.innerHTML = `
          <button
            class="rw-location-card w-100 text-start rw-location-secret"
            type="button"
            data-location="fogwalk"
          >
            <div class="rw-location-header d-flex justify-content-between align-items-center">
              <span class="rw-location-name">Fogwalk Alley</span>
              <span class="rw-location-badge">Secret</span>
            </div>
            <p class="rw-location-blurb mb-0">
              You only find this alley when you aren’t looking for it.
              Tonight the fog seems… interested in you.
            </p>
          </button>
        `;
        townMap.appendChild(col);

        // Wire up the new button so it behaves like the others
                // Wire up the new button so it behaves like the others
        const btn = col.querySelector("[data-location='fogwalk']");
        if (btn) {
          wireLocationButton(btn);
        }

      }
    }

    // 2) Manor unlocks once Overlook is discovered
    // OR from the saved persistent flag (rwManorUnlocked)
    const manorRequirementsMet =
  locations.manor && window.rwManorUnlocked;

    // If requirements are met and the card isn't on the grid yet, add it
    if (
      manorRequirementsMet &&
      !document.querySelector("[data-location='manor']")
    ) {
      const col = document.createElement("div");
      col.className = "col-md-6 col-xl-4";
      col.innerHTML = `
        <button
          class="rw-location-card w-100 text-start"
          type="button"
          data-location="manor"
        >
          <div class="rw-location-header d-flex justify-content-between align-items-center">
            <span class="rw-location-name">Ravenwood Manor</span>
            <span class="rw-location-badge">New</span>
          </div>
          <p class="rw-location-blurb mb-0">
            A notice in the square says someone at the manor is searching for a missing talisman. Its gates stand slightly ajar.
          </p>
        </button>
      `;
      townMap.appendChild(col);
      const btn = col.querySelector("[data-location='manor']");
      if (btn) wireLocationButton(btn);
    }

    // Whether or not the card had to be created this run,
    // if the requirements are met, un-hide the Manor pin on the map.
    if (manorRequirementsMet) {
      const manorNode = document.querySelector(
        ".rw-map-node[data-map-location='manor']"
      );
      if (manorNode) {
        manorNode.classList.remove("d-none");
      }
    }
  }

  // Wire existing location buttons
  const locationButtons = document.querySelectorAll("[data-location]");
  locationButtons.forEach((btn) => wireLocationButton(btn));

  // Wire map nodes so clicking the map moves you
  const mapNodes = document.querySelectorAll(".rw-map-node");
  mapNodes.forEach((node) => wireMapNode(node));

  // Spawn any unlockable locations based on already-known secrets / items
  maybeSpawnDynamicLocations();

  // Starting view:
  //  - First time: Town Square
  //  - Later: last visited valid location
  let startingKey = loadSavedLocation();
  if (!startingKey || !locations[startingKey]) {
    startingKey = "square";       // first time, use Town Square
    saveLocationKey(startingKey); // remember it for next time
  }

  if (detailTitleEl && detailBodyEl && detailHintEl && locations[startingKey]) {
    renderLocationDetail(startingKey);
  }
}

// ---------- LANDING PAGE ----------
function initLandingPage() {
  const firstBtn = $("#firstTimeBtn");
  const returnBtn = $("#returnBtn");

  if (firstBtn) {
    firstBtn.addEventListener("click", () => {
      window.location.href = "create.html";
    });
  }

  if (returnBtn) {
    returnBtn.addEventListener("click", () => {
      window.location.href = "login.html";
    });
  }
}

// ---------- BOOTSTRAP ----------
document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  if (page === "landing") initLandingPage();
  if (page === "create") initCreatePage();
  if (page === "login") initLoginPage();
  if (page === "world") initWorldPage();
});
