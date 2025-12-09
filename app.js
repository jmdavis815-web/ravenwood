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

// Draw the inventory inside #rwInventoryGrid
// Draw the inventory inside #rwInventoryGrid
function renderInventory(items = [], highlightItemId = null) {
  const grid = document.getElementById("rwInventoryGrid");
  if (!grid) return;

  const maxSlots = 16; // 4×4 grid
  grid.innerHTML = "";

  // Ensure we always have an array
  const safeItems = Array.isArray(items) ? items : [];

  safeItems.forEach((item) => {
    const slot = document.createElement("div");
    slot.className = "rw-inventory-slot";

    // ⭐ Highlight this slot if it matches the newly added item
    if (highlightItemId && item && item.id === highlightItemId) {
      slot.classList.add("rw-inventory-slot--highlight");
    }

    if (item && item.icon) {
      const img = document.createElement("img");
      img.src = item.icon; // e.g. "raven-mote.png"
      img.alt = item.name || "Item";
      img.className = "rw-inventory-item-icon";
      slot.appendChild(img);
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
  secrets: [],          // start empty
  inventory: [],        // start empty
  manor_unlocked: false,
  intro_seen: false,    // first time in Ravenwood, show town intro
  manor_intro_seen: false, // first time you go to the Manor
};

      const inserted = await createCharacterOnSupabase(payload);
      console.log("Created character:", inserted);

      // Remember email on this device (optional)
      saveEmail(email);

      if (statusEl) {
        statusEl.textContent = "The gates of Ravenwood open…";
      }

      // 3) Redirect into the manor hub
      window.location.href = "ravenwood.html";
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
  const char = await fetchCharacterByEmail(email);

  if (!char) {
    console.warn("No character profile found for", email);
    window.location.href = "create.html";
    return;
  }

  currentChar = char;       // ← add this line
  window.rwChar = char;     // (optional-global if you want it elsewhere)

    // Remove outdated localStorage manor flag (Supabase is the source of truth now)
    localStorage.removeItem("ravenwoodManorUnlocked");

    // Stash identity + current progress for helpers
    window.rwEmail = email;
    window.rwInitialSecrets = Array.isArray(char.secrets) ? char.secrets : [];
    window.rwInitialInventory = Array.isArray(char.inventory)
      ? char.inventory
      : [];

    // manor unlock state (Supabase first, localStorage as fallback)
    // Supabase is the ONLY source of truth now
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
    // --------------------------------------
  // ⭐ THIS IS THE CORRECT PLACE ⭐
  // Show first-arrival intro if this account hasn't seen it yet
  maybeShowIntroModal(char, email);
  // --------------------------------------
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
          "A narrow, twisting alley that smells of rain and old paper. Doors without handles, windows without glass, and a single lantern that flickers only when someone lies nearby.",
        "shadow-witch":
          "The fog wraps around your ankles like a familiar cat, purring with mischief you almost remember.",
      },
      hint: {
        default:
          "This alley shouldn’t exist, and yet here you are.",
      },
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
    btn.addEventListener("click", async () => {
      try {
        const { error } = await supabaseClient
          .from("data")
          .update({
            manor_unlocked: true,
            manor_intro_seen: true,
          })
          .eq("email", email);

        if (error) {
          console.error("Failed to update manor arrival:", error);
        } else {
          // keep the local copy in sync
          char.manor_intro_seen = true;
          if (window.rwChar) window.rwChar.manor_intro_seen = true;
        }
      } catch (err) {
        console.error("Unexpected manor arrival error:", err);
      }

      manorModal.hide();

      // later: trigger first interactive book here
      // startInteractiveBook1();
    }, { once: true });
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

  // ---------- Inventory wiring ----------

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

  // We do NOT backfill from old localStorage; Supabase is truth.
  // If you ever need to rescue local inventory on THIS device:
  // if (!inventory.length) {
  //   const legacyInv = loadInventory();
  //   if (Array.isArray(legacyInv) && legacyInv.length) {
  //     inventory = legacyInv;
  //     syncInventoryToSupabase(inventory);
  //   }
  // }

  renderInventory(inventory);

  if (inventoryBtn && inventoryModal) {
    inventoryBtn.addEventListener("click", () => {
      renderInventory(inventory);
      inventoryModal.show();
    });
  }

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

  // Save to Supabase (+ cache locally)
  syncInventoryToSupabase(inventory);

  // ✅ If this is a brand-new item, highlight it
  if (isNewItem) {
    renderInventory(inventory, newItem.id);

    // If we have the Inventory modal, pop it open and let the glow play
    if (inventoryModal) {
      inventoryModal.show();

      // Optionally remove the highlight class after a short delay
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
    const hintText = getVariantText(
      loc.hint,
      playerArchetype,
      playerAffinity
    );

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
      currentChar &&                     // we have their char data
      currentChar.manor_intro_seen !== true && // haven't seen it yet
      playerHasTalisman()               // they actually have the talisman
    ) {
      // Show the manor arrival story modal
      maybeShowManorArrival(currentChar, window.rwEmail || "");
      // We still render details / grant secret / save location as usual:
      renderLocationDetail(key);
      addSecretFromLocation(key);
      saveLocationKey(key);
      return;
    }

    // Normal behavior for all other locations (and later manor visits)
    renderLocationDetail(key);
    addSecretFromLocation(key);
    saveLocationKey(key);
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
