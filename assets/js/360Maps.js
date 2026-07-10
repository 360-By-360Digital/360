/* ============================================================
   360 MAPS — assets/js/360Maps.js
   Depends on: leaflet (loaded in 360Maps.html), main.js
   (which exposes window.supabaseClient on the page).
   ============================================================ */
(function () {
  "use strict";

  let map = null;
  let marker = null;
  let currentPin = null; // { lat, lon, label }
  let currentUser = null;

  const $ = (s) => document.querySelector(s);

  const searchInput   = $("#mapsSearchInput");
  const searchForm     = $("#mapsSearchForm");
  const errorBox       = $("#mapsError");
  const statusBox      = $("#mapsStatus");
  const infoCard        = $("#mapsInfoCard");
  const infoTitle       = $("#mapsInfoTitle");
  const infoSub          = $("#mapsInfoSub");
  const saveBtn           = $("#mapsSaveBtn");
  const savedList          = $("#mapsSavedList");
  const signinNotice        = $("#mapsSigninNotice");
  const modalOverlay          = $("#mapsModalOverlay");
  const modalLabelInput        = $("#mapsModalLabel");
  const modalNoteInput          = $("#mapsModalNote");
  const modalSaveBtn             = $("#mapsModalSave");
  const modalCancelBtn            = $("#mapsModalCancel");

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = "block";
    setTimeout(() => { errorBox.style.display = "none"; }, 4000);
  }

  function setStatus(msg) {
    statusBox.textContent = msg || "";
  }

  /* ── Map init ── */
  function initMap(lat, lon, zoom) {
    if (map) return;
    map = L.map("mapsCanvas").setView([lat, lon], zoom || 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
    }).addTo(map);

    map.on("click", (e) => {
      setPin(e.latlng.lat, e.latlng.lng, null);
    });
  }

  function setPin(lat, lon, label) {
    currentPin = { lat, lon, label: label || null };

    if (!marker) {
      marker = L.marker([lat, lon]).addTo(map);
    } else {
      marker.setLatLng([lat, lon]);
    }
    map.setView([lat, lon], Math.max(map.getZoom(), 12));

    infoTitle.textContent = label || "Dropped pin";
    infoSub.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    infoCard.classList.add("show");
    marker.bindPopup(label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`).openPopup();

    if (!label) {
      reverseGeocode(lat, lon);
    }
  }

  /* ── Geocoding (Nominatim, no key needed) ── */
  async function geocode(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();
    if (!data.length) throw new Error("No results found for that place");
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      label: data[0].display_name,
    };
  }

  async function reverseGeocode(lat, lon) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.display_name) {
        infoTitle.textContent = data.display_name.split(",").slice(0, 2).join(",");
        currentPin.label = data.display_name;
      }
    } catch {
      /* silent — reverse lookup is a nice-to-have */
    }
  }

  /* ── Search form ── */
  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    setStatus("Searching…");
    try {
      const { lat, lon, label } = await geocode(q);
      initMap(lat, lon, 13);
      setPin(lat, lon, label);
      setStatus("");
    } catch (err) {
      setStatus("");
      showError(err.message || "Couldn't find that place");
    }
  });

  /* ── Quick locations ── */
  window.mapsLoadQuick = async function (place) {
    searchInput.value = place;
    searchForm.requestSubmit();
  };

  /* ── My location ── */
  window.mapsUseMyLocation = function () {
    if (!navigator.geolocation) {
      showError("Geolocation isn't supported by this browser");
      return;
    }
    setStatus("Locating…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("");
        const { latitude, longitude } = pos.coords;
        initMap(latitude, longitude, 14);
        setPin(latitude, longitude, "My location");
      },
      () => {
        setStatus("");
        showError("Couldn't get your location — check location permissions");
      }
    );
  };

  /* ── Save flow ── */
  saveBtn.addEventListener("click", () => {
    if (!currentUser) {
      showError("Sign in to save locations");
      return;
    }
    if (!currentPin) return;
    modalLabelInput.value = currentPin.label
      ? currentPin.label.split(",").slice(0, 2).join(",")
      : "";
    modalNoteInput.value = "";
    modalOverlay.classList.add("show");
    modalLabelInput.focus();
  });

  modalCancelBtn.addEventListener("click", () => {
    modalOverlay.classList.remove("show");
  });
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove("show");
  });

  modalSaveBtn.addEventListener("click", async () => {
    const label = modalLabelInput.value.trim() || "Saved place";
    const note = modalNoteInput.value.trim() || null;
    if (!currentPin) return;
    modalSaveBtn.disabled = true;
    try {
      const { error } = await window.supabaseClient.from("saved_locations").insert({
        user_id: currentUser.id,
        label,
        lat: currentPin.lat,
        lon: currentPin.lon,
        note,
      });
      if (error) throw error;
      modalOverlay.classList.remove("show");
      await loadSavedLocations();
    } catch (err) {
      showError(err.message || "Couldn't save location");
    } finally {
      modalSaveBtn.disabled = false;
    }
  });

  /* ── Saved locations list ── */
  async function loadSavedLocations() {
    if (!currentUser) {
      savedList.innerHTML = "";
      signinNotice.style.display = "block";
      return;
    }
    signinNotice.style.display = "none";
    try {
      const { data, error } = await window.supabaseClient
        .from("saved_locations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      renderSavedLocations(data || []);
    } catch (err) {
      showError(err.message || "Couldn't load saved locations");
    }
  }

  function renderSavedLocations(items) {
    if (!items.length) {
      savedList.innerHTML = `<div class="maps-panel-note">No saved locations yet — drop a pin and hit Save.</div>`;
      return;
    }
    savedList.innerHTML = items
      .map(
        (it) => `
      <div class="maps-saved-item" data-id="${it.id}" data-lat="${it.lat}" data-lon="${it.lon}" data-label="${encodeURIComponent(it.label)}">
        <div class="maps-saved-label">${escapeHtml(it.label)}</div>
        <div class="maps-saved-coords">${it.lat.toFixed(4)}, ${it.lon.toFixed(4)}${it.note ? " · " + escapeHtml(it.note) : ""}</div>
        <div class="maps-saved-actions">
          <button class="maps-saved-del" data-del="${it.id}">Delete</button>
        </div>
      </div>`
      )
      .join("");

    savedList.querySelectorAll(".maps-saved-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-del]")) return;
        const lat = parseFloat(el.dataset.lat);
        const lon = parseFloat(el.dataset.lon);
        const label = decodeURIComponent(el.dataset.label);
        initMap(lat, lon, 13);
        setPin(lat, lon, label);
      });
    });

    savedList.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-del");
        btn.disabled = true;
        try {
          const { error } = await window.supabaseClient
            .from("saved_locations")
            .delete()
            .eq("id", id);
          if (error) throw error;
          await loadSavedLocations();
        } catch (err) {
          showError(err.message || "Couldn't delete location");
        }
      });
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /* ── Auth wiring ── */
  async function initAuth() {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    currentUser = session?.user ?? null;
    await loadSavedLocations();

    window.supabaseClient.auth.onAuthStateChange((_event, sess) => {
      currentUser = sess?.user ?? null;
      loadSavedLocations();
    });
  }

  /* ── Boot ── */
  document.addEventListener("DOMContentLoaded", () => {
    initMap(40.7128, -74.006, 4); // default: world-ish view centered near NYC
    initAuth();
  });
})();
