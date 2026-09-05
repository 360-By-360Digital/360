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
  const OSRM_BIKE = "https://routing.openstreetmap.de/routed-bike";
  const OSRM_FOOT = "https://routing.openstreetmap.de/routed-foot";

  // ── AI config ──────────────────────────────────────────────
  // The Supabase Edge Function proxies requests to Anthropic so
  // no API key is ever exposed in client-side JS.
  const AI_EDGE_FN = "https://wiswfpfsjiowtrdyqpxy.supabase.co/functions/v1/maps-ai";
  const AI_PREF_KEY = "360maps_ai_enabled";
  let aiEnabled = (() => { try { return localStorage.getItem(AI_PREF_KEY) !== "false"; } catch { return true; } })();
  // ──────────────────────────────────────────────────────────

  const POI_TAGS = {
    restaurant: 'amenity=restaurant', cafe: 'amenity=cafe', fuel: 'amenity=fuel',
    atm: 'amenity=atm', hospital: 'amenity=hospital', park: 'leisure=park',
    supermarket: 'shop=supermarket', pharmacy: 'amenity=pharmacy',
  };
  const POI_ICON = { restaurant: '🍽️', cafe: '☕', fuel: '⛽', atm: '🏧', hospital: '🏥', park: '🌳', supermarket: '🛒', pharmacy: '💊' };
  const CATS = [
    { id: 'home', icon: '🏠', label: 'Home' },
    { id: 'work', icon: '💼', label: 'Work' },
    { id: 'food', icon: '🍽️', label: 'Food' },
    { id: 'shopping', icon: '🛍️', label: 'Shopping' },
    { id: 'nature', icon: '🌳', label: 'Nature' },
    { id: 'favorite', icon: '⭐', label: 'Favorite' },
    { id: 'other', icon: '📍', label: 'Other' },
  ];
  function catMeta(id) { return CATS.find(c => c.id === id) || CATS[CATS.length - 1]; }

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

  // New feature state
  let tileLayer = null;
  let activeTab = "saved";
  let activeCatFilter = "all";
  let savedCache = [];
  let measuring = false;
  let measurePoints = [];
  let measureLine = null;
  let measureMarkers = [];
  let nearbyMarkers = [];
  let routeSteps = [];
  let currentStepIdx = 0;
  let lastRouteFetchPos = null;
  let activeTrip = null;
  let tripStopMarkers = [];
  let navMode = null; // remembers travel mode for rerouting

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
  const navInstruction       = $("#mapsNavInstruction");
  const navStepsToggle        = $("#mapsNavStepsToggle");
  const navStepsPanel          = $("#mapsNavStepsPanel");

  const quickCats       = $("#mapsQuickCats");
  const tabsBar          = $("#mapsTabs");
  const layerSwitcher     = $("#mapsLayerSwitcher");
  const fabStack           = $("#mapsFabStack");
  const zoomInBtn            = $("#mapsZoomInBtn");
  const zoomOutBtn            = $("#mapsZoomOutBtn");
  const measureBtn              = $("#mapsMeasureBtn");
  const fullscreenBtn            = $("#mapsFullscreenBtn");
  const locateBtn                 = $("#mapsLocateBtn");
  const measureReadout             = $("#mapsMeasureReadout");
  const measureText                 = $("#mapsMeasureText");
  const measureClearBtn              = $("#mapsMeasureClear");
  const measureDoneBtn                = $("#mapsMeasureDone");

  const modalCatRow     = $("#mapsModalCatRow");
  const compareOverlay   = $("#mapsCompareOverlay");
  const compareSelect     = $("#mapsCompareSelect");
  const compareResult       = $("#mapsCompareResult");
  const compareCancelBtn     = $("#mapsCompareCancel");

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
  const TILE_LAYERS = {
    standard: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap contributors', maxZoom: 19 },
    dark:     { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 },
    satellite:{ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri', maxZoom: 19 },
    terrain:  { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap, SRTM | &copy; OpenTopoMap', maxZoom: 17 },
  };
  function setTileLayer(style) {
    const cfg = TILE_LAYERS[style] || TILE_LAYERS.standard;
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(cfg.url, { maxZoom: cfg.maxZoom, attribution: cfg.attr }).addTo(map);
    try { localStorage.setItem("360maps_tile_style", style); } catch {}
    layerSwitcher.querySelectorAll(".maps-layer-btn").forEach((b) => b.classList.toggle("active", b.dataset.style === style));
  }
  layerSwitcher.querySelectorAll(".maps-layer-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTileLayer(btn.dataset.style));
  });

  function initMap() {
    map = L.map("mapsCanvas", { zoomControl: false, attributionControl: true }).setView([20, 0], 3);
    let savedStyle = "standard";
    try { savedStyle = localStorage.getItem("360maps_tile_style") || "standard"; } catch {}
    setTileLayer(savedStyle);

    map.on("click", (e) => {
      if (measuring) { addMeasurePoint(e.latlng); return; }
      selectRawLatLng(e.latlng.lat, e.latlng.lng);
    });
  }

  zoomInBtn.addEventListener("click", () => map.zoomIn());
  zoomOutBtn.addEventListener("click", () => map.zoomOut());

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
     AI TOGGLE — persisted preference, shown in search bar
     ============================================================ */
  function renderAiToggle() {
    const existing = document.getElementById("mapsAiToggle");
    if (existing) { existing.remove(); }
    const btn = document.createElement("button");
    btn.id = "mapsAiToggle";
    btn.className = "maps-ai-toggle-btn" + (aiEnabled ? " active" : "");
    btn.title = aiEnabled ? "AI summaries on — click to disable" : "AI summaries off — click to enable";
    btn.setAttribute("aria-label", "Toggle AI summaries");
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a5 5 0 0 1 5 5v1a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5z"/><path d="M15 17H9a3 3 0 0 0-3 3v1h12v-1a3 3 0 0 0-3-3z"/><path d="M12 17v-4M9 13h6"/></svg>`;
    btn.addEventListener("click", () => {
      aiEnabled = !aiEnabled;
      try { localStorage.setItem(AI_PREF_KEY, String(aiEnabled)); } catch {}
      renderAiToggle();
      setStatus(aiEnabled ? "✦ AI summaries enabled" : "AI summaries off");
      setTimeout(() => setStatus(""), 2000);
    });
    // Insert before the locate/voice button area inside search row
    const row = document.querySelector(".maps-search-row");
    if (row) row.appendChild(btn);
  }

  /* ============================================================
     AI PLACE SUMMARY — via Supabase Edge Function (key stays server-side)
     Falls back gracefully if unavailable or disabled.
     ============================================================ */
  async function fetchAISummary(name, typeLabel, address, wikiExtract) {
    if (!aiEnabled) return null;
    try {
      // Pass the Supabase session token so the edge function can verify
      // the request and optionally rate-limit per user.
      let authHeader = {};
      if (typeof supabaseClient !== "undefined" && supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.access_token) {
          authHeader = { Authorization: `Bearer ${session.access_token}` };
        }
      }

      const res = await fetch(AI_EDGE_FN, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ name, typeLabel, address, wikiExtract }),
        signal: AbortSignal.timeout(12000),
      });

      if (!res.ok) return null;
      const data = await res.json();
      return data.summary || null;
    } catch {
      return null; // silently degrade — AI is always optional
    }
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
        <div class="maps-detail-row">${icons.pin}<span>${lat.toFixed(5)}, ${lon.toFixed(5)}</span><button class="maps-copy-coords" id="mapsCopyCoords" title="Copy">📋</button></div>
        <div class="maps-info-strip" id="mapsInfoStrip"><span>⛰️ <b id="mapsElevation">…</b></span><span>🌡️ <b id="mapsWeather">…</b></span></div>
        <div class="maps-detail-actions">
          <button class="maps-btn" id="mapsDirectionsBtn">${icons.dir} Directions</button>
          <button class="maps-btn-outline" id="mapsSaveBtn">Save</button>
          <button class="maps-btn-outline" id="mapsCompareBtn">Compare</button>
          <button class="maps-btn-outline" id="mapsAddStopBtn" style="display:${activeTrip ? "" : "none"};">＋ Trip</button>
        </div>
      </div>
    `;
    wireDetailActions();
    fetchElevationAndWeather(lat, lon);
  }

  async function renderFromNominatim(result, lat, lon) {
    currentPlace = { lat, lon, label: result.display_name };
    if (marker) marker.bindPopup(result.display_name).openPopup();

    const nameDetails = result.namedetails || {};
    const address = result.address || {};
    const extratags = result.extratags || {};
    const name = nameDetails.name || address.amenity || address.building || address.shop || result.display_name.split(",")[0];
    const typeLabel = (result.type || result.class || "").replace(/_/g, " ");

    // Fire wiki enrichment and AI summary in parallel — neither blocks the other
    const [enrichmentResult, aiResult] = await Promise.allSettled([
      enrichWithWiki(result, lat, lon),
      fetchAISummary(
        name,
        typeLabel,
        [address.city || address.town, address.country].filter(Boolean).join(", "),
        null // wiki extract injected below once we have it
      ),
    ]);

    const enrichment = enrichmentResult.value || null;
    const wiki = enrichment && enrichment.summary;
    const photos = (enrichment && enrichment.photos) || [];

    // If AI returned nothing or is disabled, try again with wiki text as context
    // (only if wiki has a description and AI hadn't already returned something)
    let aiSummary = aiResult.value || null;
    if (!aiSummary && wiki && wiki.description && aiEnabled) {
      aiSummary = await fetchAISummary(name, typeLabel,
        [address.city || address.town, address.country].filter(Boolean).join(", "),
        wiki.description.slice(0, 500)
      );
    }

    const photosHtml = photos.length
      ? `<div class="maps-detail-photos">${photos.map((u) => `<img src="${u}" alt="${escapeHtml(name)}" loading="lazy">`).join("")}</div>`
      : "";

    // Priority: AI summary > Wikipedia extract > nothing
    const descText = aiSummary || (wiki && wiki.description) || null;
    const isAiDesc = !!aiSummary;
    const descHtml = descText
      ? `<div class="maps-detail-desc">${escapeHtml(descText)}${isAiDesc ? `<span class="maps-ai-badge" title="Generated by AI">✦ AI</span>` : ""}</div>`
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
        <div class="maps-detail-row"><span style="width:16px;display:inline-block;"></span><span>${lat.toFixed(5)}, ${lon.toFixed(5)}</span><button class="maps-copy-coords" id="mapsCopyCoords" title="Copy">📋</button></div>
        <div class="maps-info-strip" id="mapsInfoStrip"><span>⛰️ <b id="mapsElevation">…</b></span><span>🌡️ <b id="mapsWeather">…</b></span></div>
        ${hoursHtml}
        ${phoneHtml}
        ${siteHtml}
        ${factsHtml}
        <div class="maps-detail-actions">
          <button class="maps-btn" id="mapsDirectionsBtn">${icons.dir} Directions</button>
          <button class="maps-btn-outline" id="mapsSaveBtn">Save</button>
          <button class="maps-btn-outline" id="mapsCompareBtn">Compare</button>
          <button class="maps-btn-outline" id="mapsAddStopBtn" style="display:${activeTrip ? "" : "none"};">＋ Trip</button>
        </div>
      </div>
    `;
    wireDetailActions();
    fetchElevationAndWeather(lat, lon);
  }

  function wireBack() {
    const btn = $("#mapsBackBtn");
    if (btn) btn.addEventListener("click", showListView);
  }
  function wireDetailActions() {
    wireBack();
    const saveBtn = $("#mapsSaveBtn");
    const dirBtn = $("#mapsDirectionsBtn");
    const compareBtn = $("#mapsCompareBtn");
    const copyBtn = $("#mapsCopyCoords");
    const addStopBtn = $("#mapsAddStopBtn");
    if (saveBtn) saveBtn.addEventListener("click", openSaveModal);
    if (dirBtn) dirBtn.addEventListener("click", startNavigation);
    if (compareBtn) compareBtn.addEventListener("click", openCompareModal);
    if (copyBtn) copyBtn.addEventListener("click", () => {
      if (!currentPlace) return;
      navigator.clipboard?.writeText(`${currentPlace.lat.toFixed(5)}, ${currentPlace.lon.toFixed(5)}`).then(() => setStatus("📋 Copied")).catch(() => {});
      setTimeout(() => setStatus(""), 1500);
    });
    if (addStopBtn) addStopBtn.addEventListener("click", async () => {
      if (!activeTrip || !currentPlace) return;
      await addStopToTrip(activeTrip.id, currentPlace);
    });
  }

  function fetchElevationAndWeather(lat, lon) {
    const elEl = $("#mapsElevation"), wEl = $("#mapsWeather");
    if (!elEl || !wEl) return;
    fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`)
      .then((r) => r.json())
      .then((d) => { const m = d?.results?.[0]?.elevation; if (elEl.isConnected) elEl.textContent = m != null ? `${Math.round(m)} m` : "—"; })
      .catch(() => { if (elEl.isConnected) elEl.textContent = "—"; });
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`)
      .then((r) => r.json())
      .then((d) => {
        const w = d?.current_weather;
        if (!wEl.isConnected) return;
        wEl.textContent = w ? `${Math.round(w.temperature)}°C, ${weatherLabel(w.weathercode)}` : "—";
      })
      .catch(() => { if (wEl.isConnected) wEl.textContent = "—"; });
  }
  function weatherLabel(code) {
    const table = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
      51: "Drizzle", 61: "Rain", 63: "Rain", 65: "Heavy rain", 71: "Snow", 73: "Snow", 75: "Heavy snow",
      80: "Showers", 95: "Storms" };
    return table[code] || "—";
  }

  /* ============================================================
     COMPARE DISTANCE
     ============================================================ */
  function openCompareModal() {
    if (!currentPlace) return;
    if (!savedCache.length) { showError("Save a few places first to compare distances."); return; }
    compareSelect.innerHTML = savedCache.map((p) => `<option value="${p.id}">${escapeHtml(p.label)}</option>`).join("");
    compareOverlay.classList.add("show");
    updateCompareResult();
  }
  compareSelect.addEventListener("change", updateCompareResult);
  function updateCompareResult() {
    const p = savedCache.find((x) => x.id === compareSelect.value);
    if (!p || !currentPlace) return;
    const km = haversineKm(currentPlace.lat, currentPlace.lon, p.lat, p.lon);
    compareResult.innerHTML = `<b>${km.toFixed(2)} km</b> straight-line (${(km * 0.621371).toFixed(2)} mi)`;
  }
  compareCancelBtn.addEventListener("click", () => compareOverlay.classList.remove("show"));
  compareOverlay.addEventListener("click", (e) => { if (e.target === compareOverlay) compareOverlay.classList.remove("show"); });

  /* ============================================================
     LIST VIEW (saved locations) — same card, swapped body
     ============================================================ */
  function showListView() {
    if (marker) { map.removeLayer(marker); marker = null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    currentPlace = null;
    showTab(activeTab);
  }

  tabsBar.querySelectorAll(".maps-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeTab = btn.dataset.tab;
      tabsBar.querySelectorAll(".maps-tab").forEach((b) => b.classList.toggle("active", b === btn));
      showTab(activeTab);
    });
  });

  function showTab(tab) {
    tabsBar.querySelectorAll(".maps-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    if (tab === "trips") renderTripsView();
    else if (tab === "nearby") renderNearbyView();
    else renderSavedList();
  }

  async function renderSavedList() {
    cardBody.innerHTML = `
      <div class="maps-panel-title-row">
        <div class="maps-panel-title">Saved Locations</div>
        <span class="maps-count-badge" id="mapsSavedCount"></span>
      </div>
      <div class="maps-signin-notice" id="mapsSigninNotice" style="display:none;">
        Sign in to save pins and access them from any device.
      </div>
      <div class="maps-cat-filter-row" id="mapsCatFilterRow"></div>
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
      savedCache = data || [];
      renderCatFilterRow();
      renderSavedItems(filterSaved(savedCache));
    } catch (err) {
      showError(err.message || "Couldn't load saved locations");
    }
  }

  function filterSaved(items) {
    return activeCatFilter === "all" ? items : items.filter((p) => (p.category || "other") === activeCatFilter);
  }

  function renderCatFilterRow() {
    const row = $("#mapsCatFilterRow");
    const countBadge = $("#mapsSavedCount");
    if (countBadge) countBadge.textContent = savedCache.length ? String(savedCache.length) : "";
    if (!row) return;
    const cats = ["all", ...new Set(savedCache.map((p) => p.category || "other"))];
    row.innerHTML = cats.map((id) => {
      const meta = id === "all" ? { icon: "🗂️", label: "All" } : catMeta(id);
      return `<button class="maps-cat-chip${activeCatFilter === id ? " active" : ""}" data-filter="${id}">${meta.icon} ${meta.label}</button>`;
    }).join("");
    row.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeCatFilter = btn.dataset.filter;
        renderCatFilterRow();
        renderSavedItems(filterSaved(savedCache));
      });
    });
  }

  function renderSavedItems(items) {
    const list = $("#mapsSavedList");
    if (!list) return;
    if (!items.length) {
      list.innerHTML = `<div class="maps-panel-note">No saved locations${activeCatFilter !== "all" ? " in this category" : " yet"}. Search or drop a pin, then save it.</div>`;
      return;
    }
    list.innerHTML = items.map((it) => `
      <div class="maps-saved-item" data-id="${it.id}" data-lat="${it.lat}" data-lon="${it.lon}" data-label="${encodeURIComponent(it.label)}">
        <div class="maps-saved-pin">${escapeHtml(it.icon || catMeta(it.category).icon)}</div>
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
     NEARBY (Overpass POI search) — real category/place search.
     Nominatim alone is an address geocoder and is genuinely weak at
     "find restaurants near me"-style category queries (it mostly
     matches street/place names), which is why generic searches were
     surfacing mostly roads. This queries OSM's live POI database
     directly for whichever category the user picks.
     ============================================================ */
  let lastPoiTag = null;
  function renderNearbyView() {
    cardBody.innerHTML = `
      <div class="maps-panel-title">Nearby</div>
      <div class="maps-nearby-hint" id="mapsNearbyHint">Pick a category above, or drop a pin first to search around it.</div>
      <div id="mapsNearbyList"></div>
    `;
    if (lastPoiTag) runNearbySearch(lastPoiTag);
  }

  quickCats.querySelectorAll(".maps-quickcat-btn").forEach((btn) => {
    btn.addEventListener("click", () => runNearbySearch(btn.dataset.poi));
  });

  async function runNearbySearch(tag) {
    lastPoiTag = tag;
    activeTab = "nearby";
    tabsBar.querySelectorAll(".maps-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "nearby"));
    if (!$("#mapsNearbyList")) renderNearbyView();

    const center = currentPlace ? [currentPlace.lat, currentPlace.lon] : map.getCenter();
    const [lat, lon] = Array.isArray(center) ? center : [center.lat, center.lng];
    const hint = $("#mapsNearbyHint");
    const list = $("#mapsNearbyList");
    if (hint) hint.textContent = `Searching for ${tag}${currentPlace ? " near " + shortLabel(currentPlace.label) : " around your view"}…`;
    if (list) list.innerHTML = "";
    nearbyMarkers.forEach((m) => map.removeLayer(m));
    nearbyMarkers = [];

    const filter = POI_TAGS[tag];
    const [k, v] = filter.split("=");
    const query = `[out:json][timeout:25];(node["${k}"="${v}"](around:2500,${lat},${lon}););out body 30;`;
    try {
      const res = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(query) });
      const data = await res.json();
      const results = (data.elements || []).filter((el) => el.tags && el.tags.name);
      if (!results.length) { if (hint) hint.textContent = "No results nearby. Try a different area or category."; return; }
      results.sort((a, b) => haversineKm(lat, lon, a.lat, a.lon) - haversineKm(lat, lon, b.lat, b.lon));
      if (hint) hint.textContent = `${results.length} result${results.length === 1 ? "" : "s"} within 2.5 km:`;
      if (list) {
        list.innerHTML = results.map((r, i) => `
          <div class="maps-saved-item maps-nearby-item" data-i="${i}">
            <div class="maps-saved-pin">${POI_ICON[tag] || "📍"}</div>
            <div class="maps-saved-text">
              <div class="maps-saved-label">${escapeHtml(r.tags.name)}</div>
              <div class="maps-saved-coords">${haversineKm(lat, lon, r.lat, r.lon).toFixed(2)} km away</div>
            </div>
          </div>`).join("");
        list.querySelectorAll("[data-i]").forEach((el) => {
          el.addEventListener("click", () => {
            const r = results[+el.dataset.i];
            placeMarker(r.lat, r.lon);
            focusMap(r.lat, r.lon, 16);
            renderDetailLoading();
            nominatimReverse(r.lat, r.lon)
              .then((res2) => renderFromNominatim(res2, r.lat, r.lon))
              .catch(() => renderBareDetail(r.tags.name, r.lat, r.lon));
          });
        });
      }
      results.forEach((r) => nearbyMarkers.push(L.circleMarker([r.lat, r.lon], { radius: 6, color: "#06b6d4", fillOpacity: 0.8 }).addTo(map)));
    } catch (e) {
      if (hint) hint.textContent = "Nearby search failed — check your connection.";
    }
  }

  /* ============================================================
     TRIPS — collaborative multi-stop planning
     ============================================================ */
  let allTrips = [];

  async function renderTripsView() {
    cardBody.innerHTML = `<div class="maps-panel-title">Trips</div><div id="mapsTripsList"></div>`;
    if (!currentUser) { $("#mapsTripsList").innerHTML = `<div class="maps-signin-notice">Sign in to plan trips.</div>`; return; }
    const { data: mine } = await supabaseClient.from("maps_trips").select("*").eq("user_id", currentUser.id);
    const { data: collabRows } = await supabaseClient.from("maps_trip_collaborators").select("trip_id").eq("user_id", currentUser.id);
    const collabIds = (collabRows || []).map((r) => r.trip_id);
    let collabTrips = [];
    if (collabIds.length) { const { data } = await supabaseClient.from("maps_trips").select("*").in("id", collabIds); collabTrips = data || []; }
    allTrips = [...(mine || []), ...collabTrips];
    renderTripsList();
  }

  function renderTripsList() {
    const list = $("#mapsTripsList");
    if (!list) return;
    const newBtn = `<div class="maps-saved-item" id="newTripBtn"><div class="maps-saved-pin">➕</div><div class="maps-saved-text"><div class="maps-saved-label">New trip</div></div></div>`;
    list.innerHTML = newBtn + (allTrips.length ? allTrips.map((t) => `
      <div class="maps-saved-item" data-trip-id="${t.id}">
        <div class="maps-saved-pin">🧳</div>
        <div class="maps-saved-text"><div class="maps-saved-label">${escapeHtml(t.title)}</div>
        <div class="maps-saved-coords">${t.is_public_editable ? "🌐 anyone can edit" : ""}</div></div>
      </div>`).join("") : `<div class="maps-panel-note">No trips yet.</div>`);
    $("#newTripBtn").addEventListener("click", createTrip);
    list.querySelectorAll("[data-trip-id]").forEach((el) => el.addEventListener("click", () => openTrip(el.dataset.tripId)));
  }

  async function createTrip() {
    if (!currentUser) return;
    const title = prompt("Trip name:", "My trip");
    if (!title) return;
    const { data, error } = await supabaseClient.from("maps_trips").insert({ user_id: currentUser.id, title }).select().single();
    if (error) { showError(error.message); return; }
    await renderTripsView();
    openTrip(data.id);
  }

  async function canEditTrip(trip) {
    if (!currentUser) return false;
    if (trip.user_id === currentUser.id) return true;
    if (trip.is_public_editable) return true;
    const { data } = await supabaseClient.from("maps_trip_collaborators").select("user_id").eq("trip_id", trip.id).eq("user_id", currentUser.id).maybeSingle();
    return !!data;
  }

  async function addStopToTrip(tripId, place) {
    const { data: stops } = await supabaseClient.from("maps_trip_stops").select("id").eq("trip_id", tripId);
    await supabaseClient.from("maps_trip_stops").insert({
      trip_id: tripId, name: shortLabel(place.label) || "Stop", lat: place.lat, lng: place.lon,
      added_by: currentUser.id, position: (stops || []).length,
    });
    setStatus("Added to trip"); setTimeout(() => setStatus(""), 1500);
    if (activeTab === "trips") openTrip(tripId);
  }

  async function openTrip(id) {
    let trip = allTrips.find((t) => t.id === id);
    if (!trip) { const { data } = await supabaseClient.from("maps_trips").select("*").eq("id", id).maybeSingle(); trip = data; }
    if (!trip) { showError("Trip not found."); return; }
    activeTrip = trip;
    activeTab = "trips";
    const editable = await canEditTrip(trip);
    const { data: stops } = await supabaseClient.from("maps_trip_stops").select("*").eq("trip_id", id).order("position", { ascending: true });
    const isOwner = currentUser && trip.user_id === currentUser.id;

    tripStopMarkers.forEach((m) => map.removeLayer(m));
    tripStopMarkers = [];
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    (stops || []).forEach((s, i) => tripStopMarkers.push(L.marker([s.lat, s.lng]).addTo(map).bindTooltip(`${i + 1}. ${s.name}`)));
    if (stops?.length) map.fitBounds(L.latLngBounds(stops.map((s) => [s.lat, s.lng])), { padding: [50, 50] });

    const list = $("#mapsTripsList");
    if (!list) return;
    list.innerHTML = `
      <div class="maps-back-row"><button class="maps-btn-text" id="tripBackBtn">${icons.back} All trips</button></div>
      <div class="maps-detail-title">${escapeHtml(trip.title)}</div>
      <div class="maps-detail-type">${(stops || []).length} stop${(stops || []).length === 1 ? "" : "s"}${editable ? " · you can edit" : ""}</div>
      <div class="maps-detail-actions" style="margin:10px 0;flex-wrap:wrap;">
        ${editable ? `<button class="maps-btn" id="addStopHereBtn">＋ Add current pin</button>` : ""}
        <button class="maps-btn-outline" id="shareTripBtn">🔗 Share</button>
        ${(stops || []).length >= 2 ? `<button class="maps-btn-outline" id="routeTripBtn">Route</button><button class="maps-btn-outline" id="gpxTripBtn">⬇ GPX</button>` : ""}
        ${isOwner ? `<button class="maps-btn-outline" id="manageTripBtn">⚙️</button>` : ""}
      </div>
      <div class="maps-saved-list">
        ${(stops || []).map((s, i) => `
          <div class="maps-saved-item" data-stop-id="${s.id}">
            ${editable ? `<div class="maps-reorder-btns"><button data-up="${s.id}" ${i === 0 ? "disabled" : ""}>▲</button><button data-down="${s.id}" ${i === stops.length - 1 ? "disabled" : ""}>▼</button></div>` : ""}
            <div class="maps-saved-pin">${i + 1}</div>
            <div class="maps-saved-text"><div class="maps-saved-label">${escapeHtml(s.name)}</div></div>
            ${editable ? `<button class="maps-saved-del" data-remove-stop="${s.id}">${icons.close}</button>` : ""}
          </div>`).join("")}
      </div>`;

    $("#tripBackBtn").addEventListener("click", () => { activeTrip = null; renderTripsList(); });
    $("#addStopHereBtn")?.addEventListener("click", () => {
      if (!currentPlace) { showError("Search or click the map to pick a spot first."); return; }
      addStopToTrip(id, currentPlace);
    });
    $("#shareTripBtn").addEventListener("click", () => {
      const url = `${location.origin}${location.pathname}?trip=${trip.share_code}`;
      navigator.clipboard?.writeText(url).then(() => { setStatus("🔗 Trip link copied"); setTimeout(() => setStatus(""), 1800); }).catch(() => {});
    });
    $("#routeTripBtn")?.addEventListener("click", () => routeTripStops(stops));
    $("#gpxTripBtn")?.addEventListener("click", () => exportTripGPX(trip, stops));
    $("#manageTripBtn")?.addEventListener("click", () => manageTrip(trip));
    list.querySelectorAll("[data-remove-stop]").forEach((btn) => btn.addEventListener("click", async () => { await supabaseClient.from("maps_trip_stops").delete().eq("id", btn.dataset.removeStop); openTrip(id); }));
    list.querySelectorAll("[data-up]").forEach((btn) => btn.addEventListener("click", () => reorderStop(stops, btn.dataset.up, -1, id)));
    list.querySelectorAll("[data-down]").forEach((btn) => btn.addEventListener("click", () => reorderStop(stops, btn.dataset.down, 1, id)));
  }

  async function reorderStop(stops, stopId, dir, tripId) {
    const idx = stops.findIndex((s) => s.id === stopId);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= stops.length) return;
    const a = stops[idx], b = stops[swapIdx];
    await Promise.all([
      supabaseClient.from("maps_trip_stops").update({ position: b.position }).eq("id", a.id),
      supabaseClient.from("maps_trip_stops").update({ position: a.position }).eq("id", b.id),
    ]);
    openTrip(tripId);
  }

  async function routeTripStops(stops) {
    if (!stops || stops.length < 2) return;
    const coords = stops.map((s) => `${s.lng},${s.lat}`).join(";");
    try {
      const res = await fetch(`${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`);
      const data = await res.json();
      if (!data.routes?.length) { showError("No route through these stops."); return; }
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.geoJSON(data.routes[0].geometry, { style: { color: "#06b6d4", weight: 5, opacity: 0.85 } }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    } catch (e) { showError("Routing failed."); }
  }

  function exportTripGPX(trip, stops) {
    const points = (stops || []).map((s) => `  <wpt lat="${s.lat}" lon="${s.lng}"><name>${escapeXml(s.name)}</name></wpt>`).join("\n");
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="360 Maps" xmlns="http://www.topografix.com/GPX/1/1">\n${points}\n</gpx>`;
    const blob = new Blob([gpx], { type: "application/gpx+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${trip.title.replace(/[^a-z0-9]+/gi, "-")}.gpx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function escapeXml(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  async function manageTrip(trip) {
    const makePublic = confirm(`"${trip.title}" is ${trip.is_public_editable ? "PUBLIC (anyone can add stops)" : "private"}.\n\nOK = make public-editable\nCancel = keep private (collaborator-only)`);
    await supabaseClient.from("maps_trips").update({ is_public_editable: makePublic }).eq("id", trip.id);
    if (!makePublic) {
      const { data: existing } = await supabaseClient.from("maps_trip_collaborators").select("user_id").eq("trip_id", trip.id);
      const { data: profs } = existing?.length ? await supabaseClient.from("profiles").select("id,username").in("id", existing.map((r) => r.user_id)) : { data: [] };
      const input = prompt("Collaborator usernames (comma separated):", (profs || []).map((p) => p.username).join(", "));
      if (input !== null) {
        await supabaseClient.from("maps_trip_collaborators").delete().eq("trip_id", trip.id);
        for (const un of input.split(",").map((s) => s.trim()).filter(Boolean)) {
          const { data: p } = await supabaseClient.from("profiles").select("id").ilike("username", un).maybeSingle();
          if (p) await supabaseClient.from("maps_trip_collaborators").insert({ trip_id: trip.id, user_id: p.id, added_by: currentUser.id });
        }
      }
    }
    openTrip(trip.id);
  }

  async function checkTripDeepLink() {
    const code = new URLSearchParams(location.search).get("trip");
    if (!code) return;
    const { data: trip } = await supabaseClient.from("maps_trips").select("*").eq("share_code", code).maybeSingle();
    if (!trip) return;
    allTrips = [trip];
    activeTab = "trips";
    tabsBar.querySelectorAll(".maps-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "trips"));
    cardBody.innerHTML = `<div id="mapsTripsList"></div>`;
    openTrip(trip.id);
  }

  /* ============================================================
     SAVE MODAL
     ============================================================ */
  let modalCatSelection = "other";
  function renderModalCatRow(active) {
    modalCatSelection = active;
    modalCatRow.innerHTML = CATS.map((c) => `<button type="button" class="maps-cat-chip${c.id === active ? " active" : ""}" data-cat="${c.id}">${c.icon} ${c.label}</button>`).join("");
    modalCatRow.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => renderModalCatRow(btn.dataset.cat));
    });
  }

  function openSaveModal() {
    if (!currentUser) { showError("Sign in to save locations"); return; }
    if (!currentPlace) return;
    modalLabel.value = currentPlace.label ? shortLabel(currentPlace.label) : "Saved place";
    modalNote.value = "";
    renderModalCatRow("other");
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
        category: modalCatSelection,
        icon: catMeta(modalCatSelection).icon,
      });
      if (error) throw error;
      modalOverlay.classList.remove("show");
      showTab(activeTab);
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

  locateBtn.addEventListener("click", useMyLocation);

  fullscreenBtn.addEventListener("click", () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  });
  document.addEventListener("fullscreenchange", () => {
    fullscreenBtn.classList.toggle("active", !!document.fullscreenElement);
    setTimeout(() => map.invalidateSize(), 200);
  });

  /* ============================================================
     MEASURE TOOL
     ============================================================ */
  function startMeasuring() {
    measuring = true;
    measurePoints = [];
    measureBtn.classList.add("active");
    measureReadout.style.display = "flex";
    measureText.textContent = "Click points on the map to measure. Double-click to finish.";
    if (measureLine) { map.removeLayer(measureLine); measureLine = null; }
    measureMarkers.forEach((m) => map.removeLayer(m));
    measureMarkers = [];
    map.doubleClickZoom.disable();
    map.once("dblclick", stopMeasuring);
  }
  function stopMeasuring() {
    measuring = false;
    measureBtn.classList.remove("active");
    measureReadout.style.display = "none";
    map.doubleClickZoom.enable();
  }
  function addMeasurePoint(latlng) {
    measurePoints.push(latlng);
    measureMarkers.push(L.circleMarker(latlng, { radius: 5, color: "#f59e0b", fillOpacity: 1 }).addTo(map));
    if (measureLine) map.removeLayer(measureLine);
    if (measurePoints.length > 1) {
      measureLine = L.polyline(measurePoints, { color: "#f59e0b", weight: 4, dashArray: "6 6" }).addTo(map);
      let totalKm = 0;
      for (let i = 1; i < measurePoints.length; i++) totalKm += haversineKm(measurePoints[i - 1].lat, measurePoints[i - 1].lng, measurePoints[i].lat, measurePoints[i].lng);
      measureText.textContent = `Total: ${totalKm.toFixed(2)} km (${(totalKm * 0.621371).toFixed(2)} mi) — ${measurePoints.length} points`;
    }
  }
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371, dLat = ((lat2 - lat1) * Math.PI) / 180, dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  measureBtn.addEventListener("click", () => (measuring ? stopMeasuring() : startMeasuring()));
  measureClearBtn.addEventListener("click", () => {
    measurePoints = [];
    if (measureLine) { map.removeLayer(measureLine); measureLine = null; }
    measureMarkers.forEach((m) => map.removeLayer(m));
    measureMarkers = [];
    measureText.textContent = "Click points on the map to measure. Double-click to finish.";
  });
  measureDoneBtn.addEventListener("click", stopMeasuring);

  window.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (e.key === "m" || e.key === "M") measureBtn.click();
    else if (e.key === "f" || e.key === "F") fullscreenBtn.click();
    else if (e.key === "Escape" && measuring) stopMeasuring();
  });

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
        btn.addEventListener("click", () => cleanup(btn.dataset.mode));
      });
      overlay.querySelector("#mapsModeCancel").addEventListener("click", () => cleanup(null));
      overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(null); });
    });
  }

  /* ============================================================
     NAVIGATION MODE (fullscreen directions + live tracking)
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

  async function requestRoute(origin, mode, silent) {
    try {
      const profile = (TRAVEL_MODES[mode] || TRAVEL_MODES.car).profile;
      const url = `${OSRM}/route/v1/${profile}/${origin.lon},${origin.lat};${currentPlace.lon},${currentPlace.lat}?overview=full&geometries=geojson&steps=true`;
      const data = await fetchJson(url);
      if (!data.routes || !data.routes.length) throw new Error("No route found");
      const route = data.routes[0];

      if (routeLine) map.removeLayer(routeLine);
      const coords = route.geometry.coordinates.map((c) => [c[1], c[0]]);
      routeLine = L.polyline(coords, { color: meColor(), weight: 6, opacity: 0.85 }).addTo(map);
      if (!silent) map.fitBounds(routeLine.getBounds(), { padding: [60, 60] });

      const km = (route.distance / 1000).toFixed(1);
      const mins = Math.round(route.duration / 60);
      navEta.textContent = `${mins} min`;
      const modeNote = mode === "transit" ? " (walking route shown - live transit routing isn't available on the free routing engine used here)" : "";
      navSub.textContent = `${km} km - ${shortLabel(currentPlace.label) || "Destination"}${modeNote}`;

      routeSteps = (route.legs || []).flatMap((leg) => leg.steps || []);
      currentStepIdx = 0;
      renderNavSteps();
      updateNavInstruction();
    } catch (err) {
      if (!silent) showError("Couldn't get directions to that location");
    }
  }

  function maneuverText(step) {
    const m = step.maneuver || {};
    const road = step.name ? ` onto ${step.name}` : "";
    const type = m.type, mod = m.modifier;
    if (type === "depart") return `Head ${mod || ""}${road}`.trim();
    if (type === "arrive") return "You have arrived at your destination";
    if (type === "roundabout" || type === "rotary") return `At the roundabout, take the exit${road}`;
    if (mod) {
      const label = { left: "Turn left", right: "Turn right", "slight left": "Bear left", "slight right": "Bear right",
        "sharp left": "Sharp left", "sharp right": "Sharp right", straight: "Continue straight", uturn: "Make a U-turn" }[mod] || "Continue";
      return `${label}${road}`;
    }
    return `Continue${road}`;
  }
  function maneuverIcon(step) {
    const mod = (step.maneuver || {}).modifier;
    if (!mod) return "⬆️";
    if (mod.includes("left")) return "⬅️";
    if (mod.includes("right")) return "➡️";
    if (mod === "uturn") return "↩️";
    return "⬆️";
  }

  function renderNavSteps() {
    navStepsPanel.innerHTML = routeSteps.map((s, i) => `
      <div class="maps-nav-step${i === currentStepIdx ? " active" : ""}" data-step="${i}">
        <span class="maps-nav-step-icon">${maneuverIcon(s)}</span>
        <span class="maps-nav-step-text">${escapeHtml(maneuverText(s))}</span>
        <span class="maps-nav-step-dist">${s.distance > 0 ? Math.round(s.distance) + " m" : ""}</span>
      </div>`).join("");
  }
  navStepsToggle.addEventListener("click", () => navStepsPanel.classList.toggle("show"));

  function updateNavInstruction() {
    const step = routeSteps[currentStepIdx];
    navInstruction.textContent = step ? `${maneuverIcon(step)} ${maneuverText(step)}` : "";
    navStepsPanel.querySelectorAll(".maps-nav-step").forEach((el, i) => el.classList.toggle("active", i === currentStepIdx));
  }

  // Advance to the next turn once the live position passes near the step's
  // maneuver point, and reroute from scratch if the user strays far off the
  // drawn path (a real nav app has to handle wrong turns, not just assume
  // the driver follows the original route perfectly).
  function updateNavProgress(pos, origin, mode) {
    if (!routeSteps.length) return;
    const next = routeSteps[currentStepIdx + 1];
    if (next && next.maneuver) {
      const [lon, lat] = next.maneuver.location;
      if (haversineKm(pos.lat, pos.lon, lat, lon) < 0.03) {
        currentStepIdx++;
        updateNavInstruction();
      }
    }
    if (routeLine) {
      const latlngs = routeLine.getLatLngs();
      let minDist = Infinity;
      for (const p of latlngs) minDist = Math.min(minDist, haversineKm(pos.lat, pos.lon, p.lat, p.lng));
      if (minDist > 0.08) {
        const now = Date.now();
        if (!lastRouteFetchPos || now - lastRouteFetchPos > 8000) {
          lastRouteFetchPos = now;
          navSub.textContent = "Rerouting…";
          requestRoute({ lat: pos.lat, lon: pos.lon }, mode, true);
        }
      }
    }
  }

  function enterNavMode(origin, mode) {
    navActive = true;
    navMode = mode;
    document.body.classList.add("maps-nav-fullscreen");
    mapsCard.classList.add("hidden");
    navBar.classList.add("show");
    navStepsPanel.classList.remove("show");
    updateMeMarker(origin.lat, origin.lon);
    requestRoute(origin, mode);
    startWatching((pos) => {
      map.panTo([pos.lat, pos.lon]);
      updateNavProgress(pos, origin, mode);
    });
    map.setView([origin.lat, origin.lon], 17);
  }

  function exitNavMode() {
    navActive = false;
    document.body.classList.remove("maps-nav-fullscreen");
    mapsCard.classList.remove("hidden");
    navBar.classList.remove("show");
    navStepsPanel.classList.remove("show");
    routeSteps = []; currentStepIdx = 0;
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  }
  navExitBtn.addEventListener("click", exitNavMode);

  /* ============================================================
     AUTH
     ============================================================ */
  async function initAuth() {
    showListView();
    if (typeof supabaseClient === "undefined" || !supabaseClient) return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user ?? null;
    await loadSavedLocations();
    checkTripDeepLink();
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
  renderAiToggle();
  initAuth();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
