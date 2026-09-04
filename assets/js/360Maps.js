/* ============================================================
   360 MAPS v4 — assets/js/360Maps.js
   Free stack + Anthropic AI summaries:
     - Map tiles:   OpenStreetMap / CartoDB / ArcGIS Satellite
     - Geocoding:   Nominatim
     - Routing:     OSRM
     - Weather:     Open-Meteo (no key) YOU DIDN'T HAVE TO CUT ME U-
     - Elevation:   Open-Elevation (no key)
     - POIs:        Overpass API
     - Wikimedia:   photos via Commons API
     - AI summaries: Anthropic claude-sonnet-4-6 <-- this is wrong, who wrote that
   ============================================================ */
(function () {
  "use strict";
  function run() {

  const RECENT_KEY  = "360_maps_recent_v4";
  const THEME_KEY   = "360maps_tile_style";
  const MAX_RECENT  = 8;
  const NOMINATIM   = "https://nominatim.openstreetmap.org";
  const OSRM        = "https://router.project-osrm.org";
  const OVERPASS    = "https://overpass-api.de/api/interpreter";

  /* ── POI categories ── */
  const POI_TAGS = {
    restaurant:'amenity=restaurant', cafe:'amenity=cafe', fuel:'amenity=fuel',
    atm:'amenity=atm', hospital:'amenity=hospital', park:'leisure=park',
    supermarket:'shop=supermarket', pharmacy:'amenity=pharmacy',
    bar:'amenity=bar', hotel:'tourism=hotel', museum:'tourism=museum',
    gym:'leisure=fitness_centre', library:'amenity=library',
  };
  const POI_ICON = {
    restaurant:'🍽️', cafe:'☕', fuel:'⛽', atm:'🏧', hospital:'🏥',
    park:'🌳', supermarket:'🛒', pharmacy:'💊', bar:'🍺', hotel:'🏨',
    museum:'🏛️', gym:'💪', library:'📚',
  };
  const POI_COLOR = {
    restaurant:'#ef4444', cafe:'#f59e0b', fuel:'#6366f1', atm:'#10b981',
    hospital:'#ef4444', park:'#22c55e', supermarket:'#3b82f6', pharmacy:'#a855f7',
    bar:'#f97316', hotel:'#0ea5e9', museum:'#8b5cf6', gym:'#f43f5e', library:'#14b8a6',
  };

  const CATS = [
    { id:'home',     icon:'🏠', label:'Home',     color:'#3b82f6' },
    { id:'work',     icon:'💼', label:'Work',     color:'#6366f1' },
    { id:'food',     icon:'🍽️', label:'Food',     color:'#ef4444' },
    { id:'shopping', icon:'🛍️', label:'Shopping', color:'#f59e0b' },
    { id:'nature',   icon:'🌳', label:'Nature',   color:'#22c55e' },
    { id:'favorite', icon:'⭐', label:'Saved',    color:'#eab308' },
    { id:'other',    icon:'📍', label:'Other',    color:'#94a3b8' },
  ];
  function catMeta(id) { return CATS.find(c => c.id === id) || CATS[CATS.length-1]; }

  /* ── State ── */
  let map=null, marker=null, meMarker=null, routeLine=null;
  let watchId=null, navActive=false, currentUser=null, currentPlace=null;
  let suggestList=[], suggestIdx=-1, suggestTimer=null, lastQuery='';
  let tileLayer=null, activeTab='saved', activeCatFilter='all', savedCache=[];
  let measuring=false, measurePoints=[], measureLine=null, measureMarkers=[];
  let nearbyMarkers=[], routeSteps=[], currentStepIdx=0;
  let lastRouteFetchPos=null, activeTrip=null, tripStopMarkers=[];
  let navMode=null, tempUnit='C';

  const $ = s => document.querySelector(s);

  /* ── DOM refs (all must exist in HTML) ── */
  const searchForm     = $('#mapsSearchForm');
  const searchInput    = $('#mapsSearchInput');
  const dropdown       = $('#mapsSuggestDropdown');
  const errorBox       = $('#mapsError');
  const statusBox      = $('#mapsStatus');
  const mapsCard       = $('#mapsCard');
  const cardBody       = $('#mapsCardBody');
  const modalOverlay   = $('#mapsModalOverlay');
  const modalLabel     = $('#mapsModalLabel');
  const modalNote      = $('#mapsModalNote');
  const modalSave      = $('#mapsModalSave');
  const modalCancel    = $('#mapsModalCancel');
  const navBar         = $('#mapsNavBar');
  const navExitBtn     = $('#mapsNavExit');
  const navEta         = $('#mapsNavEta');
  const navSub         = $('#mapsNavSub');
  const navInstruction = $('#mapsNavInstruction');
  const navStepsToggle = $('#mapsNavStepsToggle');
  const navStepsPanel  = $('#mapsNavStepsPanel');
  const quickCats      = $('#mapsQuickCats');
  const tabsBar        = $('#mapsTabs');
  const layerSwitcher  = $('#mapsLayerSwitcher');
  const fabStack       = $('#mapsFabStack');
  const zoomInBtn      = $('#mapsZoomInBtn');
  const zoomOutBtn     = $('#mapsZoomOutBtn');
  const measureBtn     = $('#mapsMeasureBtn');
  const fullscreenBtn  = $('#mapsFullscreenBtn');
  const locateBtn      = $('#mapsLocateBtn');
  const measureReadout = $('#mapsMeasureReadout');
  const measureText    = $('#mapsMeasureText');
  const measureClearBtn= $('#mapsMeasureClear');
  const measureDoneBtn = $('#mapsMeasureDone');
  const modalCatRow    = $('#mapsModalCatRow');
  const compareOverlay = $('#mapsCompareOverlay');
  const compareSelect  = $('#mapsCompareSelect');
  const compareResult  = $('#mapsCompareResult');
  const compareCancelBtn = $('#mapsCompareCancel');

  /* ══════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════ */
  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
    setTimeout(() => { errorBox.style.display='none'; }, 4500);
  }
  function setStatus(msg) { statusBox.textContent = msg||''; }
  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str||''; return d.innerHTML;
  }
  function shortLabel(l) { return l ? l.split(',')[0] : 'Dropped pin'; }
  function meColor() {
    return getComputedStyle(document.body).getPropertyValue('--cursor-color').trim() || '#3b82f6';
  }
  async function fetchJson(url) {
    const r = await fetch(url, { headers:{ Accept:'application/json' } });
    if (!r.ok) throw new Error('Request failed');
    return r.json();
  }
  function haversineKm(lat1,lon1,lat2,lon2) {
    const R=6371, dLat=((lat2-lat1)*Math.PI)/180, dLon=((lon2-lon1)*Math.PI)/180;
    const a=Math.sin(dLat/2)**2+Math.cos((lat1*Math.PI)/180)*Math.cos((lat2*Math.PI)/180)*Math.sin(dLon/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  }
  function fmtDist(km) {
    if (km < 1) return `${Math.round(km*1000)} m`;
    return `${km.toFixed(1)} km`;
  }
  function fmtTemp(c) {
    if (tempUnit === 'F') return `${Math.round(c*9/5+32)}°F`;
    return `${Math.round(c)}°C`;
  }
  function weatherLabel(code) {
    const t = {0:'Clear sky',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',
      45:'Fog',48:'Icy fog',51:'Light drizzle',61:'Light rain',63:'Rain',
      65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',
      80:'Rain showers',81:'Moderate showers',82:'Violent showers',95:'Thunderstorm'};
    return t[code]||'—';
  }
  function weatherEmoji(code) {
    if (code===0) return '☀️';
    if (code<=2) return '🌤️';
    if (code<=3) return '☁️';
    if (code<=48) return '🌫️';
    if (code<=65) return '🌧️';
    if (code<=75) return '❄️';
    if (code<=82) return '🌦️';
    return '⛈️';
  }
  function formatTime(mins) {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins/60), m = mins%60;
    return m ? `${h} hr ${m} min` : `${h} hr`;
  }
  function escapeXml(s) {
    return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ══════════════════════════════════════════
     ICONS
  ══════════════════════════════════════════ */
  const icons = {
    pin:   `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s7-7.58 7-12A7 7 0 0 0 5 10c0 4.42 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>`,
    clock: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
    search:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
    x:     `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
    back:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`,
    globe: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/></svg>`,
    close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`,
    dir:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`,
    share: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98"/></svg>`,
    ai:    `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a5 5 0 0 1 5 5v3a5 5 0 0 1-10 0V7a5 5 0 0 1 5-5z"/><path d="M15 17a5 5 0 0 1-6 0"/><path d="M12 17v5"/></svg>`,
    export:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  };

  /* ══════════════════════════════════════════
     RECENT SEARCHES
  ══════════════════════════════════════════ */
  function getRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)||'[]'); } catch { return []; } }
  function addRecent(item) {
    let list = getRecent().filter(r => r.label.toLowerCase() !== item.label.toLowerCase());
    list.unshift(item);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0,MAX_RECENT)));
  }
  function removeRecent(label) {
    localStorage.setItem(RECENT_KEY, JSON.stringify(getRecent().filter(r => r.label !== label)));
  }

  /* ══════════════════════════════════════════
     MAP SETUP
  ══════════════════════════════════════════ */
  const TILE_LAYERS = {
    standard: { url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',             attr:'© OpenStreetMap',        maxZoom:19, label:'Map' },
    dark:     { url:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',  attr:'© CARTO',               maxZoom:19, label:'Dark' },
    satellite:{ url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr:'© Esri', maxZoom:19, label:'Satellite' },
    terrain:  { url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',               attr:'© OpenTopoMap',         maxZoom:17, label:'Terrain' },
    voyager:  { url:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attr:'© CARTO', maxZoom:19, label:'Voyager' },
  };

  function setTileLayer(style) {
    const cfg = TILE_LAYERS[style]||TILE_LAYERS.standard;
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(cfg.url, { maxZoom:cfg.maxZoom, attribution:cfg.attr }).addTo(map);
    try { localStorage.setItem(THEME_KEY, style); } catch {}
    layerSwitcher.querySelectorAll('.maps-layer-btn').forEach(b => b.classList.toggle('active', b.dataset.style===style));
  }
  layerSwitcher.querySelectorAll('.maps-layer-btn').forEach(btn => {
    btn.addEventListener('click', () => setTileLayer(btn.dataset.style));
  });

  function initMap() {
    map = L.map('mapsCanvas', { zoomControl:false, attributionControl:true }).setView([20,0], 3);
    window._leafletMap = map;
    // Auto pick dark tile if system is in dark mode
    let savedStyle = 'standard';
    try { savedStyle = localStorage.getItem(THEME_KEY)||'standard'; } catch {}
    if (savedStyle==='standard' && window.matchMedia('(prefers-color-scheme: dark)').matches) savedStyle='dark';
    setTileLayer(savedStyle);

    map.on('click', e => {
      if (measuring) { addMeasurePoint(e.latlng); return; }
      selectRawLatLng(e.latlng.lat, e.latlng.lng);
    });

    // Auto-dismiss dropdown on map move
    map.on('movestart', () => { if (dropdown.classList.contains('visible')) hideDropdown(); });
  }

  zoomInBtn.addEventListener('click', () => map.zoomIn());
  zoomOutBtn.addEventListener('click', () => map.zoomOut());

  function placeMarker(lat, lon) {
    if (marker) { map.removeLayer(marker); marker=null; }
    const icon = L.divIcon({
      className:'',
      html:`<div class="maps-pin-marker" style="--pin-color:${meColor()}"></div>`,
      iconSize:[32,40], iconAnchor:[16,40],
    });
    marker = L.marker([lat,lon], { icon }).addTo(map);
  }
  function focusMap(lat, lon, zoom) {
    map.setView([lat,lon], Math.max(map.getZoom(), zoom||15));
  }

  /* ══════════════════════════════════════════
     GEOCODING (Nominatim)
  ══════════════════════════════════════════ */
  async function nominatimSearch(q, limit) {
    const url = `${NOMINATIM}/search?format=jsonv2&addressdetails=1&extratags=1&namedetails=1&limit=${limit||5}&q=${encodeURIComponent(q)}`;
    return fetchJson(url);
  }
  async function nominatimReverse(lat, lon) {
    const url = `${NOMINATIM}/reverse?format=jsonv2&addressdetails=1&extratags=1&lat=${lat}&lon=${lon}`;
    return fetchJson(url);
  }
  async function robustSearch(q) {
    let results = await nominatimSearch(q,5);
    if (results?.length) return results;
    const cleaned = q.replace(/[,]{2,}/g,',').trim();
    if (cleaned!==q) {
      results = await nominatimSearch(cleaned,5);
      if (results?.length) return results;
    }
    throw new Error("Couldn't find that place");
  }

  /* ══════════════════════════════════════════
     WIKIPEDIA / WIKIMEDIA
  ══════════════════════════════════════════ */
  async function fetchWikiSummary(title, lang) {
    try {
      const url = `https://${lang||'en'}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
      const r = await fetch(url, { headers:{ Accept:'application/json' } });
      if (!r.ok) return null;
      const d = await r.json();
      return {
        title: d.title||title,
        description: d.extract||null,
        photo: d.thumbnail?.source || d.originalimage?.source || null,
        url: d.content_urls?.desktop?.page||null,
      };
    } catch { return null; }
  }
  async function fetchWikiNearby(lat, lon) {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${lat}|${lon}&gsradius=300&gslimit=1&format=json&origin=*`;
      const d = await fetchJson(url);
      const hit = d.query?.geosearch?.[0];
      return hit ? fetchWikiSummary(hit.title, 'en') : null;
    } catch { return null; }
  }

  /* Wikimedia Commons: fetch 3 photos for a location */
  async function fetchWikimediaPhotos(lat, lon) {
    try {
      const url = `https://commons.wikimedia.org/w/api.php?action=query&list=geosearch&gsnamespace=6&gscoord=${lat}|${lon}&gsradius=500&gslimit=5&format=json&origin=*`;
      const d = await fetchJson(url);
      const hits = d.query?.geosearch||[];
      const photos = [];
      for (const h of hits.slice(0,3)) {
        try {
          const iu = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(h.title)}&prop=imageinfo&iiprop=url&iiurlwidth=600&format=json&origin=*`;
          const id = await fetchJson(iu);
          const pages = Object.values(id.query?.pages||{});
          const imgUrl = pages[0]?.imageinfo?.[0]?.thumburl;
          if (imgUrl) photos.push(imgUrl);
        } catch {}
      }
      return photos;
    } catch { return []; }
  }

  async function enrichWithMedia(result, lat, lon) {
    const extratags = result.extratags||{};
    let summary = null;
    if (extratags.wikipedia) {
      const [lang,...rest] = extratags.wikipedia.split(':');
      const title = rest.join(':');
      if (title) summary = await fetchWikiSummary(title, lang);
    }
    if (!summary) summary = await fetchWikiNearby(lat, lon);

    const photos = [];
    if (summary?.photo) photos.push(summary.photo);
    const wikiPhotos = await fetchWikimediaPhotos(lat, lon);
    for (const p of wikiPhotos) { if (!photos.includes(p)) photos.push(p); }

    return { summary, photos: photos.slice(0,4) };
  }

  /* ══════════════════════════════════════════
     AI PLACE SUMMARY (Anthropic)
  ══════════════════════════════════════════ */
  async function fetchAISummary(name, typeLabel, address, wikiDesc) {
    try {
      const prompt = wikiDesc
        ? `In 2-3 sentences, write a vivid, useful summary of "${name}" (${typeLabel||'place'}) at ${address}. Base it on this description: "${wikiDesc.slice(0,400)}". Be specific and helpful, not generic.`
        : `In 2-3 sentences, write a vivid, useful summary of "${name}" (${typeLabel||'place'}) at ${address}. Include what makes it distinctive, who it's for, and any notable features. Be specific, not generic.`;

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          model:'claude-sonnet-4-6',
          max_tokens:200,
          messages:[{ role:'user', content:prompt }],
        }),
      });
      const data = await res.json();
      return data.content?.[0]?.text?.trim()||null;
    } catch { return null; }
  }

  /* ══════════════════════════════════════════
     PLACE SELECTION
  ══════════════════════════════════════════ */
  async function selectRawLatLng(lat, lon) {
    hideDropdown();
    placeMarker(lat, lon);
    focusMap(lat, lon, 16);
    currentPlace = { lat, lon, label:null };
    renderDetailLoading();
    try {
      const r = await nominatimReverse(lat, lon);
      await renderFromNominatim(r, lat, lon);
    } catch { renderBareDetail(null, lat, lon); }
  }

  async function selectFromResult(result) {
    const lat = parseFloat(result.lat), lon = parseFloat(result.lon);
    hideDropdown();
    placeMarker(lat, lon);
    focusMap(lat, lon, 16);
    currentPlace = { lat, lon, label:result.display_name };
    renderDetailLoading();
    await renderFromNominatim(result, lat, lon);
    addRecent({ label:result.display_name, lat, lon });
  }

  function renderDetailLoading() {
    cardBody.innerHTML = `
      <div class="maps-back-row">
        <button class="maps-btn-text" id="mapsBackBtn">${icons.back} Back</button>
      </div>
      <div class="maps-detail-body">
        <div class="maps-skeleton"></div>
        <div class="maps-skeleton" style="width:70%;margin-top:8px;"></div>
        <div class="maps-skeleton" style="width:50%;margin-top:8px;"></div>
      </div>`;
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
        <div class="maps-detail-type">Dropped pin</div>
        <div class="maps-detail-row">${icons.pin}<span>${lat.toFixed(5)}, ${lon.toFixed(5)}</span>
          <button class="maps-copy-coords" id="mapsCopyCoords" title="Copy coordinates">📋</button></div>
        <div class="maps-info-strip" id="mapsInfoStrip">
          <span class="maps-info-chip" id="mapsElevationChip">⛰️ <b id="mapsElevation">…</b></span>
          <span class="maps-info-chip" id="mapsWeatherChip">… <b id="mapsWeather">…</b></span>
        </div>
        <div class="maps-detail-actions">
          <button class="maps-btn" id="mapsDirectionsBtn">${icons.dir} Directions</button>
          <button class="maps-btn-outline" id="mapsSaveBtn">💾 Save</button>
          <button class="maps-btn-outline" id="mapsShareBtn">${icons.share} Share</button>
          <button class="maps-btn-outline" id="mapsCompareBtn">📏 Compare</button>
          ${activeTrip ? `<button class="maps-btn-outline" id="mapsAddStopBtn">＋ Add to trip</button>` : ''}
        </div>
      </div>`;
    wireDetailActions();
    fetchElevationAndWeather(lat, lon);
  }

  async function renderFromNominatim(result, lat, lon) {
    currentPlace = { lat, lon, label:result.display_name };
    if (marker) marker.bindPopup(result.display_name);

    const nameDetails = result.namedetails||{};
    const address = result.address||{};
    const extratags = result.extratags||{};
    const name = nameDetails.name||address.amenity||address.building||address.shop||result.display_name.split(',')[0];
    const typeLabel = (result.type||result.class||'').replace(/_/g,' ');

    // Fire enrichment and AI in parallel
    const [enrichment, aiSummary] = await Promise.allSettled([
      enrichWithMedia(result, lat, lon),
      fetchAISummary(name, typeLabel, address.country||result.display_name, null),
    ]);

    const wiki = enrichment.value?.summary;
    const photos = enrichment.value?.photos||[];
    const aiText = aiSummary.value;

    const photosHtml = photos.length
      ? `<div class="maps-detail-photos">${photos.map(u=>`<img src="${u}" alt="${escapeHtml(name)}" loading="lazy" onerror="this.style.display='none'">`).join('')}</div>`
      : '';

    // AI summary wins; fall back to wiki
    const descText = aiText || (wiki?.description ? wiki.description.slice(0,300)+(wiki.description.length>300?'…':'') : null);
    const descHtml = descText ? `<div class="maps-detail-desc">${escapeHtml(descText)}${aiText?'<span class="maps-ai-badge">✦ AI</span>':''}</div>` : '';

    const websiteRaw = extratags.website||extratags['contact:website'];
    const siteHtml = websiteRaw
      ? `<div class="maps-detail-row">${icons.globe}<a href="${websiteRaw}" target="_blank" rel="noopener">${escapeHtml(websiteRaw.replace(/^https?:\/\//,''))}</a></div>`
      : (wiki?.url ? `<div class="maps-detail-row">${icons.globe}<a href="${wiki.url}" target="_blank" rel="noopener">Wikipedia — ${escapeHtml(wiki.title||'')}</a></div>` : '');

    const openingRaw = extratags.opening_hours;
    const hoursHtml = openingRaw
      ? `<div class="maps-detail-row">${icons.clock}<span>${escapeHtml(openingRaw)}</span></div>`
      : '';

    const phoneRaw = extratags.phone||extratags['contact:phone'];
    const phoneHtml = phoneRaw
      ? `<div class="maps-detail-row">📞<a href="tel:${phoneRaw}">${escapeHtml(phoneRaw)}</a></div>`
      : '';

    const factRows = [
      ['Street',       [address.house_number,address.road].filter(Boolean).join(' ')],
      ['Neighbourhood',address.neighbourhood||address.suburb],
      ['City',         address.city||address.town||address.village],
      ['State',        address.state],
      ['Post code',    address.postcode],
      ['Country',      address.country],
    ].filter(([,v])=>!!v);

    const extraFacts = [
      ['Cuisine',  extratags.cuisine],
      ['Brand',    extratags.brand||extratags.operator],
      ['Wheelchair',extratags.wheelchair],
      ['Wi-Fi',    extratags.internet_access],
    ].filter(([,v])=>!!v);

    const allFacts = [...factRows,...extraFacts];
    const factsHtml = allFacts.length
      ? `<div class="maps-detail-facts">${allFacts.map(([k,v])=>`
          <div class="maps-fact"><span class="maps-fact-k">${escapeHtml(k)}</span><span class="maps-fact-v">${escapeHtml(String(v).replace(/_/g,' '))}</span></div>
        `).join('')}</div>`
      : '';

    cardBody.innerHTML = `
      <div class="maps-back-row">
        <button class="maps-btn-text" id="mapsBackBtn">${icons.back} Back</button>
      </div>
      ${photosHtml}
      <div class="maps-detail-body">
        <div class="maps-detail-title">${escapeHtml(name)}</div>
        ${typeLabel ? `<div class="maps-detail-type">${escapeHtml(typeLabel.replace(/\b\w/g,c=>c.toUpperCase()))}</div>` : ''}
        ${descHtml}
        <div class="maps-detail-row">${icons.pin}<span>${escapeHtml(result.display_name)}</span></div>
        <div class="maps-detail-row"><span style="width:16px;display:inline-block;"></span>
          <span>${lat.toFixed(5)}, ${lon.toFixed(5)}</span>
          <button class="maps-copy-coords" id="mapsCopyCoords" title="Copy">📋</button>
        </div>
        <div class="maps-info-strip" id="mapsInfoStrip">
          <span class="maps-info-chip" id="mapsElevationChip">⛰️ <b id="mapsElevation">…</b></span>
          <span class="maps-info-chip" id="mapsWeatherChip">… <b id="mapsWeather">…</b></span>
        </div>
        ${hoursHtml}${phoneHtml}${siteHtml}${factsHtml}
        <div class="maps-detail-actions">
          <button class="maps-btn" id="mapsDirectionsBtn">${icons.dir} Directions</button>
          <button class="maps-btn-outline" id="mapsSaveBtn">💾 Save</button>
          <button class="maps-btn-outline" id="mapsShareBtn">${icons.share} Share</button>
          <button class="maps-btn-outline" id="mapsCompareBtn">📏 Compare</button>
          ${activeTrip ? `<button class="maps-btn-outline" id="mapsAddStopBtn">＋ Add to trip</button>` : ''}
        </div>
        <div class="maps-export-row">
          <button class="maps-export-btn" id="mapsExportGpx">${icons.export} GPX</button>
          <button class="maps-export-btn" id="mapsExportGeoJson">${icons.export} GeoJSON</button>
          <button class="maps-export-btn" id="mapsExportKml">${icons.export} KML</button>
        </div>
      </div>`;

    wireDetailActions();
    fetchElevationAndWeather(lat, lon);

    // Wire export buttons
    $('#mapsExportGpx')?.addEventListener('click', () => exportPoint('gpx', name, lat, lon));
    $('#mapsExportGeoJson')?.addEventListener('click', () => exportPoint('geojson', name, lat, lon));
    $('#mapsExportKml')?.addEventListener('click', () => exportPoint('kml', name, lat, lon));
  }

  /* ── Point export formats ── */
  function exportPoint(fmt, name, lat, lon) {
    let content, mime, ext;
    if (fmt==='gpx') {
      content = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="360 Maps" xmlns="http://www.topografix.com/GPX/1/1">\n  <wpt lat="${lat}" lon="${lon}"><name>${escapeXml(name)}</name></wpt>\n</gpx>`;
      mime='application/gpx+xml'; ext='gpx';
    } else if (fmt==='geojson') {
      content = JSON.stringify({ type:'FeatureCollection', features:[{ type:'Feature', geometry:{ type:'Point', coordinates:[lon,lat] }, properties:{ name } }] },null,2);
      mime='application/geo+json'; ext='geojson';
    } else {
      content = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>${escapeXml(name)}</name><Point><coordinates>${lon},${lat},0</coordinates></Point></Placemark></Document></kml>`;
      mime='application/vnd.google-earth.kml+xml'; ext='kml';
    }
    const blob = new Blob([content],{ type:mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name.replace(/[^a-z0-9]+/gi,'-')}.${ext}`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  /* ── Wire back / detail actions ── */
  function wireBack() {
    const btn = $('#mapsBackBtn');
    if (btn) btn.addEventListener('click', showListView);
  }
  function wireDetailActions() {
    wireBack();
    $('#mapsSaveBtn')?.addEventListener('click', openSaveModal);
    $('#mapsDirectionsBtn')?.addEventListener('click', startNavigation);
    $('#mapsCompareBtn')?.addEventListener('click', openCompareModal);
    $('#mapsCopyCoords')?.addEventListener('click', () => {
      if (!currentPlace) return;
      navigator.clipboard?.writeText(`${currentPlace.lat.toFixed(5)}, ${currentPlace.lon.toFixed(5)}`)
        .then(()=>setStatus('📋 Coordinates copied!'))
        .catch(()=>{});
      setTimeout(()=>setStatus(''),2000);
    });
    $('#mapsShareBtn')?.addEventListener('click', shareCurrentPlace);
    $('#mapsAddStopBtn')?.addEventListener('click', async () => {
      if (!activeTrip||!currentPlace) return;
      await addStopToTrip(activeTrip.id, currentPlace);
    });
  }

  /* ── Share current place ── */
  function shareCurrentPlace() {
    if (!currentPlace) return;
    const url = `${location.origin}${location.pathname}?lat=${currentPlace.lat.toFixed(5)}&lon=${currentPlace.lon.toFixed(5)}`;
    navigator.clipboard?.writeText(url).then(() => {
      setStatus('🔗 Link copied to clipboard!');
      setTimeout(()=>setStatus(''),2000);
    }).catch(()=>{ window.prompt('Copy this link:', url); });
  }

  /* ── Deep-link handler ── */
  function checkDeepLink() {
    const p = new URLSearchParams(location.search);
    const lat = parseFloat(p.get('lat')), lon = parseFloat(p.get('lon'));
    if (!isNaN(lat) && !isNaN(lon)) {
      setTimeout(() => selectRawLatLng(lat, lon), 600);
    }
  }

  /* ══════════════════════════════════════════
     ELEVATION + WEATHER
  ══════════════════════════════════════════ */
  function fetchElevationAndWeather(lat, lon) {
    const elEl = $('#mapsElevation'), wEl = $('#mapsWeather'), wChip = $('#mapsWeatherChip');
    if (!elEl||!wEl) return;

    fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`)
      .then(r=>r.json())
      .then(d => {
        const m = d?.results?.[0]?.elevation;
        if (elEl.isConnected) elEl.textContent = m!=null ? `${Math.round(m)} m` : '—';
      }).catch(()=>{ if(elEl.isConnected) elEl.textContent='—'; });

    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=precipitation_probability&forecast_days=1`)
      .then(r=>r.json())
      .then(d => {
        const w = d?.current_weather;
        if (!wEl.isConnected) return;
        if (w) {
          const emoji = weatherEmoji(w.weathercode);
          if (wChip) wChip.querySelector('b').textContent = '';
          const precip = d?.hourly?.precipitation_probability?.[new Date().getHours()]??null;
          wEl.textContent = `${fmtTemp(w.temperature)} ${weatherLabel(w.weathercode)}${precip!=null?' · '+precip+'% rain':''}`;
          if (wChip) wChip.childNodes[0].textContent = emoji+' ';
        } else { wEl.textContent='—'; }
      }).catch(()=>{ if(wEl.isConnected) wEl.textContent='—'; });
  }

  /* ══════════════════════════════════════════
     COMPARE
  ══════════════════════════════════════════ */
  function openCompareModal() {
    if (!currentPlace) return;
    if (!savedCache.length) { showError('Save a few places first to compare distances.'); return; }
    compareSelect.innerHTML = savedCache.map(p=>`<option value="${p.id}">${escapeHtml(p.label)}</option>`).join('');
    compareOverlay.classList.add('show');
    updateCompareResult();
  }
  compareSelect.addEventListener('change', updateCompareResult);
  function updateCompareResult() {
    const p = savedCache.find(x=>x.id===compareSelect.value);
    if (!p||!currentPlace) return;
    const km = haversineKm(currentPlace.lat,currentPlace.lon,p.lat,p.lon);
    compareResult.innerHTML = `<b>${km.toFixed(2)} km</b> straight-line<br><span style="opacity:.7">${(km*0.621371).toFixed(2)} mi · ~${Math.round(km/5*60)} min walking</span>`;
  }
  compareCancelBtn.addEventListener('click', ()=>compareOverlay.classList.remove('show'));
  compareOverlay.addEventListener('click', e=>{ if(e.target===compareOverlay) compareOverlay.classList.remove('show'); });

  /* ══════════════════════════════════════════
     LIST VIEW (TABS)
  ══════════════════════════════════════════ */
  function showListView() {
    if (marker) { map.removeLayer(marker); marker=null; }
    if (routeLine) { map.removeLayer(routeLine); routeLine=null; }
    currentPlace=null;
    showTab(activeTab);
  }

  tabsBar.querySelectorAll('.maps-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      tabsBar.querySelectorAll('.maps-tab').forEach(b=>b.classList.toggle('active', b===btn));
      showTab(activeTab);
    });
  });

  function showTab(tab) {
    tabsBar.querySelectorAll('.maps-tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
    if (tab==='trips') renderTripsView();
    else if (tab==='nearby') renderNearbyView();
    else renderSavedList();
  }

  /* ── Saved list ── */
  async function renderSavedList() {
    cardBody.innerHTML = `
      <div class="maps-panel-title-row">
        <div class="maps-panel-title">Saved</div>
        <span class="maps-count-badge" id="mapsSavedCount"></span>
      </div>
      <div class="maps-signin-notice" id="mapsSigninNotice" style="display:none;">
        <span>Sign in to sync pins across devices.</span>
      </div>
      <div class="maps-cat-filter-row" id="mapsCatFilterRow"></div>
      <div class="maps-saved-list" id="mapsSavedList"></div>`;
    await loadSavedLocations();
  }

  async function loadSavedLocations() {
    const notice = $('#mapsSigninNotice'), list = $('#mapsSavedList');
    if (!list) return;
    if (!currentUser) {
      list.innerHTML=''; if(notice) notice.style.display='flex'; return;
    }
    if (notice) notice.style.display='none';
    try {
      const { data, error } = await supabaseClient.from('saved_locations').select('*').order('created_at',{ascending:false});
      if (error) throw error;
      savedCache = data||[];
      renderCatFilterRow();
      renderSavedItems(filterSaved(savedCache));
    } catch(err) { showError(err.message||"Couldn't load saved locations"); }
  }

  function filterSaved(items) {
    return activeCatFilter==='all' ? items : items.filter(p=>(p.category||'other')===activeCatFilter);
  }

  function renderCatFilterRow() {
    const row=$('#mapsCatFilterRow'), badge=$('#mapsSavedCount');
    if (badge) badge.textContent = savedCache.length ? String(savedCache.length) : '';
    if (!row) return;
    const cats = ['all',...new Set(savedCache.map(p=>p.category||'other'))];
    row.innerHTML = cats.map(id => {
      const meta = id==='all' ? {icon:'🗂️',label:'All'} : catMeta(id);
      return `<button class="maps-cat-chip${activeCatFilter===id?' active':''}" data-filter="${id}">${meta.icon} ${meta.label}</button>`;
    }).join('');
    row.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => { activeCatFilter=btn.dataset.filter; renderCatFilterRow(); renderSavedItems(filterSaved(savedCache)); });
    });
  }

  function renderSavedItems(items) {
    const list = $('#mapsSavedList');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = `<div class="maps-empty-state"><div class="maps-empty-icon">📍</div><div class="maps-empty-msg">No saved locations${activeCatFilter!=='all'?' in this category':' yet'}.</div><div class="maps-empty-hint">Search a place or click the map, then save it.</div></div>`;
      return;
    }
    list.innerHTML = items.map(it => {
      const cat = catMeta(it.category);
      return `<div class="maps-saved-item" data-id="${it.id}" data-lat="${it.lat}" data-lon="${it.lon}" data-label="${encodeURIComponent(it.label)}">
        <div class="maps-saved-pin" style="background:${cat.color}22;color:${cat.color};">${escapeHtml(it.icon||cat.icon)}</div>
        <div class="maps-saved-text">
          <div class="maps-saved-label">${escapeHtml(it.label)}</div>
          <div class="maps-saved-coords">${it.lat.toFixed(4)}, ${it.lon.toFixed(4)}${it.note?' · '+escapeHtml(it.note):''}</div>
        </div>
        <button class="maps-saved-del" data-del="${it.id}" aria-label="Delete">${icons.close}</button>
      </div>`;
    }).join('');

    list.querySelectorAll('.maps-saved-item').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.closest('[data-del]')) return;
        const lat=parseFloat(el.dataset.lat), lon=parseFloat(el.dataset.lon);
        const label=decodeURIComponent(el.dataset.label);
        hideDropdown(); placeMarker(lat,lon); focusMap(lat,lon,16);
        renderDetailLoading();
        nominatimReverse(lat,lon).then(r=>renderFromNominatim(r,lat,lon)).catch(()=>renderBareDetail(label,lat,lon));
      });
    });
    list.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation(); btn.disabled=true;
        try {
          const { error } = await supabaseClient.from('saved_locations').delete().eq('id',btn.getAttribute('data-del'));
          if (error) throw error;
          await loadSavedLocations();
        } catch(err) { showError(err.message||"Couldn't delete"); }
      });
    });
  }

  /* ══════════════════════════════════════════
     NEARBY (Overpass POI)
  ══════════════════════════════════════════ */
  let lastPoiTag=null;
  function renderNearbyView() {
    cardBody.innerHTML = `
      <div class="maps-panel-title">Nearby</div>
      <div class="maps-nearby-hint" id="mapsNearbyHint">Pick a category to search around your view.</div>
      <div id="mapsNearbyList"></div>`;
    if (lastPoiTag) runNearbySearch(lastPoiTag);
  }

  quickCats.querySelectorAll('.maps-quickcat-btn').forEach(btn => {
    btn.addEventListener('click', () => runNearbySearch(btn.dataset.poi));
  });

  async function runNearbySearch(tag) {
    lastPoiTag=tag;
    activeTab='nearby';
    tabsBar.querySelectorAll('.maps-tab').forEach(b=>b.classList.toggle('active', b.dataset.tab==='nearby'));
    if (!$('#mapsNearbyList')) renderNearbyView();

    const center = currentPlace ? [currentPlace.lat,currentPlace.lon] : map.getCenter();
    const [lat,lon] = Array.isArray(center) ? center : [center.lat,center.lng];
    const hint=$('#mapsNearbyHint'), list=$('#mapsNearbyList');
    if (hint) hint.textContent=`Searching for ${tag}${currentPlace?' near '+shortLabel(currentPlace.label):' around your view'}…`;
    if (list) list.innerHTML='';
    nearbyMarkers.forEach(m=>map.removeLayer(m)); nearbyMarkers=[];

    const filter=POI_TAGS[tag];
    if (!filter) return;
    const [k,v]=filter.split('=');
    const query=`[out:json][timeout:25];(node["${k}"="${v}"](around:2500,${lat},${lon}););out body 30;`;

    try {
      const res=await fetch(OVERPASS,{ method:'POST', body:'data='+encodeURIComponent(query) });
      const data=await res.json();
      const results=(data.elements||[]).filter(el=>el.tags?.name);
      results.sort((a,b)=>haversineKm(lat,lon,a.lat,a.lon)-haversineKm(lat,lon,b.lat,b.lon));

      if (!results.length) { if(hint) hint.textContent='Nothing found nearby. Try a wider area or different category.'; return; }
      if (hint) hint.textContent=`${results.length} ${tag}${results.length===1?'':'s'} within 2.5 km`;

      if (list) {
        list.innerHTML = results.map((r,i)=>{
          const dist=haversineKm(lat,lon,r.lat,r.lon);
          const col=POI_COLOR[tag]||'#64748b';
          return `<div class="maps-saved-item maps-nearby-item" data-i="${i}">
            <div class="maps-saved-pin" style="background:${col}22;color:${col};">${POI_ICON[tag]||'📍'}</div>
            <div class="maps-saved-text">
              <div class="maps-saved-label">${escapeHtml(r.tags.name)}</div>
              <div class="maps-saved-coords">${fmtDist(dist)} away${r.tags.opening_hours?' · '+escapeHtml(r.tags.opening_hours.split(';')[0]):''}${r.tags.phone?' · 📞':''}</div>
            </div>
          </div>`;
        }).join('');
        list.querySelectorAll('[data-i]').forEach(el => {
          el.addEventListener('click', () => {
            const r=results[+el.dataset.i];
            placeMarker(r.lat,r.lon); focusMap(r.lat,r.lon,16);
            renderDetailLoading();
            nominatimReverse(r.lat,r.lon).then(res2=>renderFromNominatim(res2,r.lat,r.lon)).catch(()=>renderBareDetail(r.tags.name,r.lat,r.lon));
          });
        });
      }

      const color=POI_COLOR[tag]||'#64748b';
      results.forEach(r => {
        const icon=L.divIcon({ html:`<div class="maps-poi-dot" style="background:${color};">${POI_ICON[tag]||'📍'}</div>`, className:'', iconSize:[28,28], iconAnchor:[14,14] });
        nearbyMarkers.push(L.marker([r.lat,r.lon],{icon}).addTo(map).bindTooltip(r.tags.name));
      });
    } catch(e) {
      if (hint) hint.textContent='Nearby search failed — check your connection.';
    }
  }

  /* ══════════════════════════════════════════
     TRIPS
  ══════════════════════════════════════════ */
  let allTrips=[];

  async function renderTripsView() {
    cardBody.innerHTML=`<div class="maps-panel-title">Trips</div><div id="mapsTripsList"></div>`;
    if (!currentUser) { $('#mapsTripsList').innerHTML=`<div class="maps-empty-state"><div class="maps-empty-icon">🧳</div><div class="maps-empty-msg">Sign in to plan trips.</div></div>`; return; }
    const { data:mine } = await supabaseClient.from('maps_trips').select('*').eq('user_id',currentUser.id);
    const { data:collabRows } = await supabaseClient.from('maps_trip_collaborators').select('trip_id').eq('user_id',currentUser.id);
    const collabIds=(collabRows||[]).map(r=>r.trip_id);
    let collabTrips=[];
    if (collabIds.length) { const { data } = await supabaseClient.from('maps_trips').select('*').in('id',collabIds); collabTrips=data||[]; }
    allTrips=[...(mine||[]),...collabTrips];
    renderTripsList();
  }

  function renderTripsList() {
    const list=$('#mapsTripsList');
    if (!list) return;
    list.innerHTML = `<div class="maps-saved-item maps-new-trip-btn" id="newTripBtn">
      <div class="maps-saved-pin" style="background:#3b82f622;color:#3b82f6;">➕</div>
      <div class="maps-saved-text"><div class="maps-saved-label">New trip</div><div class="maps-saved-coords">Plan a multi-stop journey</div></div>
    </div>` +
    (allTrips.length ? allTrips.map(t=>`
      <div class="maps-saved-item" data-trip-id="${t.id}">
        <div class="maps-saved-pin" style="background:#6366f122;color:#6366f1;">🧳</div>
        <div class="maps-saved-text"><div class="maps-saved-label">${escapeHtml(t.title)}</div>
        <div class="maps-saved-coords">${t.is_public_editable?'🌐 Anyone can edit':'Private'}</div></div>
      </div>`).join('') : `<div class="maps-empty-state" style="margin-top:0;padding:12px 0"><div class="maps-empty-msg">No trips yet.</div></div>`);

    $('#newTripBtn').addEventListener('click', createTrip);
    list.querySelectorAll('[data-trip-id]').forEach(el=>el.addEventListener('click',()=>openTrip(el.dataset.tripId)));
  }

  async function createTrip() {
    if (!currentUser) return;
    const title=prompt('Trip name:','My trip');
    if (!title) return;
    const { data,error } = await supabaseClient.from('maps_trips').insert({ user_id:currentUser.id, title }).select().single();
    if (error) { showError(error.message); return; }
    await renderTripsView(); openTrip(data.id);
  }

  async function canEditTrip(trip) {
    if (!currentUser) return false;
    if (trip.user_id===currentUser.id||trip.is_public_editable) return true;
    const { data } = await supabaseClient.from('maps_trip_collaborators').select('user_id').eq('trip_id',trip.id).eq('user_id',currentUser.id).maybeSingle();
    return !!data;
  }

  async function addStopToTrip(tripId,place) {
    const { data:stops } = await supabaseClient.from('maps_trip_stops').select('id').eq('trip_id',tripId);
    await supabaseClient.from('maps_trip_stops').insert({ trip_id:tripId, name:shortLabel(place.label)||'Stop', lat:place.lat, lng:place.lon, added_by:currentUser.id, position:(stops||[]).length });
    setStatus('✅ Added to trip'); setTimeout(()=>setStatus(''),1800);
    if (activeTab==='trips') openTrip(tripId);
  }

  async function openTrip(id) {
    let trip=allTrips.find(t=>t.id===id);
    if (!trip) { const { data } = await supabaseClient.from('maps_trips').select('*').eq('id',id).maybeSingle(); trip=data; }
    if (!trip) { showError('Trip not found.'); return; }
    activeTrip=trip;
    activeTab='trips';
    const editable=await canEditTrip(trip);
    const { data:stops } = await supabaseClient.from('maps_trip_stops').select('*').eq('trip_id',id).order('position',{ascending:true});
    const isOwner=currentUser&&trip.user_id===currentUser.id;

    tripStopMarkers.forEach(m=>map.removeLayer(m)); tripStopMarkers=[];
    if (routeLine) { map.removeLayer(routeLine); routeLine=null; }
    (stops||[]).forEach((s,i)=>tripStopMarkers.push(L.marker([s.lat,s.lng]).addTo(map).bindTooltip(`${i+1}. ${s.name}`)));
    if (stops?.length) map.fitBounds(L.latLngBounds(stops.map(s=>[s.lat,s.lng])),{padding:[50,50]});

    const list=$('#mapsTripsList');
    if (!list) return;
    list.innerHTML=`
      <div class="maps-back-row"><button class="maps-btn-text" id="tripBackBtn">${icons.back} All trips</button></div>
      <div class="maps-detail-title" style="padding:0 14px 4px;">${escapeHtml(trip.title)}</div>
      <div class="maps-detail-type" style="padding:0 14px 10px;">${(stops||[]).length} stop${(stops||[]).length===1?'':'s'}${editable?' · editable':''}</div>
      <div class="maps-detail-actions" style="margin:0 14px 12px;flex-wrap:wrap;">
        ${editable?`<button class="maps-btn" id="addStopHereBtn">＋ Current pin</button>`:''}
        <button class="maps-btn-outline" id="shareTripBtn">${icons.share} Share</button>
        ${(stops||[]).length>=2?`<button class="maps-btn-outline" id="routeTripBtn">🗺️ Route</button><button class="maps-btn-outline" id="gpxTripBtn">${icons.export} GPX</button>`:''}
        ${isOwner?`<button class="maps-btn-outline" id="manageTripBtn">⚙️</button>`:''}
      </div>
      <div class="maps-saved-list">
        ${(stops||[]).map((s,i)=>`
          <div class="maps-saved-item" data-stop-id="${s.id}">
            ${editable?`<div class="maps-reorder-btns"><button data-up="${s.id}" ${i===0?'disabled':''}>▲</button><button data-down="${s.id}" ${i===stops.length-1?'disabled':''}>▼</button></div>`:''}
            <div class="maps-saved-pin" style="background:#6366f122;color:#6366f1;font-weight:700;font-size:13px;">${i+1}</div>
            <div class="maps-saved-text"><div class="maps-saved-label">${escapeHtml(s.name)}</div></div>
            ${editable?`<button class="maps-saved-del" data-remove-stop="${s.id}">${icons.close}</button>`:''}
          </div>`).join('')}
      </div>`;

    $('#tripBackBtn').addEventListener('click', ()=>{ activeTrip=null; renderTripsList(); });
    $('#addStopHereBtn')?.addEventListener('click', ()=>{ if(!currentPlace){showError('Pick a pin first.');return;} addStopToTrip(id,currentPlace); });
    $('#shareTripBtn').addEventListener('click', ()=>{
      const url=`${location.origin}${location.pathname}?trip=${trip.share_code}`;
      navigator.clipboard?.writeText(url).then(()=>{ setStatus('🔗 Trip link copied'); setTimeout(()=>setStatus(''),2000); }).catch(()=>{});
    });
    $('#routeTripBtn')?.addEventListener('click', ()=>routeTripStops(stops));
    $('#gpxTripBtn')?.addEventListener('click', ()=>exportTripGPX(trip,stops));
    $('#manageTripBtn')?.addEventListener('click', ()=>manageTrip(trip));
    list.querySelectorAll('[data-remove-stop]').forEach(btn=>btn.addEventListener('click',async()=>{ await supabaseClient.from('maps_trip_stops').delete().eq('id',btn.dataset.removeStop); openTrip(id); }));
    list.querySelectorAll('[data-up]').forEach(btn=>btn.addEventListener('click',()=>reorderStop(stops,btn.dataset.up,-1,id)));
    list.querySelectorAll('[data-down]').forEach(btn=>btn.addEventListener('click',()=>reorderStop(stops,btn.dataset.down,1,id)));
  }

  async function reorderStop(stops,stopId,dir,tripId) {
    const idx=stops.findIndex(s=>s.id===stopId), swapIdx=idx+dir;
    if (swapIdx<0||swapIdx>=stops.length) return;
    const a=stops[idx],b=stops[swapIdx];
    await Promise.all([
      supabaseClient.from('maps_trip_stops').update({position:b.position}).eq('id',a.id),
      supabaseClient.from('maps_trip_stops').update({position:a.position}).eq('id',b.id),
    ]);
    openTrip(tripId);
  }

  async function routeTripStops(stops) {
    if (!stops||stops.length<2) return;
    const coords=stops.map(s=>`${s.lng},${s.lat}`).join(';');
    try {
      const res=await fetch(`${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`);
      const data=await res.json();
      if (!data.routes?.length) { showError('No route through these stops.'); return; }
      if (routeLine) map.removeLayer(routeLine);
      routeLine=L.geoJSON(data.routes[0].geometry,{ style:{color:'#6366f1',weight:5,opacity:.85} }).addTo(map);
      map.fitBounds(routeLine.getBounds(),{padding:[50,50]});
    } catch { showError('Routing failed.'); }
  }

  function exportTripGPX(trip,stops) {
    const points=(stops||[]).map(s=>`  <wpt lat="${s.lat}" lon="${s.lng}"><name>${escapeXml(s.name)}</name></wpt>`).join('\n');
    const gpx=`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="360 Maps" xmlns="http://www.topografix.com/GPX/1/1">\n${points}\n</gpx>`;
    const blob=new Blob([gpx],{type:'application/gpx+xml'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`${trip.title.replace(/[^a-z0-9]+/gi,'-')}.gpx`; a.click(); URL.revokeObjectURL(a.href);
  }

  async function manageTrip(trip) {
    const makePublic=confirm(`"${trip.title}" is ${trip.is_public_editable?'PUBLIC':'private'}.\n\nOK = make public-editable\nCancel = private`);
    await supabaseClient.from('maps_trips').update({is_public_editable:makePublic}).eq('id',trip.id);
    if (!makePublic) {
      const { data:existing } = await supabaseClient.from('maps_trip_collaborators').select('user_id').eq('trip_id',trip.id);
      const { data:profs } = existing?.length ? await supabaseClient.from('profiles').select('id,username').in('id',existing.map(r=>r.user_id)) : {data:[]};
      const input=prompt('Collaborator usernames (comma-separated):',(profs||[]).map(p=>p.username).join(', '));
      if (input!==null) {
        await supabaseClient.from('maps_trip_collaborators').delete().eq('trip_id',trip.id);
        for (const un of input.split(',').map(s=>s.trim()).filter(Boolean)) {
          const { data:p } = await supabaseClient.from('profiles').select('id').ilike('username',un).maybeSingle();
          if (p) await supabaseClient.from('maps_trip_collaborators').insert({trip_id:trip.id, user_id:p.id, added_by:currentUser.id});
        }
      }
    }
    openTrip(trip.id);
  }

  async function checkTripDeepLink() {
    const code=new URLSearchParams(location.search).get('trip');
    if (!code) return;
    const { data:trip } = await supabaseClient.from('maps_trips').select('*').eq('share_code',code).maybeSingle();
    if (!trip) return;
    allTrips=[trip]; activeTab='trips';
    tabsBar.querySelectorAll('.maps-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab==='trips'));
    cardBody.innerHTML=`<div id="mapsTripsList"></div>`;
    openTrip(trip.id);
  }

  /* ══════════════════════════════════════════
     SAVE MODAL
  ══════════════════════════════════════════ */
  let modalCatSelection='other';
  function renderModalCatRow(active) {
    modalCatSelection=active;
    modalCatRow.innerHTML=CATS.map(c=>`
      <button type="button" class="maps-cat-chip${c.id===active?' active':''}" data-cat="${c.id}"
        style="${c.id===active?`background:${c.color};border-color:${c.color};`:''}">
        ${c.icon} ${c.label}
      </button>`).join('');
    modalCatRow.querySelectorAll('[data-cat]').forEach(btn=>btn.addEventListener('click',()=>renderModalCatRow(btn.dataset.cat)));
  }

  function openSaveModal() {
    if (!currentUser) { showError('Sign in to save locations'); return; }
    if (!currentPlace) return;
    modalLabel.value=currentPlace.label ? shortLabel(currentPlace.label) : 'Saved place';
    modalNote.value='';
    renderModalCatRow('other');
    modalOverlay.classList.add('show');
    modalLabel.focus();
  }
  modalCancel.addEventListener('click',()=>modalOverlay.classList.remove('show'));
  modalOverlay.addEventListener('click',e=>{ if(e.target===modalOverlay) modalOverlay.classList.remove('show'); });
  modalSave.addEventListener('click', async ()=>{
    const label=modalLabel.value.trim()||'Saved place', note=modalNote.value.trim()||null;
    if (!currentPlace) return;
    modalSave.disabled=true;
    try {
      const { error }=await supabaseClient.from('saved_locations').insert({ user_id:currentUser.id, label, lat:currentPlace.lat, lon:currentPlace.lon, note, category:modalCatSelection, icon:catMeta(modalCatSelection).icon });
      if (error) throw error;
      modalOverlay.classList.remove('show');
      showTab(activeTab);
    } catch(err) { showError(err.message||"Couldn't save"); }
    finally { modalSave.disabled=false; }
  });

  /* ══════════════════════════════════════════
     SEARCH + SUGGESTIONS
  ══════════════════════════════════════════ */
  function myLocationRow() {
    return `<div class="maps-suggest-item" data-kind="me">
      <span class="maps-suggest-icon" style="background:rgba(59,130,246,.12);color:#3b82f6;">${icons.pin}</span>
      <span class="maps-suggest-text"><div class="maps-suggest-main">Your location</div></span>
    </div>`;
  }

  function hideDropdown() {
    dropdown.classList.remove('visible'); dropdown.innerHTML=''; suggestList=[]; suggestIdx=-1;
  }

  function buildRows(recentItems, searchItems) {
    let html=myLocationRow(); suggestList=[{kind:'me'}];

    if (recentItems.length) {
      html+=`<div class="maps-suggest-section-label">Recent</div>`;
      recentItems.forEach(it => {
        suggestList.push({kind:'recent',...it});
        html+=`<div class="maps-suggest-item" data-kind="recent" data-idx="${suggestList.length-1}">
          <span class="maps-suggest-icon">${icons.clock}</span>
          <span class="maps-suggest-text"><div class="maps-suggest-main">${escapeHtml(shortLabel(it.label))}</div><div class="maps-suggest-sub">${escapeHtml(it.label)}</div></span>
          <button class="maps-suggest-remove" data-remove="${encodeURIComponent(it.label)}" aria-label="Remove">${icons.x}</button>
        </div>`;
      });
    }

    if (searchItems?.length) {
      html+=`<div class="maps-suggest-section-label">Places</div>`;
      searchItems.forEach(it => {
        suggestList.push({kind:'search',raw:it,label:it.display_name,lat:parseFloat(it.lat),lon:parseFloat(it.lon)});
        const main=shortLabel(it.display_name), sub=it.display_name.split(',').slice(1).join(',').trim();
        html+=`<div class="maps-suggest-item" data-kind="search" data-idx="${suggestList.length-1}">
          <span class="maps-suggest-icon">${icons.search}</span>
          <span class="maps-suggest-text"><div class="maps-suggest-main">${escapeHtml(main)}</div>${sub?`<div class="maps-suggest-sub">${escapeHtml(sub)}</div>`:''}</span>
        </div>`;
      });
    }

    dropdown.innerHTML=html; dropdown.classList.add('visible'); wireDropdownRows();
  }

  function wireDropdownRows() {
    dropdown.querySelectorAll('.maps-suggest-item').forEach(row => {
      row.addEventListener('mousedown', e => {
        if (e.target.closest('.maps-suggest-remove')) return;
        e.preventDefault();
        const kind=row.dataset.kind;
        if (kind==='me') { searchInput.value=''; hideDropdown(); useMyLocation(); return; }
        const idx=parseInt(row.dataset.idx,10), item=suggestList[idx];
        if (!item) return;
        hideDropdown(); searchInput.value=shortLabel(item.label);
        if (item.kind==='search'&&item.raw) selectFromResult(item.raw);
        else { selectRawLatLng(item.lat,item.lon); addRecent({label:item.label,lat:item.lat,lon:item.lon}); }
      });
    });
    dropdown.querySelectorAll('.maps-suggest-remove').forEach(btn => {
      btn.addEventListener('mousedown', e => {
        e.preventDefault(); e.stopPropagation();
        removeRecent(decodeURIComponent(btn.dataset.remove));
        renderForQuery(searchInput.value.trim());
      });
    });
  }

  async function renderForQuery(q) {
    const recent=getRecent();
    if (!q) { buildRows(recent.slice(0,5),[]); return; }
    const lower=q.toLowerCase();
    const matchingRecent=recent.filter(r=>r.label.toLowerCase().includes(lower)).slice(0,5);
    buildRows(matchingRecent,[]);
    if (q===lastQuery) return;
    lastQuery=q;
    try {
      const results=await nominatimSearch(q,5);
      if (searchInput.value.trim()!==q) return;
      const seen=new Set(matchingRecent.map(r=>r.label));
      const filtered=(results||[]).filter(r=>!seen.has(r.display_name));
      buildRows(matchingRecent,filtered.slice(0,Math.max(0,5-matchingRecent.length+3)));
    } catch {}
  }

  searchInput.addEventListener('focus',()=>renderForQuery(searchInput.value.trim()));
  searchInput.addEventListener('input',()=>{
    clearTimeout(suggestTimer); const q=searchInput.value.trim();
    suggestTimer=setTimeout(()=>renderForQuery(q),220);
  });
  document.addEventListener('click',e=>{ if(!e.target.closest('.maps-search-wrap')) hideDropdown(); });
  searchInput.addEventListener('keydown',e=>{
    const items=dropdown.querySelectorAll('.maps-suggest-item');
    if (!dropdown.classList.contains('visible')||!items.length) return;
    if (e.key==='ArrowDown') { e.preventDefault(); suggestIdx=Math.min(suggestIdx+1,items.length-1); items.forEach((it,i)=>it.classList.toggle('active',i===suggestIdx)); }
    else if (e.key==='ArrowUp') { e.preventDefault(); suggestIdx=Math.max(suggestIdx-1,-1); items.forEach((it,i)=>it.classList.toggle('active',i===suggestIdx)); }
    else if (e.key==='Escape') hideDropdown();
    else if (e.key==='Enter'&&suggestIdx>=0) { e.preventDefault(); items[suggestIdx].dispatchEvent(new Event('mousedown')); }
  });

  searchForm.addEventListener('submit', async e => {
    e.preventDefault(); const q=searchInput.value.trim(); if (!q) return;
    hideDropdown(); setStatus('Searching…');
    try { const results=await robustSearch(q); setStatus(''); await selectFromResult(results[0]); }
    catch(err) { setStatus(''); showError(err.message||"Couldn't find that place"); }
  });

  /* ══════════════════════════════════════════
     GEOLOCATION
  ══════════════════════════════════════════ */
  function getPosition(onOk, onFail) {
    if (!navigator.geolocation) { onFail('Geolocation not supported'); return; }
    let settled=false;
    const tryLow=()=>{ navigator.geolocation.getCurrentPosition(pos=>{ if(!settled){settled=true;onOk(pos);} },err=>{ if(!settled){settled=true;onFail(geoMsg(err));} },{enableHighAccuracy:false,timeout:8000,maximumAge:60000}); };
    navigator.geolocation.getCurrentPosition(pos=>{ if(!settled){settled=true;onOk(pos);} },()=>{ if(!settled) tryLow(); },{enableHighAccuracy:true,timeout:6000,maximumAge:0});
  }
  function geoMsg(err) {
    if (!err) return "Couldn't get your location";
    return [,'Location access blocked — allow it in your browser settings.','Device location unavailable — try again.','Location timed out — try again.'][err.code]||"Couldn't get your location";
  }

  function useMyLocation() {
    setStatus('Locating…');
    getPosition(pos=>{ setStatus(''); selectRawLatLng(pos.coords.latitude,pos.coords.longitude); startWatching(); }, msg=>{ setStatus(''); showError(msg); });
  }
  locateBtn.addEventListener('click', useMyLocation);

  fullscreenBtn.addEventListener('click', ()=>{
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>{});
    else document.exitFullscreen?.();
  });
  document.addEventListener('fullscreenchange',()=>{
    fullscreenBtn.classList.toggle('active',!!document.fullscreenElement);
    setTimeout(()=>map.invalidateSize(),200);
  });

  /* ══════════════════════════════════════════
     MEASURE TOOL
  ══════════════════════════════════════════ */
  function startMeasuring() {
    measuring=true; measurePoints=[];
    measureBtn.classList.add('active'); measureReadout.style.display='flex';
    measureText.textContent='Click the map to add points. Double-click to finish.';
    if (measureLine) { map.removeLayer(measureLine); measureLine=null; }
    measureMarkers.forEach(m=>map.removeLayer(m)); measureMarkers=[];
    map.doubleClickZoom.disable(); map.once('dblclick',stopMeasuring);
  }
  function stopMeasuring() {
    measuring=false; measureBtn.classList.remove('active'); measureReadout.style.display='none'; map.doubleClickZoom.enable();
  }
  function addMeasurePoint(latlng) {
    measurePoints.push(latlng);
    measureMarkers.push(L.circleMarker(latlng,{radius:5,color:'#f59e0b',fillOpacity:1}).addTo(map));
    if (measureLine) map.removeLayer(measureLine);
    if (measurePoints.length>1) {
      measureLine=L.polyline(measurePoints,{color:'#f59e0b',weight:4,dashArray:'6 6'}).addTo(map);
      let totalKm=0;
      for (let i=1;i<measurePoints.length;i++) totalKm+=haversineKm(measurePoints[i-1].lat,measurePoints[i-1].lng,measurePoints[i].lat,measurePoints[i].lng);
      measureText.textContent=`${fmtDist(totalKm)} (${(totalKm*0.621371).toFixed(2)} mi) — ${measurePoints.length} points`;
    }
  }
  measureBtn.addEventListener('click',()=>measuring?stopMeasuring():startMeasuring());
  measureClearBtn.addEventListener('click',()=>{
    measurePoints=[];
    if(measureLine){map.removeLayer(measureLine);measureLine=null;}
    measureMarkers.forEach(m=>map.removeLayer(m)); measureMarkers=[];
    measureText.textContent='Click the map to add points. Double-click to finish.';
  });
  measureDoneBtn.addEventListener('click',stopMeasuring);

  /* ══════════════════════════════════════════
     LIVE TRACKING DOT
  ══════════════════════════════════════════ */
  function meIcon() {
    return L.divIcon({ className:'', html:`<div class="maps-me-dot" style="--me-color:${meColor()}"></div>`, iconSize:[20,20], iconAnchor:[10,10] });
  }
  function updateMeMarker(lat,lon) {
    if (!meMarker) meMarker=L.marker([lat,lon],{icon:meIcon(),zIndexOffset:1000}).addTo(map);
    else { meMarker.setIcon(meIcon()); meMarker.setLatLng([lat,lon]); }
    return {lat,lon};
  }
  function startWatching(onUpdate) {
    if (!navigator.geolocation) return;
    if (watchId!==null) navigator.geolocation.clearWatch(watchId);
    watchId=navigator.geolocation.watchPosition(
      pos=>{ const p=updateMeMarker(pos.coords.latitude,pos.coords.longitude); if(onUpdate) onUpdate(p); },
      ()=>{}, {enableHighAccuracy:true,maximumAge:4000,timeout:8000}
    );
  }

  /* ══════════════════════════════════════════
     TRAVEL MODE PICKER
  ══════════════════════════════════════════ */
  const TRAVEL_MODES = {
    car:     { label:'Car',     profile:'driving',  osrm:OSRM,       icon:'🚗', color:'#3b82f6' },
    walk:    { label:'Walk',    profile:'foot',     osrm:'https://routing.openstreetmap.de/routed-foot', icon:'🚶', color:'#22c55e' },
    bike:    { label:'Bike',    profile:'cycling',  osrm:'https://routing.openstreetmap.de/routed-bike', icon:'🚲', color:'#f59e0b' },
    transit: { label:'Transit', profile:'foot',     osrm:'https://routing.openstreetmap.de/routed-foot', icon:'🚌', color:'#8b5cf6' },
  };

  function openModePicker() {
    return new Promise(resolve => {
      const ov=document.createElement('div'); ov.className='maps-modal-overlay show';
      ov.innerHTML=`<div class="maps-modal maps-mode-modal">
        <h3>Choose travel mode</h3>
        <div class="maps-mode-grid">
          ${Object.entries(TRAVEL_MODES).map(([key,m])=>`
            <button class="maps-mode-btn" data-mode="${key}">
              <span style="font-size:24px;">${m.icon}</span><span>${m.label}</span>
            </button>`).join('')}
        </div>
        <div class="maps-modal-actions"><button class="maps-btn-outline" id="mapsModeCancel">Cancel</button></div>
      </div>`;
      document.body.appendChild(ov);
      const cleanup=r=>{ ov.remove(); resolve(r); };
      ov.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>cleanup(btn.dataset.mode)));
      ov.querySelector('#mapsModeCancel').addEventListener('click',()=>cleanup(null));
      ov.addEventListener('click',e=>{ if(e.target===ov) cleanup(null); });
    });
  }

  /* ══════════════════════════════════════════
     NAVIGATION
  ══════════════════════════════════════════ */
  async function startNavigation() {
    if (!currentPlace) return;
    const mode=await openModePicker(); if (!mode) return;
    setStatus('Getting your location…');
    getPosition(pos=>{ setStatus(''); enterNavMode({lat:pos.coords.latitude,lon:pos.coords.longitude},mode); }, msg=>{ setStatus(''); showError(msg); });
  }

  async function requestRoute(origin, mode, silent) {
    try {
      const m=TRAVEL_MODES[mode]||TRAVEL_MODES.car;
      const url=`${m.osrm}/route/v1/${m.profile}/${origin.lon},${origin.lat};${currentPlace.lon},${currentPlace.lat}?overview=full&geometries=geojson&steps=true`;
      const data=await fetchJson(url);
      if (!data.routes?.length) throw new Error('No route found');
      const route=data.routes[0];

      if (routeLine) map.removeLayer(routeLine);
      const coords=route.geometry.coordinates.map(c=>[c[1],c[0]]);
      routeLine=L.polyline(coords,{color:m.color,weight:6,opacity:.9}).addTo(map);
      if (!silent) map.fitBounds(routeLine.getBounds(),{padding:[60,60]});

      const km=(route.distance/1000).toFixed(1);
      const mins=Math.round(route.duration/60);
      navEta.textContent=formatTime(mins);
      navSub.textContent=`${km} km · ${shortLabel(currentPlace.label)||'Destination'}${mode==='transit'?' (walking route)':''}`;

      routeSteps=(route.legs||[]).flatMap(l=>l.steps||[]);
      currentStepIdx=0; renderNavSteps(); updateNavInstruction();
    } catch(err) { if(!silent) showError("Couldn't get directions"); }
  }

  function maneuverText(step) {
    const m=step.maneuver||{}, road=step.name?` onto ${step.name}`:'', type=m.type, mod=m.modifier;
    if (type==='depart') return `Head ${mod||''}${road}`.trim();
    if (type==='arrive') return 'You have arrived';
    if (type==='roundabout'||type==='rotary') return `At the roundabout, take the exit${road}`;
    if (mod) { const lbl={left:'Turn left',right:'Turn right','slight left':'Bear left','slight right':'Bear right','sharp left':'Sharp left','sharp right':'Sharp right',straight:'Continue straight',uturn:'U-turn'}[mod]||'Continue'; return `${lbl}${road}`; }
    return `Continue${road}`;
  }
  function maneuverIcon(step) {
    const mod=(step.maneuver||{}).modifier;
    if (!mod) return '⬆️';
    if (mod.includes('left')) return '⬅️';
    if (mod.includes('right')) return '➡️';
    if (mod==='uturn') return '↩️';
    return '⬆️';
  }

  function renderNavSteps() {
    navStepsPanel.innerHTML=routeSteps.map((s,i)=>`
      <div class="maps-nav-step${i===currentStepIdx?' active':''}" data-step="${i}">
        <span class="maps-nav-step-icon">${maneuverIcon(s)}</span>
        <span class="maps-nav-step-text">${escapeHtml(maneuverText(s))}</span>
        <span class="maps-nav-step-dist">${s.distance>0?Math.round(s.distance)+' m':''}</span>
      </div>`).join('');
  }
  navStepsToggle.addEventListener('click',()=>navStepsPanel.classList.toggle('show'));

  function updateNavInstruction() {
    const step=routeSteps[currentStepIdx];
    navInstruction.textContent=step?`${maneuverIcon(step)} ${maneuverText(step)}`:'';
    navStepsPanel.querySelectorAll('.maps-nav-step').forEach((el,i)=>el.classList.toggle('active',i===currentStepIdx));
  }

  function updateNavProgress(pos, origin, mode) {
    if (!routeSteps.length) return;
    const next=routeSteps[currentStepIdx+1];
    if (next?.maneuver) {
      const [lon,lat]=next.maneuver.location;
      if (haversineKm(pos.lat,pos.lon,lat,lon)<0.03) { currentStepIdx++; updateNavInstruction(); }
    }
    if (routeLine) {
      const latlngs=routeLine.getLatLngs(); let minDist=Infinity;
      for (const p of latlngs) minDist=Math.min(minDist,haversineKm(pos.lat,pos.lon,p.lat,p.lng));
      if (minDist>0.08) {
        const now=Date.now();
        if (!lastRouteFetchPos||now-lastRouteFetchPos>8000) { lastRouteFetchPos=now; navSub.textContent='Rerouting…'; requestRoute({lat:pos.lat,lon:pos.lon},mode,true); }
      }
    }
  }

  function enterNavMode(origin, mode) {
    navActive=true; navMode=mode;
    document.body.classList.add('maps-nav-fullscreen');
    mapsCard.classList.add('hidden'); navBar.classList.add('show'); navStepsPanel.classList.remove('show');
    updateMeMarker(origin.lat,origin.lon);
    requestRoute(origin,mode);
    startWatching(pos=>{ map.panTo([pos.lat,pos.lon]); updateNavProgress(pos,origin,mode); });
    map.setView([origin.lat,origin.lon],17);
  }
  function exitNavMode() {
    navActive=false; document.body.classList.remove('maps-nav-fullscreen');
    mapsCard.classList.remove('hidden'); navBar.classList.remove('show'); navStepsPanel.classList.remove('show');
    routeSteps=[]; currentStepIdx=0;
    if (routeLine) { map.removeLayer(routeLine); routeLine=null; }
  }
  navExitBtn.addEventListener('click',exitNavMode);

  /* ══════════════════════════════════════════
     KEYBOARD SHORTCUTS
  ══════════════════════════════════════════ */
  window.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.key==='m'||e.key==='M') measureBtn.click();
    else if (e.key==='f'||e.key==='F') fullscreenBtn.click();
    else if (e.key==='l'||e.key==='L') locateBtn.click();
    else if (e.key==='/'||e.key==='s'||e.key==='S') { searchInput.focus(); e.preventDefault(); }
    else if (e.key==='Escape') { if(measuring) stopMeasuring(); else if(navActive) exitNavMode(); else hideDropdown(); }
    else if (e.key==='1') setTileLayer('standard');
    else if (e.key==='2') setTileLayer('dark');
    else if (e.key==='3') setTileLayer('satellite');
    else if (e.key==='4') setTileLayer('terrain');
    else if (e.key==='5') setTileLayer('voyager');
  });

  /* ══════════════════════════════════════════
     AUTH
  ══════════════════════════════════════════ */
  async function initAuth() {
    showListView();
    if (typeof supabaseClient==='undefined'||!supabaseClient) return;
    const { data:{ session } } = await supabaseClient.auth.getSession();
    currentUser=session?.user??null;
    await loadSavedLocations();
    checkTripDeepLink();
    checkDeepLink();
    supabaseClient.auth.onAuthStateChange((_,sess)=>{ currentUser=sess?.user??null; loadSavedLocations(); });
  }

  /* ══════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════ */
  document.body.classList.add('maps-lock');
  initMap();
  initAuth();
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',run);
  else run();
})();
