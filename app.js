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

    // Summary panel on the right
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
        flame: "Flame · Courage & Calling",
        wind: "Wind · Messages & Change",
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
