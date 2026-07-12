/* ============================================================
   360 MAPS — assets/js/360Maps.js
     - Map tiles:   OpenStreetMap
     - Search/geocoding: Nominatim (OpenStreetMap)
     - Directions:  OSRM public demo server
     - Photos/description for landmarks: Wikipedia REST API
   ============================================================ */
(function () {
  "use strict";

  const RECENT_KEY = "360_maps_recent";
  const MAX_RECENT = 8;
  const NOMINATIM = "https://nominatim.openstreetmap.org";
  const OSRM = "https://router.project-osrm.org";

  let map = null;
  let marker = null;
  let meMarker = null;
  let routeLine = null;
  let watchId = null;
  let navActive = false;
  let currentUser = null;
  let currentPlace = null; // { lat, lon, label }

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

  const mapsCard      = $("#mapsCard");
  const cardBody       = $("#mapsCardBody");

  const modalOverlay   = $("#mapsModalOverlay");
  const modalLabel     = $("#mapsModalLabel");
  const modalNote      = $("#mapsModalNote");
  const modalSave      = $("#mapsModalSave");
  const modalCancel    = $("#mapsModalCancel");

  const navBar          = $("#mapsNavBar");
  const navExitBtn       = $("#mapsNavExit");
  const navEta             = $("#mapsNavEta");
  const navSub              = $("#mapsNavSub");

  /* ── helpers ── */
  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = "block";
    setTimeout(() => { errorBox.style.display = "none"; }, 4500);
  }
  function setStatus(msg) { statusBox.textContent = msg || ""; }
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }
  function shortLabel(label) { return label ? label.split(",")[0] : "Dropped pin"; }
  function meColor() {
    const c = getComputedStyle(document.body).getPropertyValue("--cursor-color").trim();
    return c || "#1a73e8";
  }
  async function fetchJson(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("Request failed");
    return res.json();
  }

  const icons = {
    pin: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-7.58 7-12A7 7 0 0 0 5 10c0 4.42 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
    clock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
    search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    x: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
    back: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
    globe: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/></svg>`,
    close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
    dir: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`,
  };

  /* ── recent searches ── */
  function getRecent() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
  }
  function addRecent(item) {
    let list = getRecent().filter((r) => r.label.toLowerCase() !== item.label.toLowerCase());
    list.unshift(item);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
  }
  function removeRecent(label) {
    localStorage.setItem(RECENT_KEY, JSON.stringify(getRecent().filter((r) => r.label !== label)));
  }

  /* ============================================================
     MAP SETUP
     ============================================================ */
  function initMap() {
    map = L.map("mapsCanvas", { zoomControl: true, attributionControl: true }).setView([20, 0], 3);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", (e) => selectRawLatLng(e.latlng.lat, e.latlng.lng));
  }

  function placeMarker(lat, lon) {
    if (marker) { map.removeLayer(marker); marker = null; }
    marker = L.marker([lat, lon]).addTo(map);
  }
  function focusMap(lat, lon, zoom) {
    map.setView([lat, lon], Math.max(map.getZoom(), zoom || 15));
  }

  /* ============================================================
     GEOCODING (Nominatim) — used for both search and reverse lookup
     ============================================================ */
  async function nominatimSearch(query, limit) {
    const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&extratags=1&namedetails=1&limit=${limit || 5}&q=${encodeURIComponent(query)}`;
    return fetchJson(url);
  }
  async function nominatimReverse(lat, lon) {
    const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&extratags=1&lat=${lat}&lon=${lon}`;
    return fetchJson(url);
  }

  /* Structured full-address search: tries the raw query, and if that comes
     back empty (common for oddly formatted full addresses), retries with
     Nominatim's structured "street" style query as a fallback. */
  async function robustSearch(query) {
    let results = await nominatimSearch(query, 5);
    if (results && results.length) return results;

    // Fallback: strip extra punctuation / retry without limit narrowing
    const cleaned = query.replace(/[,]{2,}/g, ",").trim();
    if (cleaned !== query) {
      results = await nominatimSearch(cleaned, 5);
      if (results && results.length) return results;
    }
    throw new Error("Couldn't find that place");
  }

  /* ============================================================
     WIKIPEDIA (photos + description for landmarks, best-effort)
     ============================================================ */
  async function fetchWikiSummary(title, lang) {
    try {
      const url = `https://${lang || "en"}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        description: data.extract || null,
        photo: data.thumbnail ? data.thumbnail.source : (data.originalimage ? data.originalimage.source : null),
        url: data.content_urls && data.content_urls.desktop ? data.content_urls.desktop.page : null,
      };
    } catch {
      return null;
    }
  }

  async function enrichWithWiki(nominatimResult) {
    const extratags = nominatimResult.extratags || {};
    const wikipediaTag = extratags.wikipedia; // e.g. "en:Statue of Liberty"
    if (!wikipediaTag) return null;
    const [lang, ...rest] = wikipediaTag.split(":");
    const title = rest.join(":");
    if (!title) return null;
    return fetchWikiSummary(title, lang);
  }

  /* ============================================================
     PLACE SELECTION / DETAIL RENDERING
     ============================================================ */
  async function selectRawLatLng(lat, lon) {
    hideDropdown();
    placeMarker(lat, lon);
    focusMap(lat, lon, 16);
    currentPlace = { lat, lon, label: null };
    renderDetailLoading();

    try {
      const r = await nominatimReverse(lat, lon);
      await renderFromNominatim(r, lat, lon);
    } catch {
      renderBareDetail(null, lat, lon);
    }
  }

  async function selectFromResult(result) {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    hideDropdown();
    placeMarker(lat, lon);
    focusMap(lat, lon, 16);
    currentPlace = { lat, lon, label: result.display_name };
    renderDetailLoading();
    await renderFromNominatim(result, lat, lon);
    addRecent({ label: result.display_name, lat, lon });
  }

  function renderDetailLoading() {
    cardBody.innerHTML = `
      <div class="maps-back-row">
        <button class="maps-btn-text" id="mapsBackBtn">${icons.back} Back</button>
      </div>
      <div class="maps-detail-body"><div class="maps-panel-note">Loading location...</div></div>
    `;
    wireBack();
  }

  function renderBareDetail(label, lat, lon) {
    currentPlace = { lat, lon, label };
    cardBody.innerHTML = `
      <div class="maps-back-row">
        <button class="maps-btn-text" id="mapsBackBtn">${icons.back} Back</button>
      </div>
      <div class="maps-detail-body">
        <div class="maps-detail-title">${escapeHtml(shortLabel(label))}</div>
        <div class="maps-detail-type">${escapeHtml(label || `${lat.toFixed(5)}, ${lon.toFixed(5)}`)}</div>
        <div class="maps-detail-row">${icons.pin}<span>${lat.toFixed(5)}, ${lon.toFixed(5)}</span></div>
        <div class="maps-detail-actions">
          <button class="maps-btn" id="mapsDirectionsBtn">${icons.dir} Directions</button>
          <button class="maps-btn-outline" id="mapsSaveBtn">Save</button>
        </div>
      </div>
    `;
    wireDetailActions();
  }

  async function renderFromNominatim(result, lat, lon) {
    currentPlace = { lat, lon, label: result.display_name };
    if (marker) marker.bindPopup(result.display_name).openPopup();

    const nameDetails = result.namedetails || {};
    const address = result.address || {};
    const name = nameDetails.name || address.amenity || address.building || result.display_name.split(",")[0];
    const typeLabel = (result.type || result.class || "").replace(/_/g, " ");

    let wiki = null;
    try { wiki = await enrichWithWiki(result); } catch { /* best effort */ }

    const photosHtml = wiki && wiki.photo
      ? `<div class="maps-detail-photos"><img src="${wiki.photo}" alt="${escapeHtml(name)}" loading="lazy"></div>`
      : "";

    const descHtml = wiki && wiki.description
      ? `<div class="maps-detail-desc">${escapeHtml(wiki.description)}</div>`
      : "";

    const websiteRaw = result.extratags && (result.extratags.website || result.extratags["contact:website"]);
    const siteHtml = websiteRaw
      ? `<div class="maps-detail-row">${icons.globe}<a href="${websiteRaw}" target="_blank" rel="noopener">${escapeHtml(websiteRaw.replace(/^https?:\/\//, ""))}</a></div>`
      : (wiki && wiki.url ? `<div class="maps-detail-row">${icons.globe}<a href="${wiki.url}" target="_blank" rel="noopener">Wikipedia</a></div>` : "");

    const openingRaw = result.extratags && result.extratags.opening_hours;
    const hoursHtml = openingRaw
      ? `<div class="maps-detail-row">${icons.clock}<span>${escapeHtml(openingRaw)}</span></div>`
      : "";

    cardBody.innerHTML = `
      <div class="maps-back-row">
        <button class="maps-btn-text" id="mapsBackBtn">${icons.back} Back</button>
      </div>
      ${photosHtml}
      <div class="maps-detail-body">
        <div class="maps-detail-title">${escapeHtml(name)}</div>
        ${typeLabel ? `<div class="maps-detail-type">${escapeHtml(typeLabel.replace(/\b\w/g, (c) => c.toUpperCase()))}</div>` : ""}
        ${descHtml}
        <div class="maps-detail-row">${icons.pin}<span>${escapeHtml(result.display_name)}</span></div>
        <div class="maps-detail-row"><span style="width:16px;display:inline-block;"></span><span>${lat.toFixed(5)}, ${lon.toFixed(5)}</span></div>
        ${hoursHtml}
        ${siteHtml}
        <div class="maps-detail-actions">
          <button class="maps-btn" id="mapsDirectionsBtn">${icons.dir} Directions</button>
          <button class="maps-btn-outline" id="mapsSaveBtn">Save</button>
        </div>
      </div>
    `;
    wireDetailActions();
  }

  function wireBack() {
    const btn = $("#mapsBackBtn");
    if (btn) btn.addEventListener("click", showListView);
  }
  function wireDetailActions() {
    wireBack();
    const saveBtn = $("#mapsSaveBtn");
    const dirBtn = $("#mapsDirectionsBtn");
    if (saveBtn) saveBtn.addEventListener("click", openSaveModal);
    if (dirBtn) dirBtn.addEventListener("click", startNavigation);
  }

  /* ============================================================
     LIST VIEW (saved locations) — same card, swapped body
     ============================================================ */
  function showListView() {
    if (marker) { map.removeLayer(marker); marker = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    currentPlace = null;
    renderSavedList();
  }

  async function renderSavedList() {
    cardBody.innerHTML = `
      <div class="maps-panel-title">Saved Locations</div>
      <div class="maps-signin-notice" id="mapsSigninNotice" style="display:none;">
        Sign in to save pins and access them from any device.
      </div>
      <div class="maps-saved-list" id="mapsSavedList"></div>
    `;
    await loadSavedLocations();
  }

  async function loadSavedLocations() {
    const notice = $("#mapsSigninNotice");
    const list = $("#mapsSavedList");
    if (!list) return;
    if (!currentUser) {
      list.innerHTML = "";
      if (notice) notice.style.display = "block";
      return;
    }
    if (notice) notice.style.display = "none";
    try {
      const { data, error } = await window.supabaseClient
        .from("saved_locations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      renderSavedItems(data || []);
    } catch (err) {
      showError(err.message || "Couldn't load saved locations");
    }
  }

  function renderSavedItems(items) {
    const list = $("#mapsSavedList");
    if (!list) return;
    if (!items.length) {
      list.innerHTML = `<div class="maps-panel-note">No saved locations yet. Search or drop a pin, then save it.</div>`;
      return;
    }
    list.innerHTML = items.map((it) => `
      <div class="maps-saved-item" data-id="${it.id}" data-lat="${it.lat}" data-lon="${it.lon}" data-label="${encodeURIComponent(it.label)}">
        <div class="maps-saved-pin">${icons.pin}</div>
        <div class="maps-saved-text">
          <div class="maps-saved-label">${escapeHtml(it.label)}</div>
          <div class="maps-saved-coords">${it.lat.toFixed(4)}, ${it.lon.toFixed(4)}${it.note ? " - " + escapeHtml(it.note) : ""}</div>
        </div>
        <button class="maps-saved-del" data-del="${it.id}" aria-label="Delete">${icons.close}</button>
      </div>
    `).join("");

    list.querySelectorAll(".maps-saved-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-del]")) return;
        const lat = parseFloat(el.dataset.lat);
        const lon = parseFloat(el.dataset.lon);
        const label = decodeURIComponent(el.dataset.label);
        hideDropdown();
        placeMarker(lat, lon);
        focusMap(lat, lon, 16);
        renderDetailLoading();
        nominatimReverse(lat, lon)
          .then((r) => renderFromNominatim(r, lat, lon))
          .catch(() => renderBareDetail(label, lat, lon));
      });
    });
    list.querySelectorAll("[data-del]").forEach((btn) => {
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

  /* ============================================================
     SAVE MODAL
     ============================================================ */
  function openSaveModal() {
    if (!currentUser) { showError("Sign in to save locations"); return; }
    if (!currentPlace) return;
    modalLabel.value = currentPlace.label ? shortLabel(currentPlace.label) : "Saved place";
    modalNote.value = "";
    modalOverlay.classList.add("show");
    modalLabel.focus();
  }
  modalCancel.addEventListener("click", () => modalOverlay.classList.remove("show"));
  modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove("show"); });
  modalSave.addEventListener("click", async () => {
    const label = modalLabel.value.trim() || "Saved place";
    const note = modalNote.value.trim() || null;
    if (!currentPlace) return;
    modalSave.disabled = true;
    try {
      const { error } = await window.supabaseClient.from("saved_locations").insert({
        user_id: currentUser.id,
        label,
        lat: currentPlace.lat,
        lon: currentPlace.lon,
        note,
      });
      if (error) throw error;
      modalOverlay.classList.remove("show");
    } catch (err) {
      showError(err.message || "Couldn't save location");
    } finally {
      modalSave.disabled = false;
    }
  });

  /* ============================================================
     SEARCH + SUGGESTIONS
     ============================================================ */
  function myLocationRow() {
    return `<div class="maps-suggest-item" data-kind="me">
      <span class="maps-suggest-icon">${icons.pin}</span>
      <span class="maps-suggest-text"><div class="maps-suggest-main">Your location</div></span>
    </div>`;
  }

  function hideDropdown() {
    dropdown.classList.remove("visible");
    dropdown.innerHTML = "";
    suggestList = [];
    suggestIdx = -1;
  }

  function buildRows(recentItems, searchItems) {
    let html = myLocationRow();
    suggestList = [{ kind: "me" }];

    if (recentItems.length) {
      html += `<div class="maps-suggest-section-label">Recent</div>`;
      recentItems.forEach((it) => {
        suggestList.push({ kind: "recent", ...it });
        html += `<div class="maps-suggest-item" data-kind="recent" data-idx="${suggestList.length - 1}">
          <span class="maps-suggest-icon">${icons.clock}</span>
          <span class="maps-suggest-text"><div class="maps-suggest-main">${escapeHtml(shortLabel(it.label))}</div><div class="maps-suggest-sub">${escapeHtml(it.label)}</div></span>
          <button class="maps-suggest-remove" data-remove="${encodeURIComponent(it.label)}" aria-label="Remove">${icons.x}</button>
        </div>`;
      });
    }

    if (searchItems && searchItems.length) {
      html += `<div class="maps-suggest-section-label">Suggestions</div>`;
      searchItems.forEach((it) => {
        suggestList.push({ kind: "search", raw: it, label: it.display_name, lat: parseFloat(it.lat), lon: parseFloat(it.lon) });
        const main = shortLabel(it.display_name);
        const sub = it.display_name.split(",").slice(1).join(",").trim();
        html += `<div class="maps-suggest-item" data-kind="search" data-idx="${suggestList.length - 1}">
          <span class="maps-suggest-icon">${icons.search}</span>
          <span class="maps-suggest-text"><div class="maps-suggest-main">${escapeHtml(main)}</div>${sub ? `<div class="maps-suggest-sub">${escapeHtml(sub)}</div>` : ""}</span>
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
        hideDropdown();
        searchInput.value = shortLabel(item.label);
        if (item.kind === "search" && item.raw) {
          selectFromResult(item.raw);
        } else {
          selectRawLatLng(item.lat, item.lon);
          addRecent({ label: item.label, lat: item.lat, lon: item.lon });
        }
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
    const matchingRecent = recent.filter((r) => r.label.toLowerCase().includes(lower)).slice(0, 5);
    buildRows(matchingRecent, []);

    if (q === lastQuery) return;
    lastQuery = q;
    try {
      const results = await nominatimSearch(q, 5);
      if (searchInput.value.trim() !== q) return; // stale
      const seen = new Set(matchingRecent.map((r) => r.label));
      const filtered = (results || []).filter((r) => !seen.has(r.display_name));
      buildRows(matchingRecent, filtered.slice(0, Math.max(0, 5 - matchingRecent.length + 3)));
    } catch {
      /* suggestions are best-effort */
    }
  }

  searchInput.addEventListener("focus", () => renderForQuery(searchInput.value.trim()));
  searchInput.addEventListener("input", () => {
    clearTimeout(suggestTimer);
    const q = searchInput.value.trim();
    suggestTimer = setTimeout(() => renderForQuery(q), 250);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".maps-search-wrap")) hideDropdown();
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

  /* Full text / full-address search on submit */
  searchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    hideDropdown();
    setStatus("Searching...");
    try {
      const results = await robustSearch(q);
      setStatus("");
      await selectFromResult(results[0]);
    } catch (err) {
      setStatus("");
      showError(err.message || "Couldn't find that place");
    }
  });

  /* ============================================================
     MY LOCATION
     ============================================================ */
  function useMyLocation() {
    if (!navigator.geolocation) { showError("Geolocation isn't supported by this browser"); return; }
    setStatus("Locating...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("");
        selectRawLatLng(pos.coords.latitude, pos.coords.longitude);
        startWatching();
      },
      () => { setStatus(""); showError("Couldn't get your location - check location permissions"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  /* ============================================================
     LIVE TRACKING DOT
     ============================================================ */
  function meIcon() {
    return L.divIcon({
      className: "",
      html: `<div class="maps-me-dot" style="background:${meColor()}"></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
  }
  function updateMeMarker(lat, lon) {
    if (!meMarker) {
      meMarker = L.marker([lat, lon], { icon: meIcon(), zIndexOffset: 1000 }).addTo(map);
    } else {
      meMarker.setIcon(meIcon());
      meMarker.setLatLng([lat, lon]);
    }
    return { lat, lon };
  }
  function startWatching(onUpdate) {
    if (!navigator.geolocation) return;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const p = updateMeMarker(pos.coords.latitude, pos.coords.longitude);
        if (onUpdate) onUpdate(p);
      },
      () => { /* best-effort */ },
      { enableHighAccuracy: true, maximumAge: 4000 }
    );
  }

  /* ============================================================
     NAVIGATION MODE (fullscreen directions + live tracking)
     ============================================================ */
  function startNavigation() {
    if (!currentPlace) return;
    if (!navigator.geolocation) { showError("Geolocation isn't supported by this browser"); return; }
    setStatus("Getting your location...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStatus("");
        enterNavMode({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => { setStatus(""); showError("Couldn't get your location - check location permissions"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function requestRoute(origin) {
    try {
      const url = `${OSRM}/route/v1/driving/${origin.lon},${origin.lat};${currentPlace.lon},${currentPlace.lat}?overview=full&geometries=geojson`;
      const data = await fetchJson(url);
      if (!data.routes || !data.routes.length) throw new Error("No route found");
      const route = data.routes[0];

      if (routeLine) map.removeLayer(routeLine);
      const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
      routeLine = L.polyline(coords, { color: meColor(), weight: 6, opacity: 0.85 }).addTo(map);
      if (!navActive) map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });

      const km = (route.distance / 1000).toFixed(1);
      const mins = Math.round(route.duration / 60);
      navEta.textContent = `${mins} min`;
      navSub.textContent = `${km} km - ${shortLabel(currentPlace.label) || "Destination"}`;
    } catch (err) {
      showError("Couldn't get directions to that location");
    }
  }

  function enterNavMode(origin) {
    navActive = true;
    mapsCard.classList.add("hidden");
    navBar.classList.add("show");
    updateMeMarker(origin.lat, origin.lon);
    requestRoute(origin);
    startWatching((pos) => {
      map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 17));
      if (navActive) requestRoute(pos);
    });
    map.setView([origin.lat, origin.lon], 17);
  }

  function exitNavMode() {
    navActive = false;
    mapsCard.classList.remove("hidden");
    navBar.classList.remove("show");
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  }
  navExitBtn.addEventListener("click", exitNavMode);

  /* ============================================================
     AUTH
     ============================================================ */
  async function initAuth() {
    showListView();
    if (!window.supabaseClient) return;
    const { data: { session } } = await window.supabaseClient.auth.getSession();
    currentUser = session?.user ?? null;
    await loadSavedLocations();
    window.supabaseClient.auth.onAuthStateChange((_event, sess) => {
      currentUser = sess?.user ?? null;
      loadSavedLocations();
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("maps-lock");
    initMap();
    initAuth();
  });
})();
