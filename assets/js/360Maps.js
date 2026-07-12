/* ============================================================
   360 MAPS — assets/js/360Maps.js
   Fully free stack, no API key / no billing required:
     - Map tiles:   OpenStreetMap
     - Search/geocoding: Nominatim (OpenStreetMap)
     - Directions:  OSRM public demo server
     - Photos/description for landmarks: Wikipedia REST API
   ============================================================ */
(function () {
  "use strict";
  function run() {

  const RECENT_KEY = "360_maps_recent";
  const MAX_RECENT = 8;
  const NOMINATIM = "https://nominatim.openstreetmap.org";
  const OSRM = "https://router.project-osrm.org";

  let map = null;
  let marker = null;
  let meMarker = null;
  let routeLine = null;
  let traveledLine = null;
  let watchId = null;
  let orientationHandler = null;
  let navActive = false;
  let currentUser = null;
  let currentPlace = null; // { lat, lon, label }

  let mapHeading = 0;          // current compass rotation applied to the map (0 = north up)
  let usingCompass = false;    // true once real device-orientation data has arrived
  let travelHeading = 0;       // fallback heading derived from GPS movement
  let lastPos = null;          // { lat, lon } of previous fix, for bearing fallback
  let routeCoords = [];        // full [lat,lon] route geometry for the active nav
  let navMode = "car";
  let lastRerouteAt = 0;

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

    // Drop a pin only on a genuine tap/click - not at the end of a drag.
    // Leaflet's own click-after-drag suppression isn't reliable on every
    // input device, so distance + time are measured manually here.
    let downPoint = null;
    let downTime = 0;
    map.on("mousedown", (e) => { downPoint = e.containerPoint; downTime = Date.now(); });
    map.on("mouseup", (e) => {
      if (!downPoint) return;
      const dist = downPoint.distanceTo(e.containerPoint);
      const elapsed = Date.now() - downTime;
      downPoint = null;
      if (dist < 8 && elapsed < 600) {
        selectRawLatLng(e.latlng.lat, e.latlng.lng);
      }
    });
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
        title: data.title || title,
        description: data.extract || null,
        photo: data.thumbnail ? data.thumbnail.source : (data.originalimage ? data.originalimage.source : null),
        url: data.content_urls && data.content_urls.desktop ? data.content_urls.desktop.page : null,
      };
    } catch {
      return null;
    }
  }

  /* Nearby-article fallback: most addresses have no direct OSM wikipedia tag,
     so search Wikipedia geographically around the coordinate as a best-effort
     way to still surface a description and photo. */
  async function fetchWikiNearby(lat, lon) {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lon}&gsradius=300&gslimit=1&format=json&origin=*`;
      const data = await fetchJson(url);
      const hit = data.query && data.query.geosearch && data.query.geosearch[0];
      if (!hit) return null;
      return fetchWikiSummary(hit.title, "en");
    } catch {
      return null;
    }
  }

  /* Second photo via Wikidata's P18 (image) claim, when OSM links a wikidata id */
  async function fetchWikidataImage(qid) {
    try {
      const url = `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`;
      const data = await fetchJson(url);
      const entity = data.entities && data.entities[qid];
      const claims = entity && entity.claims && entity.claims.P18;
      const filename = claims && claims[0] && claims[0].mainsnak && claims[0].mainsnak.datavalue && claims[0].mainsnak.datavalue.value;
      if (!filename) return null;
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=480`;
    } catch {
      return null;
    }
  }

  async function enrichWithWiki(nominatimResult, lat, lon) {
    const extratags = nominatimResult.extratags || {};
    let summary = null;

    const wikipediaTag = extratags.wikipedia; // e.g. "en:Statue of Liberty"
    if (wikipediaTag) {
      const [lang, ...rest] = wikipediaTag.split(":");
      const title = rest.join(":");
      if (title) summary = await fetchWikiSummary(title, lang);
    }

    if (!summary) {
      summary = await fetchWikiNearby(lat, lon);
    }

    const photos = [];
    if (summary && summary.photo) photos.push(summary.photo);

    if (extratags.wikidata) {
      const secondPhoto = await fetchWikidataImage(extratags.wikidata);
      if (secondPhoto && !photos.includes(secondPhoto)) photos.push(secondPhoto);
    }

    return { summary, photos };
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
    const extratags = result.extratags || {};
    const name = nameDetails.name || address.amenity || address.building || address.shop || result.display_name.split(",")[0];
    const typeLabel = (result.type || result.class || "").replace(/_/g, " ");

    let enrichment = null;
    try { enrichment = await enrichWithWiki(result, lat, lon); } catch { /* best effort */ }
    const wiki = enrichment && enrichment.summary;
    const photos = (enrichment && enrichment.photos) || [];

    const photosHtml = photos.length
      ? `<div class="maps-detail-photos">${photos.map((u) => `<img src="${u}" alt="${escapeHtml(name)}" loading="lazy">`).join("")}</div>`
      : "";

    const descHtml = wiki && wiki.description
      ? `<div class="maps-detail-desc">${escapeHtml(wiki.description)}</div>`
      : "";

    const websiteRaw = extratags.website || extratags["contact:website"] || extratags["contact:facebook"];
    const siteHtml = websiteRaw
      ? `<div class="maps-detail-row">${icons.globe}<a href="${websiteRaw}" target="_blank" rel="noopener">${escapeHtml(websiteRaw.replace(/^https?:\/\//, ""))}</a></div>`
      : (wiki && wiki.url ? `<div class="maps-detail-row">${icons.globe}<a href="${wiki.url}" target="_blank" rel="noopener">Wikipedia - ${escapeHtml(wiki.title || "")}</a></div>` : "");

    const openingRaw = extratags.opening_hours;
    const hoursHtml = openingRaw
      ? `<div class="maps-detail-row">${icons.clock}<span>${escapeHtml(openingRaw)}</span></div>`
      : "";

    const phoneRaw = extratags.phone || extratags["contact:phone"];
    const phoneHtml = phoneRaw
      ? `<div class="maps-detail-row">${icons.globe}<a href="tel:${phoneRaw}">${escapeHtml(phoneRaw)}</a></div>`
      : "";

    // Address facts grid - always available from Nominatim, gives real
    // structured information even when there's no Wikipedia article.
    const factRows = [
      ["Street", [address.house_number, address.road].filter(Boolean).join(" ")],
      ["Neighborhood", address.neighbourhood || address.suburb],
      ["City", address.city || address.town || address.village],
      ["State / Region", address.state],
      ["Postal code", address.postcode],
      ["Country", address.country],
    ].filter(([, v]) => !!v);

    const extraFacts = [
      ["Cuisine", extratags.cuisine],
      ["Brand", extratags.brand || extratags.operator],
      ["Wheelchair access", extratags.wheelchair],
      ["Internet access", extratags.internet_access],
    ].filter(([, v]) => !!v);

    const allFacts = [...factRows, ...extraFacts];
    const factsHtml = allFacts.length
      ? `<div class="maps-detail-facts">${allFacts.map(([k, v]) => `
          <div class="maps-fact"><span class="maps-fact-k">${escapeHtml(k)}</span><span class="maps-fact-v">${escapeHtml(String(v).replace(/_/g, " "))}</span></div>
        `).join("")}</div>`
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
        ${phoneHtml}
        ${siteHtml}
        ${factsHtml}
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
      const { data, error } = await supabaseClient
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
          const { error } = await supabaseClient.from("saved_locations").delete().eq("id", id);
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
      const { error } = await supabaseClient.from("saved_locations").insert({
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
     GEOLOCATION (robust: high-accuracy first, falls back to
     low-accuracy so it doesn't hang forever waiting for GPS lock)
     ============================================================ */
  function getPosition(onOk, onFail) {
    if (!navigator.geolocation) { onFail("Geolocation isn't supported by this browser"); return; }

    let settled = false;
    const tryLowAccuracy = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => { if (!settled) { settled = true; onOk(pos); } },
        (err) => { if (!settled) { settled = true; onFail(geoErrorMessage(err)); } },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    };

    navigator.geolocation.getCurrentPosition(
      (pos) => { if (!settled) { settled = true; onOk(pos); } },
      () => { if (!settled) tryLowAccuracy(); },
      { enableHighAccuracy: true, timeout: 6000, maximumAge: 0 }
    );
  }

  function geoErrorMessage(err) {
    if (!err) return "Couldn't get your location";
    switch (err.code) {
      case 1: return "Location access is blocked for this site. Check your browser's site settings and allow location.";
      case 2: return "Your device couldn't determine a location right now. Try again in a moment.";
      case 3: return "Location request timed out. Try again.";
      default: return "Couldn't get your location - check location permissions";
    }
  }

  /* ── My location ── */
  function useMyLocation() {
    setStatus("Locating...");
    getPosition(
      (pos) => {
        setStatus("");
        selectRawLatLng(pos.coords.latitude, pos.coords.longitude);
        startWatching();
      },
      (msg) => { setStatus(""); showError(msg); }
    );
  }

  /* ============================================================
     LIVE TRACKING DOT
     ============================================================ */
  /* ============================================================
     GEO MATH HELPERS
     ============================================================ */
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  function haversine(a, b) {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * D2R;
    const dLon = (b.lon - a.lon) * D2R;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function bearing(a, b) {
    const y = Math.sin((b.lon - a.lon) * D2R) * Math.cos(b.lat * D2R);
    const x = Math.cos(a.lat * D2R) * Math.sin(b.lat * D2R) -
      Math.sin(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.cos((b.lon - a.lon) * D2R);
    return (Math.atan2(y, x) * R2D + 360) % 360;
  }
  function nearestRouteIndex(pos) {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < routeCoords.length; i++) {
      const d = haversine(pos, { lat: routeCoords[i][0], lon: routeCoords[i][1] });
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return { idx: bestIdx, dist: bestDist };
  }

  /* ============================================================
     MAP / MARKER ROTATION (compass-facing navigation)
     ============================================================ */
  const mapsCanvasEl = document.getElementById("mapsCanvas");

  function applyMapRotation(deg) {
    mapHeading = deg;
    mapsCanvasEl.style.transform = `rotate(${-deg}deg) scale(1.6)`;
  }
  function resetMapRotation() {
    mapHeading = 0;
    usingCompass = false;
    mapsCanvasEl.style.transform = "";
  }

  function startCompass() {
    if (orientationHandler) return;
    orientationHandler = (e) => {
      let heading = null;
      if (typeof e.webkitCompassHeading === "number") {
        heading = e.webkitCompassHeading; // iOS Safari: already 0-360, 0 = north
      } else if (e.absolute && typeof e.alpha === "number") {
        heading = (360 - e.alpha) % 360;
      }
      if (heading === null || Number.isNaN(heading)) return;
      usingCompass = true;
      if (navActive) applyMapRotation(heading);
      updateMeMarkerRotation();
    };
    window.addEventListener("deviceorientationabsolute", orientationHandler, true);
    window.addEventListener("deviceorientation", orientationHandler, true);
  }
  function stopCompass() {
    if (!orientationHandler) return;
    window.removeEventListener("deviceorientationabsolute", orientationHandler, true);
    window.removeEventListener("deviceorientation", orientationHandler, true);
    orientationHandler = null;
  }
  async function requestCompassPermission() {
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res === "granted") startCompass();
      } else {
        startCompass();
      }
    } catch {
      startCompass();
    }
  }

  /* ============================================================
     LIVE "YOU ARE HERE" MARKER (Google-Maps-style facing arrow)
     ============================================================ */
  function meIcon() {
    return L.divIcon({
      className: "maps-me-icon-wrap",
      html: `<img class="maps-me-img" src="/assets/img/360maps-me-marker.png" width="30" height="30" alt="">`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }
  function updateMeMarkerRotation() {
    if (!meMarker) return;
    const el = meMarker.getElement();
    if (!el) return;
    const img = el.querySelector(".maps-me-img");
    if (!img) return;
    // When the map itself rotates to face-up, cancel that rotation so the
    // icon stays pointing straight up (forward). Otherwise, point it
    // toward the direction of travel on the static north-up map.
    const deg = usingCompass ? mapHeading : travelHeading;
    img.style.transform = `rotate(${deg}deg)`;
  }
  function updateMeMarker(lat, lon) {
    if (!meMarker) {
      meMarker = L.marker([lat, lon], { icon: meIcon(), zIndexOffset: 1000 }).addTo(map);
      meMarker.on("add", updateMeMarkerRotation);
    } else {
      meMarker.setLatLng([lat, lon]);
    }
    updateMeMarkerRotation();
    return { lat, lon };
  }

  function startWatching(onUpdate) {
    if (!navigator.geolocation) return;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lon: pos.coords.longitude };

        // Prefer real device heading (facing direction) when compass isn't
        // driving rotation; else fall back to GPS course, else movement bearing.
        if (!usingCompass) {
          if (typeof pos.coords.heading === "number" && !Number.isNaN(pos.coords.heading)) {
            travelHeading = pos.coords.heading;
          } else if (lastPos && haversine(lastPos, here) > 3) {
            travelHeading = bearing(lastPos, here);
          }
        }
        lastPos = here;

        updateMeMarker(here.lat, here.lon);
        if (onUpdate) onUpdate(here);
      },
      () => { /* best-effort - live tracking just skips a beat on error */ },
      { enableHighAccuracy: true, maximumAge: 4000, timeout: 8000 }
    );
  }

  /* ============================================================
     TRANSPORT MODE PICKER
     ============================================================ */
  const TRAVEL_MODES = {
    car:      { label: "Car",     profile: "driving", icon: "M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11m-14 0h14m-14 0-1 5v3h2v-2h12v2h2v-3l-1-5M7.5 15.5h.01M16.5 15.5h.01" },
    transit:  { label: "Transit", profile: "foot",    icon: "M4 16V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 11h16M8 21l-2-3m10 3 2-3M8 8h8" },
    bike:     { label: "Bike",    profile: "cycling", icon: "M5 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM5 16l4-7h5l3 7M9 9 8 6h3" },
    walk:     { label: "Walk",    profile: "foot",    icon: "M13 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM7 21l2-6 2 2 1 4M9 15l-1-5 3-2 3 3 3 1M11 10l1-3" },
  };

  function openModePicker() {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "maps-modal-overlay show";
      overlay.innerHTML = `
        <div class="maps-modal maps-mode-modal">
          <h3>Directions by</h3>
          <div class="maps-mode-grid">
            ${Object.entries(TRAVEL_MODES).map(([key, m]) => `
              <button class="maps-mode-btn" data-mode="${key}">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${m.icon}"/></svg>
                <span>${m.label}</span>
              </button>
            `).join("")}
          </div>
          <div class="maps-modal-actions">
            <button class="maps-btn-outline" id="mapsModeCancel">Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);

      function cleanup(result) {
        overlay.remove();
        resolve(result);
      }
      overlay.querySelectorAll("[data-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          // Request fullscreen synchronously within this click handler -
          // browsers require it to happen directly inside a user gesture.
          const el = document.documentElement;
          const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
          if (req) { try { req.call(el); } catch { /* ignore */ } }
          cleanup(btn.dataset.mode);
        });
      });
      overlay.querySelector("#mapsModeCancel").addEventListener("click", () => cleanup(null));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(null); });
    });
  }

  /* ============================================================
     NAVIGATION MODE (fullscreen, facing-up rotation, live reroute)
     ============================================================ */
  async function startNavigation() {
    if (!currentPlace) return;
    const mode = await openModePicker();
    if (!mode) return;

    setStatus("Getting your location...");
    getPosition(
      (pos) => {
        setStatus("");
        enterNavMode({ lat: pos.coords.latitude, lon: pos.coords.longitude }, mode);
      },
      (msg) => { setStatus(""); showError(msg); }
    );
  }

  /* Draws the route split into a gray "already traveled" segment and a
     colored "remaining" segment, based on the closest point on the route
     to the current position. */
  function drawRouteProgress(pos) {
    if (!routeCoords.length) return;
    const { idx } = nearestRouteIndex(pos);

    if (traveledLine) map.removeLayer(traveledLine);
    if (routeLine) map.removeLayer(routeLine);

    const traveled = routeCoords.slice(0, idx + 1);
    const remaining = routeCoords.slice(idx);

    if (traveled.length > 1) {
      traveledLine = L.polyline(traveled, { color: "#9aa0a6", weight: 6, opacity: 0.85 }).addTo(map);
    }
    if (remaining.length > 1) {
      routeLine = L.polyline(remaining, { color: meColor(), weight: 6, opacity: 0.9 }).addTo(map);
    }
  }

  // The free public OSRM demo server (router.project-osrm.org) only reliably
  // hosts the "driving" profile - requesting /foot/ or /bike/ against it
  // silently falls back to car-speed timing, which is why walking/biking
  // times were coming back at driving speed. So we always fetch the
  // "driving" road-network geometry, then compute a realistic duration
  // ourselves for non-driving modes using typical average speeds.
  const MODE_SPEED_MPS = {
    car: null,     // use OSRM's own driving duration
    bike: 4.2,      // ~15 km/h
    walk: 1.35,     // ~4.9 km/h
    transit: 1.35,  // shown as walking, see note in the UI
  };

  async function fetchRoute(origin, heading) {
    let bearingsParam = "";
    if (typeof heading === "number" && !Number.isNaN(heading)) {
      const h = Math.round(((heading % 360) + 360) % 360);
      bearingsParam = `&bearings=${h},60;0,180`;
    }
    const url = `${OSRM}/route/v1/driving/${origin.lon},${origin.lat};${currentPlace.lon},${currentPlace.lat}?overview=full&geometries=geojson${bearingsParam}`;
    const data = await fetchJson(url);
    if (!data.routes || !data.routes.length) throw new Error("No route found");
    return data.routes[0];
  }

  async function requestRoute(origin, mode) {
    try {
      const heading = usingCompass ? mapHeading : travelHeading;
      const route = await fetchRoute(origin, heading);
      routeCoords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
      if (traveledLine) { map.removeLayer(traveledLine); traveledLine = null; }
      if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
      routeLine = L.polyline(routeCoords, { color: meColor(), weight: 6, opacity: 0.9 }).addTo(map);
      if (!navActive) map.fitBounds(routeLine.getBounds(), { padding: [60, 60] });

      const speed = MODE_SPEED_MPS[mode];
      const durationSec = speed ? route.distance / speed : route.duration;

      const km = (route.distance / 1000).toFixed(1);
      const mins = Math.max(1, Math.round(durationSec / 60));
      navEta.textContent = `${mins} min`;
      const modeNote = mode === "transit" ? " (walking pace shown - live transit routing isn't available on the free routing engine used here)" : "";
      navSub.textContent = `${km} km - ${shortLabel(currentPlace.label) || "Destination"}${modeNote}`;
    } catch (err) {
      showError("Couldn't get directions to that location");
    }
  }

  async function maybeReroute(pos) {
    if (!navActive || !routeCoords.length) return;
    const { dist } = nearestRouteIndex(pos);
    const now = Date.now();
    if (dist > 45 && now - lastRerouteAt > 8000) {
      lastRerouteAt = now;
      await requestRoute(pos, navMode);
    }
  }

  function enterNavMode(origin, mode) {
    navActive = true;
    navMode = mode;
    lastPos = origin;
    document.body.classList.add("maps-nav-fullscreen");
    mapsCard.classList.add("hidden");
    navBar.classList.add("show");
    map.dragging.disable();
    map.doubleClickZoom.disable();
    updateMeMarker(origin.lat, origin.lon);
    requestCompassPermission();
    requestRoute(origin, mode);
    startWatching((pos) => {
      drawRouteProgress(pos);
      maybeReroute(pos);
      if (usingCompass) {
        // Map already rotates from the compass listener; just keep it centered.
        map.setView([pos.lat, pos.lon], map.getZoom(), { animate: true });
      } else {
        map.panTo([pos.lat, pos.lon]);
      }
    });
    map.setView([origin.lat, origin.lon], 17);
  }

  function exitNavMode() {
    navActive = false;
    stopCompass();
    resetMapRotation();
    updateMeMarkerRotation();
    map.dragging.enable();
    map.doubleClickZoom.enable();
    document.body.classList.remove("maps-nav-fullscreen");
    mapsCard.classList.remove("hidden");
    navBar.classList.remove("show");
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (traveledLine) { map.removeLayer(traveledLine); traveledLine = null; }
    routeCoords = [];
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) { try { exit.call(document); } catch { /* ignore */ } }
    }
  }
  navExitBtn.addEventListener("click", exitNavMode);

  document.addEventListener("fullscreenchange", () => {
    if (navActive && !document.fullscreenElement) exitNavMode();
  });
  document.addEventListener("webkitfullscreenchange", () => {
    if (navActive && !document.webkitFullscreenElement) exitNavMode();
  });


  /* ============================================================
     AUTH
     ============================================================ */
  async function initAuth() {
    showListView();
    if (typeof supabaseClient === "undefined" || !supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user ?? null;
    await loadSavedLocations();
    supabaseClient.auth.onAuthStateChange((_event, sess) => {
      currentUser = sess?.user ?? null;
      loadSavedLocations();
    });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  document.body.classList.add("maps-lock");
  initMap();
  initAuth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
