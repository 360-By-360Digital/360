/* ============================================================
   360 MAPS — assets/js/360Maps.js
   Depends on: leaflet (loaded in 360Maps.html), main.js
   (which exposes window.supabaseClient on the page).
   ============================================================ */
(function () {
  "use strict";

  const RECENT_KEY = "360_maps_recent";
  const MAX_RECENT = 8;

  let map = null;
  let marker = null;
  let meMarker = null;
  let routeLine = null;
  let watchId = null;
  let currentUser = null;
  let currentPin = null; // { lat, lon, label }

  let suggestList = [];
  let suggestIdx = -1;
  let suggestTimer = null;
  let lastQuery = "";

  const $ = (s) => document.querySelector(s);

  const searchForm    = $("#mapsSearchForm");
  const searchInput   = $("#mapsSearchInput");
  const dropdown      = $("#mapsSuggestDropdown");
  const errorBox      = $("#mapsError");
  const statusBox     = $("#mapsStatus");

  const listCard       = $("#mapsListCard");
  const savedList       = $("#mapsSavedList");
  const signinNotice     = $("#mapsSigninNotice");

  const detailCard        = $("#mapsDetailCard");
  const detailTitle        = $("#mapsDetailTitle");
  const detailCoords        = $("#mapsDetailCoords");
  const saveBtn               = $("#mapsSaveBtn");
  const directionsBtn          = $("#mapsDirectionsBtn");
  const backBtn                 = $("#mapsBackBtn");
  const directionsBox            = $("#mapsDirectionsBox");
  const directionsDistance        = $("#mapsDirectionsDistance");
  const directionsDuration         = $("#mapsDirectionsDuration");

  const modalOverlay   = $("#mapsModalOverlay");
  const modalLabel     = $("#mapsModalLabel");
  const modalNote      = $("#mapsModalNote");
  const modalSave      = $("#mapsModalSave");
  const modalCancel    = $("#mapsModalCancel");

  /* ── helpers ── */
  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = "block";
    setTimeout(() => { errorBox.style.display = "none"; }, 4000);
  }
  function setStatus(msg) { statusBox.textContent = msg || ""; }
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
  function shortLabel(label) {
    return label ? label.split(",").slice(0, 2).join(",") : "Dropped pin";
  }

  /* ── recent searches ── */
  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
  }
  function addRecent(item) {
    let list = getRecent().filter(
      (r) => r.label.toLowerCase() !== item.label.toLowerCase()
    );
    list.unshift(item);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  }
  function removeRecent(label) {
    const list = getRecent().filter((r) => r.label !== label);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  }

  /* ── map setup ── */
  function initMap(lat, lon, zoom) {
    if (map) return;
    map = L.map("mapsCanvas", { zoomControl: true, attributionControl: true }).setView([lat, lon], zoom || 3);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "OpenStreetMap contributors",
    }).addTo(map);

    map.on("click", (e) => {
      selectLocation(e.latlng.lat, e.latlng.lng, null);
    });
  }

  function setPin(lat, lon, label) {
    if (!marker) {
      marker = L.marker([lat, lon]).addTo(map);
    } else {
      marker.setLatLng([lat, lon]);
    }
    map.setView([lat, lon], Math.max(map.getZoom(), 12));
    marker.bindPopup(label || `${lat.toFixed(4)}, ${lon.toFixed(4)}`).openPopup();
  }

  /* ── geocoding ── */
  async function geocodeSuggestions(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();
    return data.map((d) => ({
      label: d.display_name,
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
    }));
  }

  async function reverseGeocode(lat, lon) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.display_name ? data.display_name : null;
    } catch {
      return null;
    }
  }

  /* ── selecting a location ── */
  async function selectLocation(lat, lon, label) {
    hideDropdown();
    initMap(lat, lon, 12);
    setPin(lat, lon, label);
    currentPin = { lat, lon, label };
    showDetailCard(label || "Dropped pin", lat, lon);

    if (!label) {
      const found = await reverseGeocode(lat, lon);
      if (found) {
        currentPin.label = found;
        detailTitle.textContent = shortLabel(found);
        marker.setPopupContent(found);
      }
    } else {
      addRecent({ label, lat, lon });
    }
  }

  /* ── list / detail toggle ── */
  function showDetailCard(label, lat, lon) {
    detailTitle.textContent = shortLabel(label);
    detailCoords.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    directionsBox.classList.remove("show");
    listCard.style.display = "none";
    detailCard.style.display = "block";
  }

  function showListCard() {
    detailCard.style.display = "none";
    listCard.style.display = "block";
    if (marker) { map.removeLayer(marker); marker = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    currentPin = null;
  }

  backBtn.addEventListener("click", showListCard);

  /* ── search form submit ── */
  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    setStatus("Searching...");
    try {
      const results = await geocodeSuggestions(q);
      if (!results.length) throw new Error("No results found for that place");
      const top = results[0];
      selectLocation(top.lat, top.lon, top.label);
      setStatus("");
    } catch (err) {
      setStatus("");
      showError(err.message || "Couldn't find that place");
    }
  });

  /* ── use my location ── */
  function useMyLocation() {
    if (!navigator.geolocation) {
      showError("Geolocation isn't supported by this browser");
      return;
    }
    setStatus("Locating...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("");
        const { latitude, longitude } = pos.coords;
        selectLocation(latitude, longitude, "My location");
        startWatchingMe();
      },
      () => {
        setStatus("");
        showError("Couldn't get your location - check location permissions");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  /* ── live "you are here" dot ── */
  function meColor() {
    const c = getComputedStyle(document.body).getPropertyValue("--cursor-color").trim();
    if (c) return c;
    return getComputedStyle(document.body).getPropertyValue("--a").trim() || "#3b82f6";
  }

  function startWatchingMe() {
    if (!navigator.geolocation || watchId !== null) return;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const icon = L.divIcon({
          className: "",
          html: `<div class="maps-me-dot" style="background:${meColor()}"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        if (!meMarker) {
          meMarker = L.marker([latitude, longitude], { icon, zIndexOffset: 1000 }).addTo(map);
        } else {
          meMarker.setIcon(icon);
          meMarker.setLatLng([latitude, longitude]);
        }
      },
      () => { /* silent - live tracking is best-effort */ },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }

  /* ── directions ── */
  directionsBtn.addEventListener("click", () => {
    if (!currentPin) return;
    if (!navigator.geolocation) {
      showError("Geolocation isn't supported by this browser");
      return;
    }
    setStatus("Getting directions...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        startWatchingMe();
        const { latitude, longitude } = pos.coords;
        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${longitude},${latitude};${currentPin.lon},${currentPin.lat}?overview=full&geometries=geojson`;
          const res = await fetch(url);
          if (!res.ok) throw new Error("Directions service unavailable");
          const data = await res.json();
          if (!data.routes || !data.routes.length) throw new Error("No route found");
          const route = data.routes[0];

          if (routeLine) map.removeLayer(routeLine);
          const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
          routeLine = L.polyline(coords, { color: meColor(), weight: 5, opacity: 0.85 }).addTo(map);
          map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });

          const km = (route.distance / 1000).toFixed(1);
          const mins = Math.round(route.duration / 60);
          directionsDistance.textContent = `${km} km`;
          directionsDuration.textContent = `${mins} min`;
          directionsBox.classList.add("show");
          setStatus("");
        } catch (err) {
          setStatus("");
          showError(err.message || "Couldn't get directions");
        }
      },
      () => {
        setStatus("");
        showError("Couldn't get your location - check location permissions");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  /* ── save flow ── */
  saveBtn.addEventListener("click", () => {
    if (!currentUser) { showError("Sign in to save locations"); return; }
    if (!currentPin) return;
    modalLabel.value = shortLabel(currentPin.label);
    modalNote.value = "";
    modalOverlay.classList.add("show");
    modalLabel.focus();
  });
  modalCancel.addEventListener("click", () => modalOverlay.classList.remove("show"));
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove("show");
  });
  modalSave.addEventListener("click", async () => {
    const label = modalLabel.value.trim() || "Saved place";
    const note = modalNote.value.trim() || null;
    if (!currentPin) return;
    modalSave.disabled = true;
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
      modalSave.disabled = false;
    }
  });

  /* ── saved locations list ── */
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
      savedList.innerHTML = `<div class="maps-panel-note">No saved locations yet. Search or drop a pin, then save it.</div>`;
      return;
    }
    savedList.innerHTML = items
      .map(
        (it) => `
      <div class="maps-saved-item" data-id="${it.id}" data-lat="${it.lat}" data-lon="${it.lon}" data-label="${encodeURIComponent(it.label)}">
        <div class="maps-saved-label">${escapeHtml(it.label)}</div>
        <div class="maps-saved-coords">${it.lat.toFixed(4)}, ${it.lon.toFixed(4)}${it.note ? " - " + escapeHtml(it.note) : ""}</div>
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
        selectLocation(lat, lon, label);
      });
    });

    savedList.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-del");
        btn.disabled = true;
        try {
          const { error } = await window.supabaseClient.from("saved_locations").delete().eq("id", id);
          if (error) throw error;
          await loadSavedLocations();
        } catch (err) {
          showError(err.message || "Couldn't delete location");
        }
      });
    });
  }

  /* ── suggestions dropdown ── */
  const locationIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-7.58 7-12A7 7 0 0 0 5 10c0 4.42 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
  const clockIcon    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`;
  const searchIcon   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;
  const xIcon        = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

  function hideDropdown() {
    dropdown.classList.remove("visible");
    dropdown.innerHTML = "";
    suggestList = [];
    suggestIdx = -1;
  }

  function myLocationRow() {
    return `<div class="maps-suggest-item" data-kind="me">
      <span class="maps-suggest-icon">${locationIcon}</span>
      <span class="maps-suggest-text">Use my current location</span>
    </div>`;
  }

  function buildRows(recentItems, searchItems) {
    let html = myLocationRow();
    suggestList = [{ kind: "me" }];

    if (recentItems.length) {
      html += `<div class="maps-suggest-section-label">Recent</div>`;
      recentItems.forEach((it) => {
        suggestList.push({ kind: "recent", ...it });
        html += `<div class="maps-suggest-item" data-kind="recent" data-idx="${suggestList.length - 1}">
          <span class="maps-suggest-icon">${clockIcon}</span>
          <span class="maps-suggest-text">${escapeHtml(shortLabel(it.label))}</span>
          <button class="maps-suggest-remove" data-remove="${encodeURIComponent(it.label)}" title="Remove" aria-label="Remove from recent">${xIcon}</button>
        </div>`;
      });
    }

    if (searchItems && searchItems.length) {
      html += `<div class="maps-suggest-section-label">Suggestions</div>`;
      searchItems.forEach((it) => {
        suggestList.push({ kind: "search", ...it });
        html += `<div class="maps-suggest-item" data-kind="search" data-idx="${suggestList.length - 1}">
          <span class="maps-suggest-icon">${searchIcon}</span>
          <span class="maps-suggest-text">${escapeHtml(it.label)}</span>
        </div>`;
      });
    }

    dropdown.innerHTML = html;
    dropdown.classList.add("visible");
    wireDropdownRows();
  }

  function wireDropdownRows() {
    dropdown.querySelectorAll(".maps-suggest-item").forEach((row) => {
      row.addEventListener("mousedown", (e) => {
        if (e.target.closest(".maps-suggest-remove")) return;
        e.preventDefault();
        const kind = row.dataset.kind;
        if (kind === "me") {
          searchInput.value = "";
          hideDropdown();
          useMyLocation();
          return;
        }
        const idx = parseInt(row.dataset.idx, 10);
        const item = suggestList[idx];
        if (!item) return;
        searchInput.value = shortLabel(item.label);
        hideDropdown();
        selectLocation(item.lat, item.lon, item.label);
      });
    });
    dropdown.querySelectorAll(".maps-suggest-remove").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        removeRecent(decodeURIComponent(btn.dataset.remove));
        renderForQuery(searchInput.value.trim());
      });
    });
  }

  async function renderForQuery(q) {
    const recent = getRecent();
    if (!q) {
      buildRows(recent.slice(0, 5), []);
      return;
    }
    const lower = q.toLowerCase();
    const matchingRecent = recent
      .filter((r) => r.label.toLowerCase().includes(lower))
      .slice(0, 5);

    // Render recent matches immediately, then fill in with live search results.
    buildRows(matchingRecent, []);

    if (q === lastQuery) return;
    lastQuery = q;
    try {
      const results = await geocodeSuggestions(q);
      if (searchInput.value.trim() !== q) return; // stale
      const seen = new Set(matchingRecent.map((r) => r.label));
      const filtered = results.filter((r) => !seen.has(r.label)).slice(0, 5 - matchingRecent.length + 3);
      buildRows(matchingRecent, filtered);
    } catch {
      /* suggestions are best-effort */
    }
  }

  searchInput.addEventListener("focus", () => renderForQuery(searchInput.value.trim()));
  searchInput.addEventListener("input", () => {
    clearTimeout(suggestTimer);
    const q = searchInput.value.trim();
    suggestTimer = setTimeout(() => renderForQuery(q), 220);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".maps-search-card")) hideDropdown();
  });

  searchInput.addEventListener("keydown", (e) => {
    const items = dropdown.querySelectorAll(".maps-suggest-item");
    if (!dropdown.classList.contains("visible") || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      suggestIdx = Math.min(suggestIdx + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle("active", i === suggestIdx));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      suggestIdx = Math.max(suggestIdx - 1, -1);
      items.forEach((it, i) => it.classList.toggle("active", i === suggestIdx));
    } else if (e.key === "Escape") {
      hideDropdown();
    } else if (e.key === "Enter" && suggestIdx >= 0) {
      e.preventDefault();
      items[suggestIdx].dispatchEvent(new Event("mousedown"));
    }
  });

  /* ── auth wiring ── */
  async function initAuth() {
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    currentUser = session?.user ?? null;
    await loadSavedLocations();

    window.supabaseClient.auth.onAuthStateChange((_event, sess) => {
      currentUser = sess?.user ?? null;
      loadSavedLocations();
    });
  }

  /* ── boot ── */
  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("maps-lock");
    initMap(20, 0, 3);
    initAuth();
  });
})();
