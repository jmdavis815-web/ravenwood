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

window.supabaseClient = supabaseClient;

// LocalStorage keys
const RAVENWOOD_EMAIL_KEY = "ravenwoodEmail";
const RAVENWOOD_SECRETS_KEY = "ravenwoodTownSecrets";
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

async function syncEquippedToSupabase(equipped) {
  const email = window.rwEmail;
  if (!email) return;

  try {
    const { error } = await supabaseClient
      .from("data")
      .update({ equipped: equipped || {} })
      .eq("email", email);

    if (error) console.error("Failed to sync equipped:", error);
  } catch (err) {
    console.error("Unexpected equipped sync error:", err);
  }
}

function getEquipSlotForItem(item) {
  const meta = getItemMetadata(item);
  return meta?.slot || null;
}

function computeEquipmentBonuses(equipped) {
  const result = { might: 0, agility: 0, will: 0, insight: 0, presence: 0 };
  if (!equipped) return result;

  const slots = ["head", "neck", "ring_left", "ring_right", "feet"];
  for (const slot of slots) {
    const it = equipped[slot];
    if (!it) continue;

    const meta = getItemMetadata(it);
    const b = meta?.bonuses || {};
    for (const key in result) {
      if (Object.prototype.hasOwnProperty.call(b, key)) {
        result[key] += Number(b[key]) || 0;
      }
    }
  }

  return result;
}

function addStatBlocks(base, bonus) {
  const out = { ...base };
  for (const k in out) out[k] = (out[k] || 0) + (bonus[k] || 0);
  return out;
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

// --------------------------------------
// Avatar + path helpers
// --------------------------------------

// Default (pre-awakening) avatar keys
const DEFAULT_AVATAR_FEMALE = "f-default";
const DEFAULT_AVATAR_MALE   = "m-default";
const DEFAULT_AVATAR        = DEFAULT_AVATAR_FEMALE;

// All avatar IDs that can exist in the game
// (we'll later add upgraded variants like f-shadow-2, etc.)
const BASE_AVATARS = [
  "f-default",   "m-default",
  "f-mystic",    "m-mystic",
  "f-shadow",    "m-shadow",
  "f-moon",      "m-moon",
  "f-rune",      "m-rune",
  "f-guardian",  "m-guardian",
];

// Extract the "family"/path from an avatar key.
// "f-shadow"      -> "shadow"
// "m-moon-ascend" -> "moon"
function getAvatarFamily(avatarKey) {
  if (!avatarKey) return null;
  const parts = avatarKey.split("-");
  if (parts.length < 2) return null;
  return parts[1]; // the part after f/m
}

// Given an archetype ("shadow", "mystic", "moon", "rune", "guardian")
// and gender ("male"/"female"), return the base avatar.
function avatarFromArchetype(archetype, gender = "female") {
  const g = gender === "male" ? "m" : "f";

  switch (archetype) {
    case "shadow":
      return `${g}-shadow`;
    case "mystic":
      return `${g}-mystic`;
    case "moon":
      return `${g}-moon`;
    case "rune":
      return `${g}-rune`;
    case "guardian":
      return `${g}-guardian`;
    default:
      // if something is weird, stay with default
      return g === "m" ? DEFAULT_AVATAR_MALE : DEFAULT_AVATAR_FEMALE;
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

// ---------- LOCATION (CROSS-DEVICE) HELPERS ----------

async function syncLocationToSupabase(locKey) {
  const email = window.rwEmail;
  if (!email || !locKey) return;

  try {
    const { error } = await supabaseClient
      .from("data")
      .update({ location_key: locKey })
      .eq("email", email);

    if (error) {
      console.error("Failed to sync location_key:", error);
    }
  } catch (err) {
    console.error("Unexpected location sync error:", err);
  }
}
// ---------- HP & MANA HELPERS ----------

const RW_MAX_HP = 100;
const RW_MAX_MANA = 100;

function updateHpManaDisplays() {
  const hpBar = document.getElementById("rwHpBar");
  const manaBar = document.getElementById("rwManaBar");
  const hpValueEl = document.getElementById("rwHpValue");
  const manaValueEl = document.getElementById("rwManaValue");

  const hp = Math.max(0, Math.min(RW_MAX_HP, window.rwHP ?? RW_MAX_HP));
  const mana = Math.max(
  0,
  Math.min(RW_MAX_MANA, window.rwMana ?? 0)
);

  const hpPct = (hp / RW_MAX_HP) * 100;
  const manaPct = (mana / RW_MAX_MANA) * 100;

  if (hpBar) hpBar.style.width = `${hpPct}%`;
  if (manaBar) manaBar.style.width = `${manaPct}%`;

  if (hpValueEl) hpValueEl.textContent = hp;
  if (manaValueEl) manaValueEl.textContent = mana;
}

async function syncHpToSupabase() {
  const email = window.rwEmail;
  if (!email) return;
  try {
    const { error } = await supabaseClient
      .from("data")
      .update({ hp: window.rwHP ?? RW_MAX_HP })
      .eq("email", email);

    if (error) {
      console.error("Failed to sync HP:", error);
    }
  } catch (err) {
    console.error("Unexpected HP sync error:", err);
  }
}

  // Equipment slots we support
const RW_EQUIP_SLOTS = ["head", "neck", "ring_left", "ring_right", "feet"];

// Add equip slot metadata to items that can be equipped.
// (Example items — rename icons/ids to yours)
const ITEM_METADATA = {
  old_talisman: {
    title: "Old Talisman",
    description:
      "A bronze talisman etched with a Triquetra. It remembers old wards and answers doors that have forgotten how to open.",
    questItem: true,
  },

  // Example equip items
  moon_silver_amulet: {
    title: "Moon-Silver Amulet",
    description: "Cold silver that steadies your breath and sharpens your sight.",
    icon: "item-amulet.png",
    questItem: false,

    // ✅ equipment info
    slot: "neck",
    bonuses: { insight: 1, will: 1 },
  },

  ash_ring: {
    title: "Ash Ring",
    description: "A ring that leaves your skin warm, like an ember never finished.",
    icon: "item-ring.png",
    questItem: false,

    // rings can go left/right
    slot: "ring",
    bonuses: { presence: 1 },
  },

  warded_boots: {
    title: "Warded Boots",
    description: "Leather stitched with small protective knots.",
    icon: "item-boots.png",
    questItem: false,

    slot: "feet",
    bonuses: { agility: 1 },
  },

  // health potion stays non-equipable
  health_potion: {
    title: "Minor Health Potion",
    description:
      "A small glass vial of ember-red liquid. Drinking it restores 20 health and leaves a faint warmth in your chest.",
    icon: "item-health-potion.png",
    questItem: false,
  },

"ravenwood_journal": {
  title: "Ravenwood Journal",
  description:
    "A dark leather journal the Manor gives to those it intends to remember. Some pages write themselves. You can record secrets and clues here.",
  icon: "item-journal.png",
  questItem: true,
},
};

// --------------------------------------
// Item metadata + equip helpers (GLOBAL)
// --------------------------------------

function getItemMetadata(item) {
  if (!item) return null;

  const base = ITEM_METADATA?.[item.id] || {};

  return {
    id: item.id,
    title: base.title || item.name || "Unknown Item",
    description:
      base.description ||
      "You’re not sure what this does yet. Maybe someone in Ravenwood knows.",
    icon: item.icon || base.icon || "",
    questItem: base.questItem === true,

    // ✅ unify on "slot"
    slot: base.slot || null, // head | neck | ring | feet | null

    // ✅ bonuses for stats
    bonuses: base.bonuses || {},
  };
}

function isEquippable(item) {
  const meta = getItemMetadata(item);
  return !!meta?.slot;
}

// ---------- STATS (DnD) → SUPABASE ----------

async function syncStatsToSupabase(stats) {
  const email = window.rwEmail;
  if (!email) return;

  try {
    const payload = stats || window.rwStats || null;

    const { error } = await supabaseClient
      .from("data")
      .update({ stats: payload })
      .eq("email", email);

    if (error) {
      console.error("Failed to sync stats:", error);
    }
  } catch (err) {
    console.error("Unexpected stats sync error:", err);
  }
}

// ---------- DnD-STYLE STATS CONFIG ----------
// We’ll use: Might, Agility, Will, Insight, Presence

const RW_BASE_STATS = {
  might: 8,
  agility: 8,
  will: 8,
  insight: 8,
  presence: 8,
};

// Per-archetype bonuses (Book 1 will eventually choose these)
const RW_ARCHETYPE_STATS = {
  "shadow-witch": {
    might: 1,
    agility: 2,
    will: 1,
    insight: 0,
    presence: 0,
  },
  "scholar-of-runes": {
    might: 0,
    agility: 0,
    will: 1,
    insight: 3,
    presence: 0,
  },
  "guardian-of-gates": {
    might: 3,
    agility: 0,
    will: 1,
    insight: 0,
    presence: 0,
  },
  "seer-of-moons": {
    might: 0,
    agility: 1,
    will: 1,
    insight: 2,
    presence: 0,
  },
};

// Per-affinity bonuses (stone / water / flame / wind)
const RW_AFFINITY_STATS = {
  stone: {
    might: 2,
    agility: 0,
    will: 1,
    insight: 0,
    presence: 0,
  },
  water: {
    might: 0,
    agility: 0,
    will: 1,
    insight: 1,
    presence: 1,
  },
  flame: {
    might: 1,
    agility: 1,
    will: 2,
    insight: 0,
    presence: 0,
  },
  wind: {
    might: 0,
    agility: 2,
    will: 0,
    insight: 1,
    presence: 0,
  },
};

// Avatar “family” bonuses – upgrades as you swap into different Ravenwood paths
// We key this off getAvatarFamily("f-shadow") -> "shadow", etc.
const RW_AVATAR_FAMILY_STATS = {
  default: {
    might: 0,
    agility: 0,
    will: 0,
    insight: 0,
    presence: 0,
  },
  shadow: {
    might: 0,
    agility: 1,
    will: 1,
    insight: 0,
    presence: 0,
  },
  mystic: {
    might: 0,
    agility: 0,
    will: 1,
    insight: 1,
    presence: 0,
  },
  moon: {
    might: 0,
    agility: 0,
    will: 0,
    insight: 1,
    presence: 1,
  },
  rune: {
    might: 0,
    agility: 0,
    will: 1,
    insight: 2,
    presence: 0,
  },
  guardian: {
    might: 2,
    agility: 0,
    will: 1,
    insight: 0,
    presence: 0,
  },
};

// Merge multiple stat blocks together
function mergeStatBlocks(...blocks) {
  const result = { ...RW_BASE_STATS };
  for (const block of blocks) {
    if (!block) continue;
    for (const key in result) {
      if (Object.prototype.hasOwnProperty.call(block, key)) {
        result[key] += block[key] || 0;
      }
    }
  }
  return result;
}

// ============================
// Ravenwood Dice System
// ============================

function rollCheck(stat, difficulty = 12) {
  const roll = Math.floor(Math.random() * 20) + 1;
  const bonus = window.rwChar?.stats?.[stat] || 0;
  const total = roll + bonus;

  return {
    roll,
    bonus,
    total,
    result:
      total >= difficulty + 5 ? "strong" :
      total >= difficulty     ? "partial" :
                                "fail"
  };
}

// Global flags for narrative outcomes
window.rwFlags = window.rwFlags || {};

// Compute stats for a character given archetype, affinity, and avatar
function computeStatsForCharacter(char, avatarKey) {
  const archetype = char?.archetype || null;
  const affinity = char?.affinity || null;

  const avatarFamily =
    getAvatarFamily(avatarKey) || "default"; // e.g. "shadow", "mystic", etc.

  const archetypeBlock = RW_ARCHETYPE_STATS[archetype] || null;
  const affinityBlock = RW_AFFINITY_STATS[affinity] || null;
  const avatarBlock =
    RW_AVATAR_FAMILY_STATS[avatarFamily] || RW_AVATAR_FAMILY_STATS.default;

  return mergeStatBlocks(archetypeBlock, affinityBlock, avatarBlock);
}

// Global recompute helper for whenever archetype / affinity / avatar changes
async function recomputeRavenwoodStats(save = true) {
  const char = window.rwChar || {};
  const key =
    window.rwAvatarKey ||
    char.avatar ||
    DEFAULT_AVATAR_FEMALE ||
    DEFAULT_AVATAR;

  const stats = computeStatsForCharacter(char, key);
  window.rwStats = stats;

  console.log("Ravenwood stats:", stats);

  if (save && typeof syncStatsToSupabase === "function") {
    await syncStatsToSupabase(stats);
  }

  return stats;
}

//

async function syncManaToSupabase() {
  const email = window.rwEmail;
  if (!email) return;
  try {
    const { error } = await supabaseClient
      .from("data")
      .update({ mana: window.rwMana ?? RW_MAX_MANA })
      .eq("email", email);

    if (error) {
      console.error("Failed to sync Mana:", error);
    }
  } catch (err) {
    console.error("Unexpected Mana sync error:", err);
  }
}

async function adjustHP(delta) {
  const amount = Number(delta) || 0;
  const current = typeof window.rwHP === "number" ? window.rwHP : RW_MAX_HP;

  let next = current + amount;
  if (next < 0) next = 0;
  if (next > RW_MAX_HP) next = RW_MAX_HP;

  window.rwHP = next;
  updateHpManaDisplays();

  // Save the new HP
  await syncHpToSupabase();

  // If HP hits 0, trigger the “wake in the square” flow
  if (next === 0 && typeof window.rwHandleHpZero === "function") {
    window.rwHandleHpZero();
  }
}

async function adjustMana(delta) {
  const amount = Number(delta) || 0;
  window.rwMana = Math.max(0, Math.min(RW_MAX_MANA, (window.rwMana ?? RW_MAX_MANA) + amount));
  updateHpManaDisplays();
  await syncManaToSupabase();
}

// expose helpers for quests, battles, etc.
window.rwAdjustHP = adjustHP;
window.rwAdjustMana = adjustMana;

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

  // 🔮 Restart the ink animation each time we render a page
  bodyEl.classList.remove("rw-ink-animate");
  // Force reflow so the animation can restart
  void bodyEl.offsetWidth;
  bodyEl.classList.add("rw-ink-animate");
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

// ----------------------------
// Ravenwood Shop Inventory (live 4×4 grid)
// ----------------------------

// 16 slots (4x4), null = empty
let rwShopItems = new Array(16).fill(null);
// current interaction mode for the shop: "buy" or "sell"
window.rwShopMode = "buy";
let rwShopLoaded = false;

// Regenerating shop stock (per player/session)
// Regenerating shop stock (per player/session)
const SHOP_STOCK_CONFIG = {
  health_potion: {
    maxVisible: 3,                 // total available at once
    restockDelayMs: 3 * 60 * 1000, // 3 minutes; tweak as you like
  },
};

let rwHealthPotionRestockTimer = null;

// Ensure the shop has exactly ONE slot for health potions,
// with quantity up to maxVisible
function seedHealthPotionSlots() {
  const cfg = SHOP_STOCK_CONFIG.health_potion;
  if (!cfg) return;

  // Find an existing potion slot, if any
  let potionIndex = rwShopItems.findIndex(
    (it) => it && it.id === "health_potion"
  );

  // If no slot yet, create one in the first empty slot
  if (potionIndex === -1) {
    potionIndex = rwShopItems.findIndex((it) => it === null);
    if (potionIndex === -1) return; // no free slots at all

    rwShopItems[potionIndex] = {
      id: "health_potion",
      name: "Minor Health Potion",
      icon: "item-health-potion.png",
      price: 8,
      sellPrice: 4,
      questItem: false,
      quantity: cfg.maxVisible, // start with full stack
    };
  } else {
    // If we already have a potion slot, just top it back up
    const entry = rwShopItems[potionIndex];
    const currentQty = entry.quantity || 1;
    if (currentQty < cfg.maxVisible) {
      entry.quantity = cfg.maxVisible;
    }
  }
}

// When all potions are bought, schedule a restock after a delay
function scheduleHealthPotionRestock() {
  const cfg = SHOP_STOCK_CONFIG.health_potion;
  if (!cfg) return;

  // If any potions are still visible, do nothing
  const visible = rwShopItems.filter(
    (it) => it && it.id === "health_potion"
  ).length;
  if (visible > 0) return;

  // Already waiting to restock?
  if (rwHealthPotionRestockTimer) return;

  rwHealthPotionRestockTimer = setTimeout(() => {
    rwHealthPotionRestockTimer = null;
    seedHealthPotionSlots();
    renderShopGrid();
  }, cfg.restockDelayMs);
}

// current interaction mode for the shop: "buy" or "sell"
window.rwShopMode = "buy";

// Swap between the front view and the shelves view with grid
function setShopVisual(view) {
  const frontImg = document.getElementById("rwShopImageFront");
  const shelvesImg = document.getElementById("rwShopImageShelves");
  const grid = document.getElementById("rwShopGrid");

  if (!frontImg || !shelvesImg || !grid) return;

  if (view === "shelves") {
    frontImg.classList.add("d-none");
    shelvesImg.classList.remove("d-none");
    grid.classList.remove("d-none");
  } else {
    // default / front view
    frontImg.classList.remove("d-none");
    shelvesImg.classList.add("d-none");
    grid.classList.add("d-none");
  }
}

// Pull items from Supabase (uses item_* columns)
// Pull items from Supabase (uses item_* columns), but always
// fall back to local regenerating potions even if Supabase fails.
async function loadShopFromSupabase() {
  // Start with a clean 16-slot array every time
  rwShopItems = new Array(16).fill(null);

  try {
    const { data, error } = await supabaseClient
      .from("shop_items")
      .select("*")
      .eq("enabled", true)
      .order("slot_index", { ascending: true });

    if (error) {
      console.error("Failed to load shop items:", error);
      // DON'T return here — we still want to seed potions below
    } else if (Array.isArray(data)) {
      data.forEach((row) => {
        // If you don't have this table yet, this is harmless.
        // When you DO add it, use whatever columns you like here.
        const idx = typeof row.slot_index === "number" ? row.slot_index : -1;
        if (idx >= 0 && idx < rwShopItems.length) {
          rwShopItems[idx] = {
            id: row.item_id || row.id || `item_${idx}`,
            name: row.name || "Mysterious Item",
            icon: row.icon || "",
            price: row.price ?? 10,
            sellPrice: row.sell_price ?? 5,
            questItem: !!row.quest_item,
          };
        }
      });
    }
  } catch (err) {
    console.error("Unexpected shop load error:", err);
    // Again, we don't return — we still seed potions
  }

  // ✅ ALWAYS make sure the regenerating potions exist
  seedHealthPotionSlots();

  rwShopLoaded = true;
}

// Figure out what an item can be sold for.
// - Quest items (questItem: true) are NEVER sellable.
// - Prefer the shop's sellPrice field.
// - Fallback: half of an item.price stored on the inventory item itself.
function getItemSellPrice(item) {
  if (!item) return null;

  const meta = getItemMetadata(item);
  if (meta && meta.questItem) {
    return null; // cannot sell quest items
  }

  // Try to find a matching shop definition
  const shopDef = rwShopItems.find((slot) => slot && slot.id === item.id);
  if (shopDef && typeof shopDef.sellPrice === "number") {
    return shopDef.sellPrice;
  }

  // Fallback: if the item itself knows its price
  if (typeof item.price === "number") {
    return Math.floor(item.price / 2);
  }

  return null;
}

// Draw the 4×4 shop grid (same idea as backpack)
function renderShopGrid(items = rwShopItems) {
  const grid = document.getElementById("rwShopGrid");
  if (!grid) return;

  grid.innerHTML = "";

  const maxSlots = 16;
  for (let i = 0; i < maxSlots; i++) {
    const slot = document.createElement("div");
    slot.className = "rw-shop-slot";

    const item = items[i];

    if (item && item.icon) {
      const img = document.createElement("img");
      img.src = item.icon;
      img.alt = item.name || "Item";

      img.addEventListener("click", () => {
        showShopItemOptions(item);
      });

      slot.appendChild(img);

      // 🔢 Show stack size if > 1
      const qty = item.quantity || 1;
      if (qty > 1) {
        const badge = document.createElement("span");
        badge.className = "rw-inventory-qty"; // reuse your existing badge style
        badge.textContent = qty;
        slot.appendChild(badge);
      }
    }

    grid.appendChild(slot);
  }
}

function showShopItemOptions(item) {
  const dialog = document.getElementById("rwShopDialog");
  const buyBtn = document.getElementById("rwShopBuyBtn");

  if (dialog) {
    dialog.textContent =
      `The shopkeeper whispers: “${item.name}… Yours for ${item.price} coins.” ` +
      `He taps the counter.`;
  }

  if (buyBtn) {
    // Change the label so it's obvious this will buy the selected item
    buyBtn.textContent = `Buy for ${item.price} coin${item.price === 1 ? "" : "s"}`;

    buyBtn.onclick = async () => {
      await attemptShopPurchase(item);

      // After buying, you can either leave it as "Buy" or restore the old label.
      // If you want to restore:
      // buyBtn.textContent = "Browse Wares";
    };
  }
}

async function attemptShopPurchase(item) {
  const price = Number(item.price) || 0;

  if ((window.rwCoins || 0) < price) {
    const dialog = document.getElementById("rwShopDialog");
    if (dialog) {
      dialog.textContent =
        "The shopkeeper chuckles softly… “You can’t afford that.”";
    }
    return;
  }

  // Deduct coins (already syncs to Supabase)
    // Deduct coins (already syncs to Supabase)
  await addCoins(-price);

  // Add item to inventory (this uses your existing inventory + syncInventoryToSupabase)
  const inv = window.rwInventory || [];
  inv.push({
    id: item.id,
    name: item.name,
    icon: item.icon,
    price: item.price, // NEW: remember what you paid
  });

  window.rwInventory = inv;

  await syncInventoryToSupabase(inv);

  const dialog = document.getElementById("rwShopDialog");
  if (dialog) {
    dialog.textContent = `“A fine choice,” the shopkeeper murmurs.`;
  }

  // If this was a regenerating-stock potion, remove one copy from the shelves
    if (item.id === "health_potion") {
    const idx = rwShopItems.findIndex((slot) => slot === item);
    if (idx !== -1) {
      const entry = rwShopItems[idx];
      const currentQty = entry.quantity || 1;

      if (currentQty > 1) {
        // Just reduce the stack by 1
        entry.quantity = currentQty - 1;
      } else {
        // Last one: clear the slot
        rwShopItems[idx] = null;
        scheduleHealthPotionRestock();
      }
    }

    renderShopGrid();
  }

  renderInventory(inv);
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
          <h5 class="modal-title text-light" id="rwItemMenuTitle">Item</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
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
          <h5 class="modal-title text-light" id="rwItemDescTitle">Item</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
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
async function handleItemUse(item, context) {
  const ctx = context || {};

  // ✅ Equipment context: "Use" == Equip
  if (ctx.origin === "equipment") {
    if (!isEquippable(item)) {
      alert("That can’t be equipped.");
      return;
    }
    if (typeof window.equipItemFromInventory !== "function") {
  console.error("equipItemFromInventory is not available (not exported yet).");
  alert("Equip system not ready yet.");
  return;
}
await window.equipItemFromInventory(item);

    return;
  }

  // In the book, delegate to the book engine handler
  if (ctx.origin === "book" && typeof window.rwBookHandleItemUse === "function") {
    window.rwBookHandleItemUse(item);
    return;
  }

  // 🧪 Potion logic unchanged...
  if (item.id === "health_potion") {
    if (typeof window.rwAdjustHP === "function") {
      await window.rwAdjustHP(+20);
    }
    if (typeof window.rwRemoveOneFromInventory === "function") {
      await window.rwRemoveOneFromInventory(item.id);
    }
    alert("You drink the potion. Warmth blooms in your chest. (+20 HP)");
    return;
  }

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
            img.addEventListener("click", () => {
  // Shop sell mode stays the same
  if (
    window.rwShopMode === "sell" &&
    typeof window.rwShopSellHandler === "function"
  ) {
    window.rwShopSellHandler(item);
    return;
  }

  // Check if this item is equipable
  const slotType = getEquipSlotForItem(item);

  if (slotType) {
    const meta = getItemMetadata(item);

    const choice = window.prompt(
      `${meta.title}\n\nType:\n- equip\n- desc`
    );
    if (!choice) return;

    if (choice.toLowerCase().startsWith("e")) {
      if (typeof window.equipItemFromInventory === "function") {
  window.equipItemFromInventory(item);
} else {
  console.error("equipItemFromInventory missing on window");
}

    } else {
      showItemDescription(item);
    }
    return;
  }

  // Non-equipables (potions, etc.)
  if (typeof window.rwOpenItemMenu === "function") {
    window.rwOpenItemMenu(item, { origin: "world" });
  }
});
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

  function collapseInventoryStacks(items) {
    if (!Array.isArray(items)) return [];

    const byId = new Map();

    for (const item of items) {
      if (!item || !item.id) continue;

      const key = item.id;
      const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;

      if (byId.has(key)) {
        const existing = byId.get(key);
        existing.quantity = (existing.quantity || 1) + qty;
      } else {
        byId.set(key, {
          id: item.id,
          name: item.name || "Unknown item",
          icon: item.icon || "",
          quantity: qty,
        });
      }
    }

    return Array.from(byId.values());
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
// ---------- PAGE INIT: CREATE (SIGN-UP) ----------
function initCreatePage() {
  // Only run this logic on the create page
  if (document.body.dataset.page !== "create") return;

  const form = document.getElementById("characterForm");
  const statusEl = document.getElementById("rwStatus");
  if (!form) return;

  function setStatus(msg, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.classList.remove("text-danger", "text-success", "d-none");
    statusEl.classList.add(isError ? "text-danger" : "text-success");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const displayName = document.getElementById("displayName")?.value.trim();
    const email = document.getElementById("email")?.value.trim().toLowerCase();
    const password = document.getElementById("password")?.value;
    const familiarName = document.getElementById("familiarName")?.value.trim();

    const genderInput = document.querySelector("input[name='gender']:checked");
    const gender = genderInput ? genderInput.value : null;

    // 🔹 Only require: name, email, password, gender
    if (!displayName || !email || !password || !gender) {
      setStatus(
        "Please fill in your name, email, password, and how Ravenwood first sees you.",
        true
      );
      return;
    }

    setStatus("Consulting the wards...");

    try {
      // 1) Create auth user
      const { data, error: authError } = await supabaseClient.auth.signUp({
        email,
        password,
      });
      if (authError) throw authError;

      // 2) Decide starting avatar (default class)
      const avatar =
        gender === "male" ? DEFAULT_AVATAR_MALE : DEFAULT_AVATAR_FEMALE;

              // 🔹 Starting stats: no archetype/affinity yet, just base + avatar family
      const tempCharForStats = { archetype: null, affinity: null };
      const startingStats = computeStatsForCharacter(tempCharForStats, avatar);

      // 3) Build character row for the 'data' table
      const payload = {
        email,
        display_name: displayName,
        familiar_name: familiarName || null,

        gender,

        // Book I will set these later
        archetype: null,
        affinity: null,

        // Starting avatar + unlock list
        avatar,
        unlocked_avatars: [avatar],

        // 🔹 DnD-style stats saved in Supabase
        stats: startingStats,

        // HP only at start; mana is locked
        hp: 100,
        mana: 0,
        mana_unlocked: false,

        coins: 0,
        location_key: "square",
        secrets: [],
        inventory: [],
        journal_entries: [],

        manor_unlocked: false,
        intro_seen: false,
        manor_intro_seen: false,
        inventory_intro_seen: false,

        book1_started: false,
        book1_last_page: null,
        book1_completed: false,
      };

      await createCharacterOnSupabase(payload);

      // Remember email and go to Ravenwood
      window.rwEmail = email;
      saveEmail(email);

      setStatus("The gates of Ravenwood open…");
      window.location.href = "ravenwood.html";
    } catch (err) {
      console.error("Create error:", err);
      setStatus(
        err?.message ||
          "Something went wrong while creating your Ravenwood self.",
        true
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

// --------------------------------------
// Avatar Locking (only allow unlocked avatars)
// --------------------------------------

function getUnlockedAvatars() {
  const list = window.rwUnlockedAvatars;
  if (Array.isArray(list) && list.length) return list;

  // fallback: at least the current avatar (or default)
  const current =
    window.rwAvatarKey ||
    window.rwChar?.avatar ||
    DEFAULT_AVATAR_FEMALE ||
    DEFAULT_AVATAR;

  return [current];
}

function applyAvatarLocks() {
  const unlocked = getUnlockedAvatars();

  // Your modal uses radio inputs like: <input name="rwAvatarChoice" value="f-mystic" ...>
  const inputs = document.querySelectorAll('input[name="rwAvatarChoice"]');
  if (!inputs.length) return;

  inputs.forEach((input) => {
    const key = input.value;
    const isUnlocked = unlocked.includes(key);

    input.disabled = !isUnlocked;

    const label = input.closest("label") || input.parentElement;
    if (label) {
      label.classList.toggle("rw-avatar-locked", !isUnlocked);
      label.title = isUnlocked ? "" : "Locked";
    }
  });

  // If the currently checked option is locked, force-select the first unlocked option
  const checked = document.querySelector('input[name="rwAvatarChoice"]:checked');
  if (checked && checked.disabled) {
    const firstUnlocked = Array.from(inputs).find((i) => !i.disabled);
    if (firstUnlocked) firstUnlocked.checked = true;
  }
}

// Hard enforcement on save (prevents DOM hacks)
function validateAvatarChoiceOrWarn(chosenKey) {
  const unlocked = getUnlockedAvatars();
  if (!chosenKey || !unlocked.includes(chosenKey)) {
    alert("That avatar is still locked.");
    return false;
  }
  return true;
}

// ---------- PAGE INIT: WORLD (MAIN HUB / TOWN) ----------
async function initWorldPage() {
  const nameEl = $("#rwUserName");
  const archEl = $("#rwUserArchetype");
    // We'll keep the full character object around for later helpers
  let currentChar = null;

    // ---------- DnD-Style STATS CONFIG ----------

  // Neutral baseline before Book I decides archetype/affinity
  const DEFAULT_BASE_STATS = {
    pre_awaken: {
      might: 8,
      agility: 8,
      will: 8,
      insight: 8,
      presence: 8,
    },

    // Once archetype is chosen, these become the "class" baselines:
    "shadow-witch": {
      might: 8,
      agility: 12,
      will: 12,
      insight: 10,
      presence: 9,
    },
    "scholar-of-runes": {
      might: 7,
      agility: 8,
      will: 11,
      insight: 13,
      presence: 9,
    },
    "guardian-of-gates": {
      might: 12,
      agility: 8,
      will: 11,
      insight: 8,
      presence: 8,
    },
    "seer-of-moons": {
      might: 7,
      agility: 9,
      will: 10,
      insight: 12,
      presence: 11,
    },
  };

  // Elemental affinity tweaks layered on top of base
  const AFFINITY_MODS = {
    stone: {
      might: +1,
      will: +1,
    },
    water: {
      insight: +1,
      presence: +1,
    },
    flame: {
      will: +2,
      insight: -1,
    },
    wind: {
      agility: +2,
      presence: +1,
      might: -1,
    },
  };

  function computeStartingStatsFor(char) {
    const arche = char?.archetype || null;
    const affinity = char?.affinity || null;

    const base =
      DEFAULT_BASE_STATS[arche || "pre_awaken"] ||
      DEFAULT_BASE_STATS.pre_awaken;

    const mods = AFFINITY_MODS[affinity] || {};

    const result = {
      might: base.might,
      agility: base.agility,
      will: base.will,
      insight: base.insight,
      presence: base.presence,
    };

    for (const [key, delta] of Object.entries(mods)) {
      result[key] = (result[key] || 0) + delta;
    }

    return result;
  }

  // Recompute stats from current character (used now + by Book I later)
  async function rwRecomputeStats(saveToSupabase = false) {
  const char = window.rwChar || currentChar || {};

  // your existing base computation
  const base = computeStartingStatsFor(char);

  // ✅ add equipment bonuses
  const equipBonus = computeEquipmentBonuses(window.rwEquipped || {});
  const finalStats = addStatBlocks(base, equipBonus);

  window.rwStats = finalStats;

  if (saveToSupabase) {
    await syncStatsToSupabase(finalStats);
  }

  return finalStats;
}

  // Make it available globally (book-1, etc.)
  window.rwRecomputeStats = rwRecomputeStats;

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

    const fallbackPayload = {
      email,
      display_name: email.split("@")[0] || "Wanderer",
      archetype: "shadow-witch",
      affinity: "stone",
      familiar_name: null,
      avatar: DEFAULT_AVATAR,
      created_at: new Date().toISOString(),

      coins: 0,
      hp: 100,
      mana: 100,
      secrets: [],
      inventory: [],
      journal_entries: [],
      location_key: "square",
      manor_unlocked: false,
      intro_seen: false,
      manor_intro_seen: false,
      inventory_intro_seen: false,
      book1_started: false,
      book1_last_page: null,
    };

    // 🔹 Compute starting stats for the fallback too
    const tempCharForStats = {
      archetype: fallbackPayload.archetype,
      affinity: fallbackPayload.affinity,
    };
    fallbackPayload.stats = computeStatsForCharacter(
      tempCharForStats,
      fallbackPayload.avatar
    );

    // Create the missing row
    char = await createCharacterOnSupabase(fallbackPayload);
  }

    // ---------- CHARACTER STATS SHEET ----------

  function getReadableArchetype(code) {
    if (!code) return "Undecided";
    const map = {
      "shadow-witch": "Shadow Witch",
      "scholar-of-runes": "Scholar of Runes",
      "guardian-of-gates": "Guardian of Gates",
      "seer-of-moons": "Seer of Moons",
    };
    return map[code] || String(code);
  }

  function getReadableAffinity(code) {
    if (!code) return "Undecided";
    const map = {
      stone: "Stone · Wards & Foundations",
      water: "Water · Memory & Dream",
      flame: "Flame · Will & Transformation",
      wind: "Wind · Messages & Thresholds",
    };
    return map[code] || String(code);
  }

  function renderStatsSheet() {
    const char = window.rwChar || {};
    const stats = window.rwStats || {};

    // Header bits
    const nameEl = document.getElementById("rwStatsName");
    const archEl = document.getElementById("rwStatsArchetype");
    const affEl = document.getElementById("rwStatsAffinity");

    if (nameEl) nameEl.textContent = char.display_name || "Wanderer";
    if (archEl) archEl.textContent = getReadableArchetype(char.archetype);
    if (affEl) affEl.textContent = getReadableAffinity(char.affinity);

    // Core numeric stats
    const might = stats.might ?? 0;
    const agility = stats.agility ?? 0;
    const will = stats.will ?? 0;
    const insight = stats.insight ?? 0;
    const presence = stats.presence ?? 0;

    const setValue = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value);
    };

    setValue("rwStatMight", might);
    setValue("rwStatAgility", agility);
    setValue("rwStatWill", will);
    setValue("rwStatInsight", insight);
    setValue("rwStatPresence", presence);

    // Derived fluff from HP + Mana
    const hp = typeof window.rwHP === "number" ? window.rwHP : RW_MAX_HP;
    const mana =
      typeof window.rwMana === "number" ? window.rwMana : RW_MAX_MANA;

    const vitEl = document.getElementById("rwStatVitalityNote");
    const manaEl = document.getElementById("rwStatManaNote");

    if (vitEl) {
      vitEl.textContent = `Current HP: ${hp} / ${RW_MAX_HP} — your body’s ability to keep walking after bad decisions.`;
    }

    if (manaEl) {
      if (char.mana_unlocked === true) {
        manaEl.textContent = `Current Mana: ${mana} / ${RW_MAX_MANA} — how much spellwork your nerves can hold before they fray.`;
      } else {
        manaEl.textContent =
          "Mana is still dormant. Book I will decide how and when it wakes in you.";
      }
    }
  }

  const statsBtn = document.getElementById("rwStatsBtn");
  const statsModalEl = document.getElementById("rwStatsModal");
  let statsModal = null;

  if (statsModalEl && window.bootstrap && window.bootstrap.Modal) {
    statsModal = new bootstrap.Modal(statsModalEl);
  }

  if (statsBtn && statsModal) {
    statsBtn.addEventListener("click", async () => {
      // Make sure we have the latest stats (in case archetype/affinity changed)
      if (typeof window.rwRecomputeStats === "function") {
        await window.rwRecomputeStats(true);
      }
      renderStatsSheet();
      statsModal.show();
    });
  }

function removeOneFromInventoryLocal(itemId) {
  const inv = window.rwInventory || [];
  const idx = inv.findIndex((i) => i && i.id === itemId);
  if (idx === -1) return false;

  const entry = inv[idx];
  const qty = entry.quantity || 1;

  if (qty > 1) entry.quantity = qty - 1;
  else inv.splice(idx, 1);

  window.rwInventory = inv;
  return true;
}

function addOneToInventoryLocal(item) {
  if (!item?.id) return;
  // reuse your existing stack logic if you want:
  if (typeof window.addItemToInventory === "function") {
    window.addItemToInventory({ ...item, quantity: 1 });
    return;
  }
  // minimal fallback:
  const inv = window.rwInventory || [];
  inv.push({ id: item.id, name: item.name, icon: item.icon, quantity: 1 });
  window.rwInventory = inv;
}

function chooseRingSlot(equipped) {
  if (!equipped.ring_left) return "ring_left";
  if (!equipped.ring_right) return "ring_right";
  return "ring_left"; // both filled → swap left by default
}

async function equipItemFromInventory(item) {
  const slotType = getEquipSlotForItem(item); // "head" | "neck" | "ring" | "feet" | null
  if (!slotType) {
    alert("That item can’t be equipped.");
    return;
  }

  const equipped = window.rwEquipped || {
    head: null, neck: null, ring_left: null, ring_right: null, feet: null
  };

  const slot =
    slotType === "ring" ? chooseRingSlot(equipped) : slotType;

  // remove one from inventory first
  const removed = removeOneFromInventoryLocal(item.id);
  if (!removed) return;

  // swap: if something already equipped, put it back in inventory
  const previous = equipped[slot];
  if (previous) addOneToInventoryLocal(previous);

  // equip the clicked item (store minimal shape)
  equipped[slot] = {
    id: item.id,
    name: item.name,
    icon: item.icon,
  };

  window.rwEquipped = equipped;

  // ✅ sync both + refresh UI + recompute stats
  await syncInventoryToSupabase(window.rwInventory || []);
  await syncEquippedToSupabase(equipped);

  renderInventory(window.rwInventory || []);
  renderEquipment();

  if (typeof window.rwRecomputeStats === "function") {
    await window.rwRecomputeStats(true);
  }
}

// 🔥 Make it callable from global handlers (handleItemUse, inventory menu, etc.)
window.equipItemFromInventory = equipItemFromInventory;

async function unequipSlot(slotKey) {
  const equipped = window.rwEquipped || {};
  const item = equipped[slotKey];
  if (!item) return;

  // move back to inventory
  addOneToInventoryLocal(item);
  equipped[slotKey] = null;

  window.rwEquipped = equipped;

  await syncInventoryToSupabase(window.rwInventory || []);
  await syncEquippedToSupabase(equipped);

  renderInventory(window.rwInventory || []);
  renderEquipment();

  if (typeof window.rwRecomputeStats === "function") {
    await window.rwRecomputeStats(true);
  }
}

  // ---------- Equipment wiring ----------
const equipmentBtn = document.getElementById("rwEquipmentBtn");
const equipmentModalEl = document.getElementById("rwEquipmentModal");
let equipmentModal = null;

// equipped state (start with nothing)
window.rwEquipped = window.rwEquipped || {
  head: null,
  cloak: null,
  neck: null,
  ring_left: null,
  ring_right: null,
  feet: null,
};

function renderEquipInventoryGrid() {
  const grid = document.getElementById("rwEquipInventoryGrid");
  if (!grid) return;

  grid.innerHTML = "";

  const equippables = (inventory || []).filter((it) => it && isEquippable(it));

  // Reuse the same slot look as inventory
  equippables.forEach((item) => {
    const slot = document.createElement("div");
    slot.className = "rw-inventory-slot";

    const meta = getItemMetadata(item);

    if (item.icon) {
      const img = document.createElement("img");
      img.src = item.icon;
      img.alt = item.name || meta.title || "Item";
      img.className = "rw-inventory-item-icon";

      // ✅ Clicking opens Use/Description menu, but in equipment context
      img.addEventListener("click", () => {
        window.rwOpenItemMenu(item, { origin: "equipment" });
      });

      slot.appendChild(img);
    }

    if (item.quantity && item.quantity > 1) {
      const badge = document.createElement("span");
      badge.className = "rw-inventory-qty";
      badge.textContent = item.quantity;
      slot.appendChild(badge);
    }

    grid.appendChild(slot);
  });

  // Fill to 16 if you want consistent layout (optional)
  const maxSlots = 16;
  for (let i = equippables.length; i < maxSlots; i++) {
    const empty = document.createElement("div");
    empty.className = "rw-inventory-slot";
    grid.appendChild(empty);
  }
}

function renderEquipment() {
  const frame = document.querySelector("#rwEquipmentModal .rw-equip-frame");
  if (!frame) return;

  const slots = frame.querySelectorAll(".rw-equip-slot");
  slots.forEach((slotBtn) => {
    const slotKey = slotBtn.getAttribute("data-slot");
    const equippedItem = window.rwEquipped?.[slotKey] || null;

    slotBtn.innerHTML = "";

    if (equippedItem?.icon) {
      const img = document.createElement("img");
      img.src = equippedItem.icon;
      img.alt = equippedItem.name || "Equipped item";
      slotBtn.appendChild(img);
    }

    // ✅ click behavior:
    slotBtn.onclick = () => {
      if (!equippedItem) {
        alert("Nothing equipped yet.");
        return;
      }

      const meta = getItemMetadata(equippedItem);
      const choice = window.prompt(
        `${meta.title}\n\nType:\n- unequip\n- desc`
      );

      if (!choice) return;
      const c = choice.toLowerCase();

      if (c.startsWith("u")) {
        unequipSlot(slotKey);
      } else {
        showItemDescription(equippedItem);
      }
    };
  });
}

if (equipmentModalEl && window.bootstrap && bootstrap.Modal) {
  equipmentModal = new bootstrap.Modal(equipmentModalEl);
}

if (equipmentBtn && equipmentModal) {
  equipmentBtn.addEventListener("click", () => {
    renderEquipment();
    renderEquipInventoryGrid(); // ✅ NEW
    equipmentModal.show();
  });
}

// Optional: clicking a slot currently just tells you it's empty
document.addEventListener("click", (e) => {
  const btn = e.target.closest?.(".rw-equip-slot");
  if (!btn) return;

  const slotKey = btn.getAttribute("data-slot");
  const hasItem = !!window.rwEquipped?.[slotKey];

  if (!hasItem) {
    // keep it simple for now
    const msg = document.createElement("div");
    msg.className = "small text-muted mt-2";
    msg.textContent = "Nothing equipped yet.";
    // no-op (quiet) — you can later replace this with an equip picker
  }
});

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

window.rwEquipped = (char.equipped && typeof char.equipped === "object")
  ? {
      head: char.equipped.head || null,
      neck: char.equipped.neck || null,
      ring_left: char.equipped.ring_left || null,
      ring_right: char.equipped.ring_right || null,
      feet: char.equipped.feet || null,
    }
  : { head: null, neck: null, ring_left: null, ring_right: null, feet: null };


// Load coins from Supabase (default to 0 if missing)
window.rwCoins =
  typeof char.coins === "number" && !Number.isNaN(char.coins)
    ? char.coins
    : 0;
updateCoinDisplay();

// HP & Mana from Supabase (default to 100 if missing)
window.rwHP =
  typeof char.hp === "number" && !Number.isNaN(char.hp) ? char.hp : 100;
window.rwMana =
  typeof char.mana === "number" && !Number.isNaN(char.mana)
    ? char.mana
    : 0; // start with no mana until Book I unlocks it

    // 🔹 Stats from Supabase (or compute defaults if missing)
if (char.stats && typeof char.stats === "object") {
  window.rwStats = char.stats;
  console.log("Loaded stats from Supabase:", window.rwStats);
} else if (typeof window.rwRecomputeStats === "function") {
  // Older rows without stats will get them now
  window.rwRecomputeStats(true);
}

// draw meters
updateHpManaDisplays();

  // ---------- STATS BOOTSTRAP ----------
  // If Supabase already has stats, use them.
  // Otherwise, compute starting stats and save them once.
  // Always recompute once at boot so equipment applies.
// If you want to trust Supabase first, you can still load it, then recompute.
await window.rwRecomputeStats(true);


// 🔒 Show or hide the Mana meter depending on unlock flag
const manaContainer = document.getElementById("rwManaContainer");
if (manaContainer) {
  if (char.mana_unlocked === true) {
    manaContainer.classList.remove("rw-hidden");
  } else {
    manaContainer.classList.add("rw-hidden");
  }
}

  // 🔹 If Book I has been started, show a "Continue" button
  const bookContinueBtn = document.getElementById("rwBook1ContinueBtn");
  if (bookContinueBtn && char.book1_started === true) {
    bookContinueBtn.classList.remove("d-none");
    bookContinueBtn.addEventListener("click", () => {
      window.location.href = "book-1.html";
    });
  }

  // ---------- MAP SHOW / HIDE ----------

// ---------- MAP SHOW / HIDE ----------

const toggleBtn = document.getElementById("rwToggleMapBtn");
const mapWrapper = document.getElementById("rwMapWrapper");

if (toggleBtn && mapWrapper) {
  // 📱 Start hidden on mobile only
  let mapVisible = window.innerWidth >= 768;

  mapWrapper.classList.toggle("d-none", !mapVisible);
  toggleBtn.textContent = mapVisible ? "Hide Map" : "Show Map";

  toggleBtn.addEventListener("click", () => {
    mapVisible = !mapVisible;
    mapWrapper.classList.toggle("d-none", !mapVisible);
    toggleBtn.textContent = mapVisible ? "Hide Map" : "Show Map";
  });
}
;

// -------------------------------------
// Continue with avatar setup, map setup,
// intro modal check, etc.
// -------------------------------------

  // Remove outdated localStorage manor flag (Supabase is the source of truth now)
  localStorage.removeItem("ravenwoodManorUnlocked");

  // Stash identity + current progress for helpers
  window.rwEmail = email;
  window.rwInitialSecrets = Array.isArray(char.secrets) ? char.secrets : [];
      // Raw inventory from Supabase
  const rawInventory = Array.isArray(char.inventory) ? char.inventory : [];

  // Collapse duplicate ids into stacks (so old data like 3 separate potions → 1 stack of 3)
  const collapsedInventory = collapseInventoryStacks(rawInventory);

  window.rwInitialInventory = collapsedInventory;

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
  if (!char.archetype) {
    // No archetype yet — hide it until Book 1 decides
    archEl.textContent = "";
    archEl.classList.add("d-none");
  } else {
    const map = {
      "shadow-witch": "Shadow Witch",
      "scholar-of-runes": "Scholar of Runes",
      "guardian-of-gates": "Guardian of Gates",
      "seer-of-moons": "Seer of Moons",
    };
    archEl.textContent = map[char.archetype] || String(char.archetype);
    archEl.classList.remove("d-none");
  }
}

  // Avatar from DB (fallback to default)
    // Avatar from DB (fallback to default)
  avatarKey = char.avatar || DEFAULT_AVATAR;

  window.rwAvatarKey = avatarKey; // 🔹 remember for stat calculations
  applyAvatar(navAvatarEl);
  applyAvatar(summaryAvatarEl);

  // ✅ pull unlocked avatar list from Supabase row
window.rwUnlockedAvatars = Array.isArray(char.unlocked_avatars)
  ? char.unlocked_avatars
  : [avatarKey]; // safe fallback

// (optional) guarantee current avatar is always allowed
if (!window.rwUnlockedAvatars.includes(avatarKey)) {
  window.rwUnlockedAvatars.push(avatarKey);
}

  // Snapshot on the right
  const summaryName = $("#rwSummaryName");
  const summaryArch = $("#rwSummaryArchetype");
  const summaryAffinity = $("#rwSummaryAffinity");

  if (summaryName) summaryName.textContent = char.display_name;
  if (summaryArch) {
  if (!char.archetype) {
    summaryArch.textContent = "";
    summaryArch.classList.add("d-none");
  } else {
    // Reuse whatever the navbar is showing
    summaryArch.textContent = archEl ? archEl.textContent : "";
    summaryArch.classList.remove("d-none");
  }
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
  // ✅ Apply locks first (disables radio choices that aren't unlocked)
  applyAvatarLocks();

  // Then check the current avatar (if it's unlocked)
  const radios = avatarModalEl.querySelectorAll("input[name='rwAvatarChoice']");
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
  const selected = avatarModalEl.querySelector("input[name='rwAvatarChoice']:checked");
  if (!selected) return;

  const newAvatar = selected.value;

  // ✅ block locked avatar saves
  if (!validateAvatarChoiceOrWarn(newAvatar)) return;

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
    window.rwAvatarKey = newAvatar;
    applyAvatar(navAvatarEl);
    applyAvatar(summaryAvatarEl);

    if (typeof window.rwRecomputeStats === "function") {
      window.rwRecomputeStats(true);
    }

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
    // Local inventory state for this page, seeded from Supabase
  let inventory = Array.isArray(window.rwInitialInventory)
    ? window.rwInitialInventory
    : [];

  // 🔁 Keep a global mirror so the shop / other systems see the same array
  window.rwInventory = inventory;

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

    const maxStack = 10;

    // Remove exactly one of an item from the inventory
    async function removeOneFromInventory(itemId) {
      if (!itemId) return;

      const inv = inventory; // same array as window.rwInventory

      const idx = inv.findIndex((i) => i && i.id === itemId);
      if (idx === -1) return;

      const entry = inv[idx];
      const qty = entry.quantity || 1;

      if (qty > 1) {
        entry.quantity = qty - 1;
      } else {
        inv.splice(idx, 1);
      }

      window.rwInventory = inv;
      renderInventory(inv);
      await syncInventoryToSupabase(inv);
    }

    // expose so item-use logic can call it
    window.rwRemoveOneFromInventory = removeOneFromInventory;

    // Work from the in-memory copy (already seeded from Supabase)
    const inv = inventory;

    // normalize old items that don't have a quantity yet
    inv.forEach((i) => {
      if (i && (i.quantity == null || i.quantity < 1)) {
        i.quantity = 1;
      }
    });

    // Did we already have *any* stack of this item id?
    const hadAnyStack = inv.some((i) => i && i.id === newItem.id);

    let remaining = newItem.quantity || 1;

    // 1) Fill existing stacks up to maxStack
    for (const entry of inv) {
      if (!remaining) break;
      if (!entry || entry.id !== newItem.id) continue;

      const currentQty = entry.quantity || 1;
      if (currentQty >= maxStack) continue;

      const space = maxStack - currentQty;
      const toAdd = Math.min(space, remaining);

      entry.quantity = currentQty + toAdd;
      remaining -= toAdd;
    }

    // 2) If there's still some left, create new stacks (also capped at 10)
    while (remaining > 0) {
      const qty = Math.min(maxStack, remaining);
      inv.push({
        id: newItem.id,
        name: newItem.name || "Unknown item",
        icon: newItem.icon || "",
        quantity: qty,
      });
      remaining -= qty;
    }

    window.rwInventory = inv;
    syncInventoryToSupabase(inv);

    const isNewItemId = !hadAnyStack;

    if (isNewItemId) {
      // Highlight the new item and pop open inventory
      renderInventory(inv, newItem.id);

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
      // Existing item id, just refresh grid with updated quantity
      renderInventory(inv);
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

    // 🔔 Chapel: try to play the bell (15-minute cooldown)
    if (key === "chapel") {
      playChapelBellIfAllowed();
    }

    // ⭐ Special case: first time arriving at the Manor
        if (
      key === "manor" &&
      currentChar &&
      currentChar.manor_intro_seen !== true &&
      playerHasTalisman()
    ) {
      maybeShowManorArrival(currentChar, window.rwEmail || "");

      // Show manor description + log secret, save location
      renderLocationDetail(key);
      addSecretFromLocation(key);

      // Save locally + Supabase
      saveLocationKey(key);
      syncLocationToSupabase(key);

      maybeSpawnDynamicLocations();
      return;
    }

    // ⭐ Special case: Market → open the live shop
    if (key === "market") {
      (async () => {
        // Load items once from Supabase
        if (!rwShopLoaded) {
          await loadShopFromSupabase();
        }

        renderShopGrid();

        const modalEl = document.getElementById("rwShopModal");
        const dialogEl = document.getElementById("rwShopDialog");
        const buyBtn = document.getElementById("rwShopBuyBtn");
        const sellBtn = document.getElementById("rwShopSellBtn");
        const shopInventoryWrapper = document.getElementById(
          "rwShopInventoryWrapper"
        );
        const shopInventoryBtn =
          document.getElementById("rwShopInventoryBtn");

        // Default visual: front view, no grid
        setShopVisual("front");
        window.rwShopMode = "buy";

        // Reset dialog + hide inventory button each time you enter the shop
        if (dialogEl) {
          dialogEl.textContent =
            'The shopkeeper watches you with hollow eyes. “Looking to trade… or simply lost?”';
        }
        if (shopInventoryWrapper) {
          shopInventoryWrapper.classList.add("d-none");
        }

        // Clicking "Browse Wares" → shelves image + grid
        if (buyBtn && dialogEl) {
          buyBtn.onclick = () => {
            window.rwShopMode = "buy";
            setShopVisual("shelves");
            dialogEl.textContent =
              'He turns, revealing the shelves behind him. “Take your time.”';

            // Hide inventory button again when in buy mode
            if (shopInventoryWrapper) {
              shopInventoryWrapper.classList.add("d-none");
            }
          };
        }

        // Clicking "Sell Items" → stay on front view, show an Inventory button
        if (sellBtn && dialogEl) {
          sellBtn.onclick = () => {
            window.rwShopMode = "sell";
            setShopVisual("front");
            dialogEl.textContent =
              'His gaze drops to your pack. “If you\'ve anything worth parting with,” ' +
              'he murmurs, “lay it out where I can see it.”';

            // Reveal the "Open Your Inventory" button
            if (shopInventoryWrapper) {
              shopInventoryWrapper.classList.remove("d-none");
            }
          };
        }

        // When you click "Open Your Inventory", close the shop, then open inventory
        if (
          shopInventoryBtn &&
          typeof bootstrap !== "undefined" &&
          inventoryModal &&
          modalEl
        ) {
          shopInventoryBtn.onclick = () => {
            // Get the existing shop modal instance if it's open
            const shopInstance =
              bootstrap.Modal.getInstance(modalEl) ||
              new bootstrap.Modal(modalEl);

            // After the shop finishes hiding, show the inventory on top
            modalEl.addEventListener(
              "hidden.bs.modal",
              () => {
                inventoryModal.show();
              },
              { once: true }
            );

            shopInstance.hide();
          };
        } else if (shopInventoryBtn) {
          // Fallback if something is off with bootstrap/inventoryModal
          shopInventoryBtn.onclick = () => {
            const invEl = document.getElementById("rwInventoryModal");
            if (invEl && window.bootstrap && bootstrap.Modal) {
              const m = new bootstrap.Modal(invEl);
              m.show();
            }
          };
        }

        function pickRingSlot() {
  // Prefer left if empty, otherwise right, otherwise left (swap)
  if (!window.rwEquipped.ring_left) return "ring_left";
  if (!window.rwEquipped.ring_right) return "ring_right";
  return "ring_left";
}

async function equipFromInventory(item) {
  if (!item || !item.id) return;

  const meta = getItemMetadata(item);
  if (!meta?.slot) return;

  function pickRingSlot() {
    if (!window.rwEquipped?.ring_left) return "ring_left";
    if (!window.rwEquipped?.ring_right) return "ring_right";
    return "ring_left";
  }

  const equipped = window.rwEquipped || {
    head: null, neck: null, ring_left: null, ring_right: null, feet: null
  };

  const targetSlot = meta.slot === "ring" ? pickRingSlot() : meta.slot;

  const idx = inventory.findIndex((i) => i && i.id === item.id);
  if (idx === -1) return;

  const entry = inventory[idx];
  const qty = entry.quantity || 1;

  // If something already equipped there, swap it back into inventory
  const prev = equipped[targetSlot];
  if (prev) {
    if (typeof window.addItemToInventory === "function") {
      window.addItemToInventory({ ...prev, quantity: 1 });
    } else {
      inventory.push({ ...prev, quantity: 1 });
    }
  }

  // Remove one from inventory stack
  if (qty > 1) entry.quantity = qty - 1;
  else inventory.splice(idx, 1);

  // Equip the item (store a minimal shape)
  equipped[targetSlot] = {
    id: entry.id,
    name: entry.name || meta.title,
    icon: entry.icon || meta.icon || "",
  };

  window.rwEquipped = equipped;
  window.rwInventory = inventory;

  renderInventory(inventory);
  renderEquipment();

  await syncInventoryToSupabase(inventory);
  await syncEquippedToSupabase(equipped);

  // ✅ stats refresh
  if (typeof window.rwRecomputeStats === "function") {
    await window.rwRecomputeStats(true);
  }
}
        // Define how selling works while the shop is open
        window.rwShopSellHandler = async function (item) {
          const meta = getItemMetadata(item);
          const price = getItemSellPrice(item);

          if (price == null || price <= 0) {
            if (dialogEl) {
              dialogEl.textContent =
                `The shopkeeper studies the ${meta.title.toLowerCase()}, then shakes his head. ` +
                `"Not for sale. Some things belong to the story, not the market."`;
            }
            return;
          }

          // 💬 Ask the player first
          const message =
            `Sell "${meta.title}" for ${price} coin${
              price === 1 ? "" : "s"
            }?\n\n` +
            `The shopkeeper taps the counter. "We both know it’s worth at least that."`;

          const confirmed = window.confirm(message);
          if (!confirmed) {
            if (dialogEl) {
              dialogEl.textContent =
                `He sets the ${meta.title.toLowerCase()} back on the counter. ` +
                `"No rush. Some things decide when they’re ready to leave."`;
            }
            return;
          }

          // ✅ Player agreed → remove one instance from inventory
          const idx = inventory.findIndex((i) => i && i.id === item.id);
          if (idx === -1) return;

          const entry = inventory[idx];
          const qty = entry.quantity || 1;

          if (qty > 1) {
            entry.quantity = qty - 1;
          } else {
            inventory.splice(idx, 1);
          }

          window.rwInventory = inventory;
          await syncInventoryToSupabase(inventory);
          await addCoins(price);
          renderInventory(inventory);

          if (dialogEl) {
            dialogEl.textContent =
              `He weighs the ${meta.title.toLowerCase()} in his hand and nods. ` +
              `"${price} coin${price === 1 ? "" : "s"}. Fair enough."`;
          }
        };

        if (modalEl && window.bootstrap && bootstrap.Modal) {
          const modal = new bootstrap.Modal(modalEl);
          modal.show();
        }

        // track visit as a secret / progress
        addSecretFromLocation(key);
        saveLocationKey(key);
        maybeSpawnDynamicLocations();
      })();

      return;
    }

    // 🌙 Normal behavior for all other locations (and later manor visits)
        // 🌙 Normal behavior for all other locations (and later manor visits)
    renderLocationDetail(key);
    addSecretFromLocation(key);

    // Save locally + Supabase
    saveLocationKey(key);
    syncLocationToSupabase(key);

    maybeSpawnDynamicLocations();

  });
}

  // ---------- When HP Drops to 0: Wake in the Square ----------
  window.rwHandleHpZero = function () {
  try {
    // Always bring them back to Town Square
    const key = "square";

    // Save square as their current location
    saveLocationKey(key);
    // Also sync to Supabase so location persists across devices
    syncLocationToSupabase(key);

    // Re-render the square description if it's a valid location
    if (locations[key]) {
      renderLocationDetail(key);
    }

    // Optionally restore some HP so they don't instantly "die" again
    window.rwHP = Math.floor(RW_MAX_HP / 2); // wake at half health
    updateHpManaDisplays();
    syncHpToSupabase();

    const modalEl = document.getElementById("rwHpZeroModal");
    if (!modalEl || !window.bootstrap || !bootstrap.Modal) return;

    const deathModal = new bootstrap.Modal(modalEl, {
      backdrop: "static",
      keyboard: false,
    });

    deathModal.show();

    const btn = document.getElementById("rwHpZeroContinueBtn");
    if (btn) {
      btn.addEventListener(
        "click",
        () => {
          deathModal.hide();
        },
        { once: true }
      );
    }
  } catch (err) {
    console.error("Error handling HP zero:", err);
  }
};

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
  //  - First time: Town Square (from Supabase default row)
  //  - Later: whatever location Supabase says, with localStorage as optional cache
  let startingKey = (currentChar && currentChar.location_key) || loadSavedLocation();

  if (!startingKey || !locations[startingKey]) {
    // Fallback if it's missing or invalid
    startingKey = "square";
  }

  // Local cache is optional; Supabase is the source of truth
  saveLocationKey(startingKey);

  if (detailTitleEl && detailBodyEl && detailHintEl && locations[startingKey]) {
    renderLocationDetail(startingKey);
  }
} // 👈 CLOSES async function initWorldPage()

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

// ============================
// Ravenwood Ink Loading Screen (NO WHISPER AUDIO)
// ============================

// We keep the structure but remove all whisper logic

document.addEventListener("DOMContentLoaded", () => {
  const screen = document.getElementById("rwLoadingScreen");
  if (!screen) return;

  // ⬅️ No whisper logic. All audio triggers removed.

  // When the entire page has finished loading:
  window.addEventListener("load", () => {
    // ⏳ Keep the loading screen visible ~1 second after load
    setTimeout(() => {
      screen.style.opacity = "0";

      setTimeout(() => {
        screen.remove();
      }, 600); // matches your fade-out duration
    }, 1000);   // 1 second after page load
  });
});

// ============================
// Chapel Bell (15-minute cooldown)
// ============================

const RW_CHAPEL_BELL_COOLDOWN = 15 * 60 * 1000; // 15 minutes in ms

function playChapelBellIfAllowed() {
  const audio = document.getElementById("rwChapelBellSound");
  if (!audio) return;

  const lastPlayed =
    Number(localStorage.getItem("rwChapelBellLastPlayed")) || 0;
  const now = Date.now();

  // Too soon? Do nothing.
  if (now - lastPlayed < RW_CHAPEL_BELL_COOLDOWN) {
    return;
  }

  // Record new play time
  localStorage.setItem("rwChapelBellLastPlayed", String(now));

  try {
    audio.currentTime = 0;
    audio.volume = 0.9;

    const p = audio.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        console.warn("Chapel bell play blocked:", err?.name || err);
      });
    }
  } catch (err) {
    console.warn("Chapel bell threw:", err);
  }
}


