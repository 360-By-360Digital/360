/* ============================================================
   360 — HOME.JS V.3.0.0
   Home page only logic.
   ============================================================ */

/* ============================================================
   CLOCK
   ============================================================ */
function updateClock() {
  const now = new Date();
  const el  = document.getElementById("clock");
  if (el) el.textContent = now.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit"
  });
}
setInterval(updateClock, 1000);
updateClock();

/* ============================================================
   TEMP UNIT
   ============================================================ */
let tempUnit  = localStorage.getItem("tempUnit") || "C";
let lastTempC = null;

function celsiusToFahrenheit(c) {
  return Math.round((c * 9 / 5) + 32);
}

function updateWeatherChip() {
  const chip = document.getElementById("weatherChip");
  if (!chip || lastTempC === null) return;
  chip.textContent = tempUnit === "C"
    ? `${Math.round(lastTempC)}°C`
    : `${celsiusToFahrenheit(lastTempC)}°F`;
}

function updateTempUnitLabel() {
  const label = document.getElementById("tempUnitLabel");
  if (label) label.textContent = tempUnit === "C" ? "°C" : "°F";
}

const tempUnitBtn = document.getElementById("tempUnitBtn");
if (tempUnitBtn) {
  tempUnitBtn.addEventListener("click", () => {
    tempUnit = tempUnit === "C" ? "F" : "C";
    localStorage.setItem("tempUnit", tempUnit);
    updateTempUnitLabel();
    updateWeatherChip();
  });
}
updateTempUnitLabel();

/* ============================================================
   WEATHER CHIP (Geolocation + Open-Meteo)
   ============================================================ */
async function loadWeather() {
  const chip = document.getElementById("weatherChip");
  if (!chip) return;

  if (!navigator.geolocation) {
    chip.textContent = "Weather N/A";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async pos => {
      const { latitude: lat, longitude: lon } = pos.coords;
      try {
        const res  = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
        );
        const data = await res.json();
        lastTempC  = data.current_weather.temperature;
        updateWeatherChip();
      } catch {
        chip.textContent = "Weather N/A";
      }
    },
    () => { chip.textContent = "Weather N/A"; }
  );
}
loadWeather();

/* ============================================================
   MUSIC PLAYER
   ============================================================ */
const music       = document.getElementById("bgMusic");
const musicToggle = document.getElementById("musicToggle");
let musicEnabled  = localStorage.getItem("music") === "true";

function syncMusicUI() {
  if (musicToggle) musicToggle.textContent = musicEnabled ? "Music: On" : "Music: Off";
}

if (musicToggle && music) {
  if (musicEnabled) {
    music.play().catch(() => {
      musicEnabled = false;
      localStorage.setItem("music", false);
      syncMusicUI();
    });
  }

  musicToggle.addEventListener("click", async () => {
    musicEnabled = !musicEnabled;
    localStorage.setItem("music", musicEnabled);
    if (musicEnabled) {
      try { await music.play(); } catch (e) { console.error("Music error:", e); }
    } else {
      music.pause();
    }
    syncMusicUI();
  });
}
syncMusicUI();

/* ============================================================
   READY LOG
   ============================================================ */
console.log("%c360 V.3.0.0 — home.js loaded", "color:#38bdf8;font-weight:bold;font-size:14px;");
