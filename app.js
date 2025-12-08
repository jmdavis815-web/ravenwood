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

// LocalStorage key (optional helper)
const RAVENWOOD_EMAIL_KEY = "ravenwoodEmail";

const RAVENWOOD_SECRETS_KEY = "ravenwoodTownSecrets";

function loadSecrets() {
  try {
    return JSON.parse(localStorage.getItem(RAVENWOOD_SECRETS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveSecrets(secrets) {
  try {
    localStorage.setItem(RAVENWOOD_SECRETS_KEY, JSON.stringify(secrets));
  } catch {
    // ignore
  }
}

// ---------- SMALL DOM HELPERS ----------
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

// ---------- CHARACTER TABLE HELPERS ----------
// Uses Supabase JS instead of manual fetch

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

  const statusEl = $("#rwStatus"); // optional status, may be null

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const displayName = $("#displayName")?.value.trim();
    const archetype = $("#archetype")?.value;
    const affinity = $("#affinity")?.value;
    const familiarName = $("#familiarName")?.value.trim();
    const journeyTone = document.querySelector(
      "input[name='journeyTone']:checked"
    )?.value;

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
      // OPTIONAL: check if a character already exists for that email
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

      // NOTE:
      // If email confirmation is enabled in your Supabase project,
      // the user might need to confirm via email before they can log in.

      // 2) Create character profile row in "data" table
      const payload = {
        email,
        display_name: displayName,
        archetype,
        affinity,
        familiar_name: familiarName || null,
        journey_tone: journeyTone || null,
        created_at: new Date().toISOString(),
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

// ---------- PAGE INIT: WORLD (MAIN HUB) ----------
// ---------- PAGE INIT: WORLD (MAIN HUB / TOWN) ----------
async function initWorldPage() {
  const nameEl = $("#rwUserName");
  const archEl = $("#rwUserArchetype");

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
      // No character row, but user is logged in: reset & push to create?
      console.warn("No character profile found for", email);
      window.location.href = "create.html";
      return;
    }

    // Basic identity
    if (nameEl) nameEl.textContent = char.display_name || "Guest";

    if (archEl) {
      const map = {
        seer: "Seer of the Veil",
        warden: "Warden of the Gates",
        wanderer: "Wanderer Between",
        chronicler: "Chronicler of Echoes",
        "shadow-witch": "Shadow Witch",
        "scholar-of-runes": "Scholar of Runes",
        "guardian-of-gates": "Guardian of Gates",
        "seer-of-moons": "Seer of Moons",
      };
      archEl.textContent = map[char.archetype] || "Circle Walker";
    }

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
        shadow: "Shadow · Secrets & Thresholds",
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
  } catch (err) {
    console.error("Error loading Ravenwood world:", err);
    alert(
      "Ravenwood couldn’t be reached just now. Try refreshing, or step back through the gate and re-enter."
    );
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

  // Location definitions (you can tweak copy any time)
  const locations = {
    square: {
      title: "Town Square",
      body:
        "Lanterns cast soft halos over the uneven stones. A cracked fountain burbles with water that never quite freezes. Notices for missing cats, moonlit meetings, and half-torn prophecy fragments flap on the board.",
      hint:
        "Sometimes someone pins a note here meant only for Circle eyes.",
      secretKey: "squareNotice",
      secretText:
        "In the Town Square, you noticed a torn notice about a 'gathering under a silver moon' with no date.",
    },
    moonwell: {
      title: "The Moonwell",
      body:
        "The well’s water reflects the moon even when clouds smother the sky. Old offerings line the stone lip: rusted rings, knotted cords, pressed flowers that never quite rot.",
      hint:
        "Drop a wish in, but listen closely to what the echo gives back.",
      secretKey: "moonwellEcho",
      secretText:
        "At the Moonwell, you heard an echo whisper a name that no one has spoken in years — maybe your own.",
    },
    market: {
      title: "Market Lane",
      body:
        "Stalls crowd close together, thick with incense and the clink of charms. Vendors offer powders that remember your dreams and trinkets that insist they belonged to queens.",
      hint:
        "One stall sells objects that feel suspiciously like they fell out of your own story.",
      secretKey: "marketCharm",
      secretText:
        "In Market Lane, a charm seller pressed something into your palm and said, 'You’re late.' You never paid.",
    },
    chapel: {
      title: "Old Chapel",
      body:
        "Candles still burn where no one admits to lighting them. The stained glass throws fractured light that makes new symbols on the floor — symbols the old Circle once used.",
      hint:
        "Sit in the back pew if you want the ghosts to talk instead of stare.",
      secretKey: "chapelPew",
      secretText:
        "In the Old Chapel, you sat in the back pew and felt someone sit beside you, though the seat stayed empty.",
    },
    witchwood: {
      title: "Witchwood Edge",
      body:
        "The first trees of the Witchwood lean toward the path, crowns whispering together. Runes carved into bark glow faintly whenever the wind comes from the manor’s direction.",
      hint:
        "The Witchwood doesn’t mind visitors — only liars.",
      secretKey: "witchwoodRune",
      secretText:
        "At Witchwood Edge, a rune flared warm under your palm, recognizing something in your blood.",
    },
    fogwalk: {
      title: "Fogwalk Alley",
      body:
        "A narrow, twisting alley that smells of rain and old paper. Doors without handles, windows without glass, and a single lantern that flickers only when someone lies nearby.",
      hint:
        "This alley shouldn’t exist, and yet here you are.",
      secretKey: "fogwalkLantern",
      secretText:
        "In Fogwalk Alley, the lantern flared when you thought about turning back — as if warning you that some paths only go one way.",
    },
  };

  // Secrets load + render
  let discoveredSecrets = loadSecrets();

  function renderSecrets() {
    if (!secretsListEl) return;

    secretsListEl.innerHTML = "";

    if (!discoveredSecrets.length) {
      const li = document.createElement("li");
      li.className = "rw-secret-empty text-muted small";
      li.textContent = "No secrets yet. The town is still deciding if it trusts you.";
      secretsListEl.appendChild(li);
      return;
    }

    discoveredSecrets.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      secretsListEl.appendChild(li);
    });
  }

  function addSecret(secretKey, secretText) {
    if (!secretKey || !secretText) return;

    // Avoid duplicates using key stored alongside text
    const exists = discoveredSecrets.some((s) => s === secretText);
    if (exists) return;

    discoveredSecrets.push(secretText);
    saveSecrets(discoveredSecrets);
    renderSecrets();
  }

  renderSecrets();

  // Location click handling
  const locationButtons = document.querySelectorAll("[data-location]");
  locationButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-location");
      const loc = locations[key];
      if (!loc) return;

      if (detailTitleEl) detailTitleEl.textContent = loc.title;
      if (detailBodyEl) detailBodyEl.textContent = loc.body;
      if (detailHintEl) detailHintEl.textContent = loc.hint;

      // Each click has a chance to “offer” the secret; here we just give it on first visit
      if (loc.secretKey && loc.secretText) {
        addSecret(loc.secretKey, loc.secretText);
      }
    });
  });

  // Optionally: auto-select Town Square on load
  if (detailTitleEl && detailBodyEl && detailHintEl && locations.square) {
    detailTitleEl.textContent = locations.square.title;
    detailBodyEl.textContent = locations.square.body;
    detailHintEl.textContent = locations.square.hint;
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
