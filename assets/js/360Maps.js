/* ========================================================
   360 Maps — v4.0.0 client logic
   Built entirely on free, keyless services:
   OpenStreetMap / CARTO / Esri / OpenTopoMap tiles, Nominatim
   geocoding, OSRM + FOSSGIS routing, Overpass POI search,
   Open-Elevation, Open-Meteo. No tracking, no ads, no billing.
======================================================== */
(function () {
  const SUPABASE_URL = 'https://wiswfpfsjiowtrdyqpxy.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dmcGZzamlvd3RyZHlxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  // ── Shared state ──
  let map, marker, routeLine;
  let currentUser = null;
  let savedPlaces = [];
  let selected = null;              // { lat, lng, label, address }
  let myPosition = null;            // [lat, lng]
  let myAccuracyCircle = null;
  let suggestTimer = null, lastSuggestId = 0;
  let travelMode = 'car';           // car | bike | foot
  let activeCatFilter = 'all';
  let activeTrip = null;
  let tripStopMarkers = [];
  let measuring = false;
  let measurePoints = [];
  let measureLine = null, measureMarkers = [];
  let nearbyMarkers = [];
  let lastPoiTag = null;

  const CATS = [
    { id: 'home', icon: '🏠', label: 'Home' },
    { id: 'work', icon: '💼', label: 'Work' },
    { id: 'food', icon: '🍽️', label: 'Food' },
    { id: 'shopping', icon: '🛍️', label: 'Shopping' },
    { id: 'nature', icon: '🌳', label: 'Nature' },
    { id: 'favorite', icon: '⭐', label: 'Favorite' },
    { id: 'other', icon: '📍', label: 'Other' },
  ];
  const POI_TAGS = {
    restaurant: 'amenity=restaurant', cafe: 'amenity=cafe', fuel: 'amenity=fuel',
    atm: 'amenity=atm', hospital: 'amenity=hospital', park: 'leisure=park',
  };
  const POI_ICON = { restaurant: '🍽️', cafe: '☕', fuel: '⛽', atm: '🏧', hospital: '🏥', park: '🌳' };

  const RECENTS_KEY = '360maps_recent_searches';
  function getRecents() { try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch { return []; } }
  function pushRecent(entry) {
    let r = getRecents().filter(x => x.label !== entry.label);
    r.unshift(entry); r = r.slice(0, 8);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(r));
  }

  const els = {};
  ['mapsSearchForm','mapsSearchInput','mapsSuggestDropdown','mapsStatus','mapsError','mapsQuickCats',
   'mapsListCard','mapsSigninNotice','mapsSavedList','mapsSavedCount','mapsCatFilterRow',
   'mapsTripsCard','mapsTripsList','mapsNearbyCard','mapsNearbyList','mapsNearbyHint',
   'mapsDetailCard','mapsBackBtn','mapsDetailTitle','mapsDetailCoords','mapsCopyCoords',
   'mapsInfoStrip','mapsElevation','mapsWeather','mapsDetailCatRow',
   'mapsSaveBtn','mapsCompareBtn','mapsAddStopQuickBtn','mapsModeRow',
   'mapsDirectionsBtn','mapsDirectionsBox','mapsDirectionsDistance','mapsDirectionsDuration',
   'mapsCompareOverlay','mapsCompareSelect','mapsCompareResult','mapsCompareCancel',
   'mapsModalOverlay','mapsModalLabel','mapsModalNote','mapsModalCatRow','mapsModalCancel','mapsModalSave',
   'mapsLayerSwitcher','mapsMeasureBtn','mapsFullscreenBtn','mapsLocateBtn',
   'mapsMeasureReadout','mapsMeasureText','mapsMeasureClear','mapsMeasureDone',
  ].forEach(id => els[id] = document.getElementById(id));

  function esc(s) { return (s ?? '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtCoord(lat, lng) { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
  window.addEventListener('offline', () => setStatus("⚠️ You're offline — search and directions need a connection."));
  window.addEventListener('online', () => setStatus(''));
  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
  function catMeta(id) { return CATS.find(c => c.id === id) || CATS[CATS.length - 1]; }

  let toastEl = null;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'maps-toast'; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2200);
  }
  function setStatus(m) { els.mapsStatus.textContent = m || ''; }
  function setError(m) { els.mapsError.textContent = m || ''; }
  function openAuthPopup() { document.getElementById('auth-popup')?.classList.remove('hidden'); }

  /* ════════════════════════════════════════════════════
     MAP + TILE LAYERS
  ════════════════════════════════════════════════════ */
  const TILE_LAYERS = {
    standard: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap contributors', maxZoom: 19 },
    dark:     { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 },
    satellite:{ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Tiles &copy; Esri', maxZoom: 19 },
    terrain:  { url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap, SRTM | &copy; OpenTopoMap', maxZoom: 17 },
  };
  let tileLayer = null;
  function setTileLayer(style) {
    const cfg = TILE_LAYERS[style] || TILE_LAYERS.standard;
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(cfg.url, { maxZoom: cfg.maxZoom, attribution: cfg.attr }).addTo(map);
    localStorage.setItem('360maps_tile_style', style);
    els.mapsLayerSwitcher.querySelectorAll('.maps-layer-btn').forEach(b => b.classList.toggle('active', b.dataset.style === style));
  }
  els.mapsLayerSwitcher.querySelectorAll('.maps-layer-btn').forEach(btn => {
    btn.addEventListener('click', () => setTileLayer(btn.dataset.style));
  });

  function initMap() {
    map = L.map('mapsCanvas', { zoomControl: false, attributionControl: true }).setView([20, 0], 3);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    setTileLayer(localStorage.getItem('360maps_tile_style') || (document.body.classList.contains('dark') ? 'dark' : 'standard'));

    map.on('click', (e) => {
      if (measuring) { addMeasurePoint(e.latlng); return; }
      selectLocation(e.latlng.lat, e.latlng.lng, null);
    });

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        myPosition = [pos.coords.latitude, pos.coords.longitude];
        if (!currentUser) map.setView(myPosition, 12);
        renderSavedList();
      }, () => {}, { timeout: 5000 });
    }
  }

  /* ════════════════════════════════════════════════════
     LOCATION SELECTION + DETAIL CARD
  ════════════════════════════════════════════════════ */
  function showDetail() {
    els.mapsListCard.style.display = 'none';
    els.mapsTripsCard.style.display = 'none';
    els.mapsNearbyCard.style.display = 'none';
    els.mapsDetailCard.style.display = '';
    els.mapsDirectionsBox.style.display = 'none';
  }
  function showTab(tab) {
    els.mapsDetailCard.style.display = 'none';
    els.mapsListCard.style.display = tab === 'saved' ? '' : 'none';
    els.mapsTripsCard.style.display = tab === 'trips' ? '' : 'none';
    els.mapsNearbyCard.style.display = tab === 'nearby' ? '' : 'none';
    document.querySelectorAll('.maps-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'trips') loadTrips();
    if (routeLine && tab !== 'trips') { map.removeLayer(routeLine); routeLine = null; }
  }
  document.querySelectorAll('.maps-tab').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

  function selectLocation(lat, lng, label, address) {
    selected = { lat, lng, label, address, category: null };
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng]).addTo(map);
    map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });

    els.mapsDetailTitle.textContent = label || address || 'Locating…';
    document.getElementById('mapsDetailCoords').textContent = fmtCoord(lat, lng);
    renderDetailCatRow(null);
    els.mapsAddStopQuickBtn.style.display = activeTrip ? '' : 'none';
    showDetail();
    fetchElevationAndWeather(lat, lng);
    if (label) pushRecent({ lat, lng, label, address });
    else reverseGeocode(lat, lng);
  }

  async function reverseGeocode(lat, lng) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': navigator.language || 'en' } });
      const d = await res.json();
      if (selected && selected.lat === lat && selected.lng === lng && !selected.label) {
        const name = d.display_name ? d.display_name.split(',')[0] : 'Dropped pin';
        selected.label = name; selected.address = d.display_name;
        els.mapsDetailTitle.textContent = name;
      }
    } catch (e) {
      if (selected && !selected.label) els.mapsDetailTitle.textContent = 'Dropped pin';
    }
  }

  function renderDetailCatRow(activeId) {
    els.mapsDetailCatRow.innerHTML = CATS.map(c => `<span class="maps-cat-chip mini${activeId===c.id?' active':''}">${c.icon}</span>`).join('');
  }

  els.mapsCopyCoords.addEventListener('click', () => {
    if (!selected) return;
    navigator.clipboard.writeText(fmtCoord(selected.lat, selected.lng)).then(() => toast('📋 Coordinates copied')).catch(() => {});
  });

  async function fetchElevationAndWeather(lat, lng) {
    els.mapsElevation.textContent = '…'; els.mapsWeather.textContent = '…';
    fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lng}`)
      .then(r => r.json())
      .then(d => { const m = d?.results?.[0]?.elevation; els.mapsElevation.textContent = (m != null) ? `${Math.round(m)} m` : '—'; })
      .catch(() => { els.mapsElevation.textContent = '—'; });

    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`)
      .then(r => r.json())
      .then(d => {
        const w = d?.current_weather;
        if (!w) { els.mapsWeather.textContent = '—'; return; }
        els.mapsWeather.textContent = `${Math.round(w.temperature)}°C, ${weatherLabel(w.weathercode)}`;
      })
      .catch(() => { els.mapsWeather.textContent = '—'; });
  }
  function weatherLabel(code) {
    const map = { 0:'Clear', 1:'Mostly clear', 2:'Partly cloudy', 3:'Overcast', 45:'Fog', 48:'Fog',
      51:'Drizzle', 61:'Rain', 63:'Rain', 65:'Heavy rain', 71:'Snow', 73:'Snow', 75:'Heavy snow',
      80:'Showers', 95:'Storms' };
    return map[code] || 'Unknown';
  }

  els.mapsBackBtn.addEventListener('click', () => showTab(document.querySelector('.maps-tab.active')?.dataset.tab || 'saved'));

  /* ════════════════════════════════════════════════════
     SEARCH (Nominatim, debounced autocomplete + recents)
  ════════════════════════════════════════════════════ */
  els.mapsSearchInput.addEventListener('focus', () => {
    if (els.mapsSearchInput.value.trim()) return;
    const recents = getRecents();
    if (!recents.length) return;
    els.mapsSuggestDropdown.innerHTML = `<div class="maps-suggest-label">Recent</div>` + recents.map((r, i) => `
      <div class="maps-suggest-item" data-recent="${i}">
        <div class="maps-suggest-main">🕐 ${esc(r.label)}</div>
        <div class="maps-suggest-sub">${esc(r.address || '')}</div>
      </div>`).join('');
    els.mapsSuggestDropdown.querySelectorAll('[data-recent]').forEach(el => {
      el.addEventListener('click', () => {
        const r = recents[+el.dataset.recent];
        els.mapsSearchInput.value = r.label;
        els.mapsSuggestDropdown.innerHTML = '';
        selectLocation(r.lat, r.lng, r.label, r.address);
      });
    });
  });
  els.mapsSearchInput.addEventListener('blur', () => setTimeout(() => { els.mapsSuggestDropdown.innerHTML = ''; }, 150));
  els.mapsSearchInput.addEventListener('input', () => {
    clearTimeout(suggestTimer);
    const q = els.mapsSearchInput.value.trim();
    if (q.length < 3) { els.mapsSuggestDropdown.innerHTML = ''; return; }
    suggestTimer = setTimeout(() => fetchSuggestions(q), 300);
  });

  async function fetchSuggestions(q) {
    const myId = ++lastSuggestId;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': navigator.language || 'en' } });
      const data = await res.json();
      if (myId !== lastSuggestId) return;
      if (!data.length) { els.mapsSuggestDropdown.innerHTML = ''; return; }
      els.mapsSuggestDropdown.innerHTML = data.map((r, i) => `
        <div class="maps-suggest-item" data-i="${i}">
          <div class="maps-suggest-main">${suggestIcon(r)} ${esc(shortLabel(r))}</div>
          <div class="maps-suggest-sub">${esc(r.display_name)}</div>
        </div>`).join('');
      els.mapsSuggestDropdown.querySelectorAll('[data-i]').forEach(el => {
        el.addEventListener('click', () => {
          const r = data[+el.dataset.i];
          els.mapsSearchInput.value = shortLabel(r);
          els.mapsSuggestDropdown.innerHTML = '';
          selectLocation(+r.lat, +r.lon, shortLabel(r), r.display_name);
        });
      });
    } catch (e) {}
  }
  function shortLabel(r) { return r.display_name.split(',')[0]; }
  function suggestIcon(r) {
    const cls = r.class, type = r.type;
    if (cls === 'place' && ['city','town','village','hamlet'].includes(type)) return '🏙️';
    if (cls === 'amenity') {
      if (type === 'restaurant' || type === 'fast_food') return '🍽️';
      if (type === 'cafe') return '☕';
      if (type === 'fuel') return '⛽';
      if (type === 'hospital') return '🏥';
      if (type === 'school' || type === 'university') return '🎓';
      return '📍';
    }
    if (cls === 'tourism') return '🎡';
    if (cls === 'shop') return '🛍️';
    if (cls === 'natural' || cls === 'leisure') return '🌳';
    if (cls === 'highway') return '🛣️';
    if (cls === 'building') return '🏢';
    return '📍';
  }

  els.mapsSearchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.mapsSuggestDropdown.innerHTML = '';
    const q = els.mapsSearchInput.value.trim();
    if (!q) return;
    setError(''); setStatus('Searching…');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': navigator.language || 'en' } });
      const data = await res.json();
      setStatus('');
      if (!data.length) { setError('No results found.'); return; }
      const r = data[0];
      selectLocation(+r.lat, +r.lon, shortLabel(r), r.display_name);
    } catch (e) { setStatus(''); setError('Search failed — check your connection.'); }
  });

  /* ════════════════════════════════════════════════════
     QUICK NEARBY CATEGORIES (Overpass API)
  ════════════════════════════════════════════════════ */
  els.mapsQuickCats.querySelectorAll('.maps-quickcat-btn').forEach(btn => {
    btn.addEventListener('click', () => runNearbySearch(btn.dataset.poi));
  });

  async function runNearbySearch(tag) {
    lastPoiTag = tag;
    const center = selected ? [selected.lat, selected.lng] : (myPosition || map.getCenter());
    const [lat, lng] = Array.isArray(center) ? center : [center.lat, center.lng];
    showTab('nearby');
    els.mapsNearbyHint.textContent = `Searching for ${tag} near ${selected ? esc(selected.label || 'pin') : 'your view'}…`;
    els.mapsNearbyList.innerHTML = '';
    nearbyMarkers.forEach(m => map.removeLayer(m)); nearbyMarkers = [];

    const filter = POI_TAGS[tag];
    const query = `[out:json][timeout:25];(node[${filter.split('=').map((s,i)=>i===0?s:`"${s}"`).join('=')}](around:2000,${lat},${lng});); out body 25;`;
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(query) });
      const data = await res.json();
      const results = (data.elements || []).filter(el => el.tags?.name);
      if (!results.length) { els.mapsNearbyHint.textContent = 'No results nearby. Try a different area or category.'; return; }
      els.mapsNearbyHint.textContent = `${results.length} result${results.length===1?'':'s'} within 2 km:`;
      results.sort((a,b) => haversineKm(lat,lng,a.lat,a.lon) - haversineKm(lat,lng,b.lat,b.lon));
      els.mapsNearbyList.innerHTML = results.map((r, i) => `
        <div class="maps-saved-item maps-nearby-item" data-i="${i}">
          <div class="maps-saved-icon">${POI_ICON[tag] || '📍'}</div>
          <div class="maps-saved-info">
            <div class="maps-saved-name">${esc(r.tags.name)}</div>
            <div class="maps-saved-sub">${haversineKm(lat,lng,r.lat,r.lon).toFixed(2)} km away</div>
          </div>
        </div>`).join('');
      results.forEach(r => nearbyMarkers.push(L.circleMarker([r.lat, r.lon], { radius: 6, color: '#06b6d4', fillOpacity: .8 }).addTo(map)));
      els.mapsNearbyList.querySelectorAll('[data-i]').forEach(el => {
        el.addEventListener('click', () => {
          const r = results[+el.dataset.i];
          selectLocation(r.lat, r.lon, r.tags.name, r.tags['addr:street'] ? `${r.tags['addr:housenumber']||''} ${r.tags['addr:street']}` : '');
        });
      });
    } catch (e) {
      els.mapsNearbyHint.textContent = 'Nearby search failed — check your connection.';
    }
  }

  /* ════════════════════════════════════════════════════
     SAVED PLACES (categorized, filterable)
  ════════════════════════════════════════════════════ */
  els.mapsSaveBtn.addEventListener('click', () => {
    if (!currentUser) { openAuthPopup(); return; }
    if (!selected) return;
    els.mapsModalLabel.value = selected.label || '';
    els.mapsModalNote.value = '';
    renderModalCatRow('other');
    els.mapsModalOverlay.classList.add('open');
    els.mapsModalLabel.focus();
  });
  els.mapsModalCancel.addEventListener('click', () => els.mapsModalOverlay.classList.remove('open'));
  els.mapsModalOverlay.addEventListener('click', e => { if (e.target === els.mapsModalOverlay) els.mapsModalOverlay.classList.remove('open'); });

  let modalCatSelection = 'other';
  function renderModalCatRow(active) {
    modalCatSelection = active;
    els.mapsModalCatRow.innerHTML = CATS.map(c => `<button type="button" class="maps-cat-chip${c.id===active?' active':''}" data-cat="${c.id}">${c.icon} ${c.label}</button>`).join('');
    els.mapsModalCatRow.querySelectorAll('[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => { modalCatSelection = btn.dataset.cat; renderModalCatRow(modalCatSelection); });
    });
  }

  els.mapsModalSave.addEventListener('click', async () => {
    if (!currentUser || !selected) return;
    const name = els.mapsModalLabel.value.trim() || selected.label || 'Saved place';
    const note = els.mapsModalNote.value.trim();
    const { data, error } = await sb.from('maps_saved_places').insert({
      user_id: currentUser.id, name, lat: selected.lat, lng: selected.lng,
      address: selected.address || null, notes: note || null,
      icon: catMeta(modalCatSelection).icon, category: modalCatSelection
    }).select().single();
    if (error) { setError('Could not save: ' + error.message); return; }
    savedPlaces.unshift(data);
    els.mapsModalOverlay.classList.remove('open');
    renderSavedList();
    toast('📍 Saved!');
  });

  async function loadSavedPlaces() {
    if (!currentUser) { savedPlaces = []; els.mapsSigninNotice.style.display = ''; renderSavedList(); return; }
    els.mapsSigninNotice.style.display = 'none';
    const { data, error } = await sb.from('maps_saved_places').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    if (!error) savedPlaces = data || [];
    renderSavedList();
  }

  function renderCatFilterRow() {
    const cats = ['all', ...new Set(savedPlaces.map(p => p.category || 'other'))];
    els.mapsCatFilterRow.innerHTML = cats.map(id => {
      const meta = id === 'all' ? { icon: '🗂️', label: 'All' } : catMeta(id);
      return `<button class="maps-cat-chip${activeCatFilter===id?' active':''}" data-filter="${id}">${meta.icon} ${meta.label}</button>`;
    }).join('');
    els.mapsCatFilterRow.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => { activeCatFilter = btn.dataset.filter; renderSavedList(); });
    });
  }

  function renderSavedList() {
    els.mapsSavedCount.textContent = savedPlaces.length ? String(savedPlaces.length) : '';
    renderCatFilterRow();
    const list = activeCatFilter === 'all' ? savedPlaces : savedPlaces.filter(p => (p.category || 'other') === activeCatFilter);
    if (!list.length) {
      els.mapsSavedList.innerHTML = currentUser ? `<div class="maps-empty">No saved places${activeCatFilter!=='all'?' in this category':' yet'}. Search or click the map, then hit Save.</div>` : '';
      return;
    }
    els.mapsSavedList.innerHTML = list.map(p => {
      const dist = myPosition ? `${haversineKm(myPosition[0], myPosition[1], p.lat, p.lng).toFixed(1)} km away` : '';
      return `
        <div class="maps-saved-item" data-id="${p.id}">
          <div class="maps-saved-icon">${esc(p.icon || catMeta(p.category).icon)}</div>
          <div class="maps-saved-info">
            <div class="maps-saved-name">${esc(p.name)}</div>
            <div class="maps-saved-sub">${esc(p.notes || p.address || '')}${dist ? ' · ' + dist : ''}</div>
          </div>
          <button class="maps-saved-del" data-del="${p.id}" title="Remove">✕</button>
        </div>`;
    }).join('');
    els.mapsSavedList.querySelectorAll('.maps-saved-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.maps-saved-del')) return;
        const p = savedPlaces.find(x => x.id === el.dataset.id);
        if (p) selectLocation(p.lat, p.lng, p.name, p.address);
      });
    });
    els.mapsSavedList.querySelectorAll('.maps-saved-del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await sb.from('maps_saved_places').delete().eq('id', btn.dataset.del);
        savedPlaces = savedPlaces.filter(p => p.id !== btn.dataset.del);
        renderSavedList();
      });
    });
  }

  /* ════════════════════════════════════════════════════
     COMPARE DISTANCE
  ════════════════════════════════════════════════════ */
  els.mapsCompareBtn.addEventListener('click', () => {
    if (!selected) return;
    if (!savedPlaces.length) { toast('Save a few places first to compare distances.'); return; }
    els.mapsCompareSelect.innerHTML = savedPlaces.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
    els.mapsCompareResult.textContent = '';
    els.mapsCompareOverlay.classList.add('open');
    updateCompareResult();
  });
  els.mapsCompareSelect.addEventListener('change', updateCompareResult);
  function updateCompareResult() {
    const p = savedPlaces.find(x => x.id === els.mapsCompareSelect.value);
    if (!p || !selected) return;
    const km = haversineKm(selected.lat, selected.lng, p.lat, p.lng);
    els.mapsCompareResult.innerHTML = `<b>${km.toFixed(2)} km</b> straight-line distance (${(km*0.621371).toFixed(2)} mi)`;
  }
  els.mapsCompareCancel.addEventListener('click', () => els.mapsCompareOverlay.classList.remove('open'));
  els.mapsCompareOverlay.addEventListener('click', e => { if (e.target === els.mapsCompareOverlay) els.mapsCompareOverlay.classList.remove('open'); });

  /* ════════════════════════════════════════════════════
     DIRECTIONS (multi-modal, with graceful fallback)
  ════════════════════════════════════════════════════ */
  els.mapsModeRow.querySelectorAll('.maps-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      els.mapsModeRow.querySelectorAll('.maps-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      travelMode = btn.dataset.mode;
      if (els.mapsDirectionsBox.style.display !== 'none') fetchDirections();
    });
  });

  els.mapsDirectionsBtn.addEventListener('click', async () => {
    if (!selected) return;
    if (!myPosition) {
      setError('Enable location access to get directions.');
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => { myPosition = [pos.coords.latitude, pos.coords.longitude]; fetchDirections(); }, () => setError('Location permission denied.'));
      }
      return;
    }
    fetchDirections();
  });

  async function fetchDirections() {
    setError(''); setStatus('Getting directions…');
    const alt = 'alternatives=true&';
    const profileUrls = {
      car:  [`https://routing.openstreetmap.de/routed-car/route/v1/driving/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?${alt}overview=full&geometries=geojson`,
             `https://router.project-osrm.org/route/v1/driving/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?${alt}overview=full&geometries=geojson`],
      bike: [`https://routing.openstreetmap.de/routed-bike/route/v1/bike/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?overview=full&geometries=geojson`,
             `https://router.project-osrm.org/route/v1/driving/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?overview=full&geometries=geojson`],
      foot: [`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?overview=full&geometries=geojson`,
             `https://router.project-osrm.org/route/v1/driving/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?overview=full&geometries=geojson`],
    };
    const urls = profileUrls[travelMode] || profileUrls.car;
    let routes = null, usedFallback = false;
    for (let i = 0; i < urls.length; i++) {
      try {
        const res = await fetch(urls[i]);
        const data = await res.json();
        if (data.routes?.length) { routes = data.routes; usedFallback = i > 0; break; }
      } catch (e) {}
    }
    setStatus('');
    if (!routes) { setError('No route found.'); return; }
    if (usedFallback && travelMode !== 'car') setStatus('Showing driving route — bike/walk routing unavailable right now.');
    drawRoute(routes[0]);
    renderRouteAlternatives(routes);
  }

  function drawRoute(route) {
    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.geoJSON(route.geometry, { style: { color: '#3b82f6', weight: 5, opacity: .85 } }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
    const km = (route.distance / 1000).toFixed(1);
    const mins = Math.round(route.duration / 60);
    els.mapsDirectionsDistance.textContent = `${km} km`;
    els.mapsDirectionsDuration.textContent = mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60}m`;
    els.mapsDirectionsBox.style.display = '';
  }

  function renderRouteAlternatives(routes) {
    let altBox = document.getElementById('mapsRouteAlts');
    if (!altBox) {
      altBox = document.createElement('div');
      altBox.id = 'mapsRouteAlts';
      altBox.className = 'maps-route-alts';
      els.mapsDirectionsBox.appendChild(altBox);
    }
    if (routes.length < 2) { altBox.innerHTML = ''; return; }
    altBox.innerHTML = routes.map((r, i) => `
      <button class="maps-alt-btn${i===0?' active':''}" data-alt="${i}">
        ${i===0?'⭐ ':''}${(r.distance/1000).toFixed(1)} km · ${Math.round(r.duration/60)} min
      </button>`).join('');
    altBox.querySelectorAll('[data-alt]').forEach(btn => {
      btn.addEventListener('click', () => {
        altBox.querySelectorAll('.maps-alt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        drawRoute(routes[+btn.dataset.alt]);
      });
    });
  }

  /* ════════════════════════════════════════════════════
     MEASURE TOOL
  ════════════════════════════════════════════════════ */
  els.mapsMeasureBtn.addEventListener('click', () => { measuring ? stopMeasuring() : startMeasuring(); });
  function startMeasuring() {
    measuring = true; measurePoints = [];
    els.mapsMeasureBtn.classList.add('active');
    els.mapsMeasureReadout.style.display = 'flex';
    els.mapsMeasureText.textContent = 'Click points on the map to measure. Double-click to finish.';
    if (measureLine) { map.removeLayer(measureLine); measureLine = null; }
    measureMarkers.forEach(m => map.removeLayer(m)); measureMarkers = [];
    map.doubleClickZoom.disable();
    map.once('dblclick', () => stopMeasuring());
  }
  function stopMeasuring() {
    measuring = false;
    els.mapsMeasureBtn.classList.remove('active');
    els.mapsMeasureReadout.style.display = 'none';
    map.doubleClickZoom.enable();
  }
  function addMeasurePoint(latlng) {
    measurePoints.push(latlng);
    measureMarkers.push(L.circleMarker(latlng, { radius: 5, color: '#f59e0b', fillOpacity: 1 }).addTo(map));
    if (measureLine) map.removeLayer(measureLine);
    if (measurePoints.length > 1) {
      measureLine = L.polyline(measurePoints, { color: '#f59e0b', weight: 4, dashArray: '6 6' }).addTo(map);
      let total = 0;
      for (let i = 1; i < measurePoints.length; i++) total += haversineKm(measurePoints[i-1].lat, measurePoints[i-1].lng, measurePoints[i].lat, measurePoints[i].lng);
      els.mapsMeasureText.textContent = `Total: ${total.toFixed(2)} km (${(total*0.621371).toFixed(2)} mi) — ${measurePoints.length} points`;
    }
  }
  els.mapsMeasureClear.addEventListener('click', () => {
    measurePoints = [];
    if (measureLine) { map.removeLayer(measureLine); measureLine = null; }
    measureMarkers.forEach(m => map.removeLayer(m)); measureMarkers = [];
    els.mapsMeasureText.textContent = 'Click points on the map to measure. Double-click to finish.';
  });
  els.mapsMeasureDone.addEventListener('click', stopMeasuring);

  /* ════════════════════════════════════════════════════
     FULLSCREEN + MY LOCATION
  ════════════════════════════════════════════════════ */
  els.mapsFullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(()=>{});
    else document.exitFullscreen?.();
  });
  document.addEventListener('fullscreenchange', () => {
    els.mapsFullscreenBtn.classList.toggle('active', !!document.fullscreenElement);
    setTimeout(() => map.invalidateSize(), 200);
  });

  els.mapsLocateBtn.addEventListener('click', () => {
    if (!navigator.geolocation) { toast('Location not available.'); return; }
    els.mapsLocateBtn.textContent = '…';
    navigator.geolocation.getCurrentPosition((pos) => {
      myPosition = [pos.coords.latitude, pos.coords.longitude];
      els.mapsLocateBtn.textContent = '🎯';
      map.flyTo(myPosition, 15, { duration: 0.7 });
      if (myAccuracyCircle) map.removeLayer(myAccuracyCircle);
      myAccuracyCircle = L.circle(myPosition, { radius: pos.coords.accuracy, color: '#3b82f6', fillOpacity: .1 }).addTo(map);
      renderSavedList();
    }, () => { els.mapsLocateBtn.textContent = '🎯'; toast('Could not get your location.'); }, { enableHighAccuracy: true });
  });

  /* ════════════════════════════════════════════════════
     KEYBOARD SHORTCUTS
  ════════════════════════════════════════════════════ */
  const LAYER_CYCLE = ['standard', 'dark', 'satellite', 'terrain'];
  window.addEventListener('keydown', (e) => {
    if (['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    if (e.key === '/') { e.preventDefault(); els.mapsSearchInput.focus(); }
    else if (e.key === 'm' || e.key === 'M') els.mapsMeasureBtn.click();
    else if (e.key === 'f' || e.key === 'F') els.mapsFullscreenBtn.click();
    else if (e.key === 'l' || e.key === 'L') {
      const cur = localStorage.getItem('360maps_tile_style') || 'standard';
      setTileLayer(LAYER_CYCLE[(LAYER_CYCLE.indexOf(cur) + 1) % LAYER_CYCLE.length]);
    }
    else if (e.key === 'Escape') { els.mapsSuggestDropdown.innerHTML = ''; if (measuring) stopMeasuring(); }
  });

  /* ════════════════════════════════════════════════════
     TRIPS — collaborative multi-stop route planning
  ════════════════════════════════════════════════════ */
  let allTrips = [];

  async function loadTrips() {
    if (!currentUser) { els.mapsTripsList.innerHTML = `<div class="maps-signin-notice">Sign in to plan trips.</div>`; return; }
    const { data: mine } = await sb.from('maps_trips').select('*').eq('user_id', currentUser.id);
    const { data: collabRows } = await sb.from('maps_trip_collaborators').select('trip_id').eq('user_id', currentUser.id);
    const collabIds = (collabRows || []).map(r => r.trip_id);
    let collabTrips = [];
    if (collabIds.length) { const { data } = await sb.from('maps_trips').select('*').in('id', collabIds); collabTrips = data || []; }
    allTrips = [...(mine || []), ...collabTrips];
    renderTripsList();
  }

  function renderTripsList() {
    const newBtn = `<div class="maps-saved-item" id="newTripBtn"><div class="maps-saved-icon">➕</div><div class="maps-saved-info"><div class="maps-saved-name">New trip</div></div></div>`;
    els.mapsTripsList.innerHTML = newBtn + (allTrips.length ? allTrips.map(t => `
      <div class="maps-saved-item" data-trip-id="${t.id}">
        <div class="maps-saved-icon">🧳</div>
        <div class="maps-saved-info"><div class="maps-saved-name">${esc(t.title)}</div>
        <div class="maps-saved-sub">${t.is_public_editable ? '🌐 anyone can edit' : ''}</div></div>
      </div>`).join('') : `<div class="maps-empty">No trips yet.</div>`);
    document.getElementById('newTripBtn').addEventListener('click', createTrip);
    els.mapsTripsList.querySelectorAll('[data-trip-id]').forEach(el => el.addEventListener('click', () => openTrip(el.dataset.tripId)));
  }

  async function createTrip() {
    if (!currentUser) return;
    const title = prompt('Trip name:', 'My trip');
    if (!title) return;
    const { data, error } = await sb.from('maps_trips').insert({ user_id: currentUser.id, title }).select().single();
    if (error) { setError(error.message); return; }
    toast('✅ Trip created.');
    await loadTrips();
    openTrip(data.id);
  }

  async function canEditTrip(trip) {
    if (!currentUser) return false;
    if (trip.user_id === currentUser.id) return true;
    if (trip.is_public_editable) return true;
    const { data } = await sb.from('maps_trip_collaborators').select('user_id').eq('trip_id', trip.id).eq('user_id', currentUser.id).maybeSingle();
    return !!data;
  }

  async function openTrip(id) {
    let trip = allTrips.find(t => t.id === id);
    if (!trip) { const { data } = await sb.from('maps_trips').select('*').eq('id', id).maybeSingle(); trip = data; }
    if (!trip) { setError('Trip not found.'); return; }
    activeTrip = trip;
    const editable = await canEditTrip(trip);
    const { data: stops } = await sb.from('maps_trip_stops').select('*').eq('trip_id', id).order('position', { ascending: true });
    const isOwner = currentUser && trip.user_id === currentUser.id;

    tripStopMarkers.forEach(m => map.removeLayer(m)); tripStopMarkers = [];
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    (stops || []).forEach((s, i) => tripStopMarkers.push(L.marker([s.lat, s.lng]).addTo(map).bindTooltip(`${i+1}. ${s.name}`)));
    if (stops?.length) map.fitBounds(L.latLngBounds(stops.map(s => [s.lat, s.lng])), { padding: [50, 50] });

    els.mapsTripsList.innerHTML = `
      <div class="maps-back-row"><button class="maps-btn-text" id="tripBackBtn">← All trips</button></div>
      <div class="maps-detail-title">${esc(trip.title)}</div>
      <div class="maps-detail-coords">${(stops||[]).length} stop${(stops||[]).length===1?'':'s'}${editable ? ' · you can edit' : ''}</div>
      <div class="maps-detail-actions" style="margin-bottom:10px;flex-wrap:wrap;">
        ${editable ? `<button class="maps-btn" id="addStopBtn">＋ Add current pin</button>` : ''}
        <button class="maps-btn-outline" id="shareTripBtn">🔗 Share</button>
        ${(stops||[]).length >= 2 ? `<button class="maps-btn-outline" id="routeTripBtn">Route</button><button class="maps-btn-outline" id="gpxTripBtn">⬇ GPX</button>` : ''}
        ${isOwner ? `<button class="maps-btn-outline" id="manageTripBtn">⚙️</button>` : ''}
      </div>
      <div class="maps-saved-list">
        ${(stops||[]).map((s, i) => `
          <div class="maps-saved-item" data-stop-id="${s.id}">
            ${editable ? `<div class="maps-reorder-btns"><button data-up="${s.id}" ${i===0?'disabled':''}>▲</button><button data-down="${s.id}" ${i===(stops.length-1)?'disabled':''}>▼</button></div>` : ''}
            <div class="maps-saved-icon">${i+1}</div>
            <div class="maps-saved-info"><div class="maps-saved-name">${esc(s.name)}</div><div class="maps-saved-sub">${esc(s.notes||'')}</div></div>
            ${editable ? `<button class="maps-saved-del" data-remove-stop="${s.id}">✕</button>` : ''}
          </div>`).join('')}
      </div>`;

    document.getElementById('tripBackBtn').addEventListener('click', () => { activeTrip = null; renderTripsList(); });
    document.getElementById('addStopBtn')?.addEventListener('click', async () => {
      if (!selected) { toast('Search or click the map to pick a spot first.'); return; }
      await sb.from('maps_trip_stops').insert({ trip_id: id, name: selected.label || selected.address || 'Stop', lat: selected.lat, lng: selected.lng, added_by: currentUser.id, position: (stops||[]).length });
      openTrip(id);
    });
    document.getElementById('shareTripBtn').addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?trip=${trip.share_code}`;
      navigator.clipboard.writeText(url).then(() => toast('🔗 Trip link copied!')).catch(() => toast(url));
    });
    document.getElementById('routeTripBtn')?.addEventListener('click', () => routeTripStops(stops));
    document.getElementById('gpxTripBtn')?.addEventListener('click', () => exportTripGPX(trip, stops));
    document.getElementById('manageTripBtn')?.addEventListener('click', () => manageTrip(trip));
    els.mapsTripsList.querySelectorAll('[data-remove-stop]').forEach(btn => btn.addEventListener('click', async () => { await sb.from('maps_trip_stops').delete().eq('id', btn.dataset.removeStop); openTrip(id); }));
    els.mapsTripsList.querySelectorAll('[data-up]').forEach(btn => btn.addEventListener('click', () => reorderStop(stops, btn.dataset.up, -1, id)));
    els.mapsTripsList.querySelectorAll('[data-down]').forEach(btn => btn.addEventListener('click', () => reorderStop(stops, btn.dataset.down, 1, id)));
  }

  async function reorderStop(stops, stopId, dir, tripId) {
    const idx = stops.findIndex(s => s.id === stopId);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= stops.length) return;
    const a = stops[idx], b = stops[swapIdx];
    await Promise.all([
      sb.from('maps_trip_stops').update({ position: b.position }).eq('id', a.id),
      sb.from('maps_trip_stops').update({ position: a.position }).eq('id', b.id),
    ]);
    openTrip(tripId);
  }

  async function routeTripStops(stops) {
    if (!stops || stops.length < 2) return;
    const coords = stops.map(s => `${s.lng},${s.lat}`).join(';');
    try {
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
      const data = await res.json();
      if (!data.routes?.length) { setError('No route through these stops.'); return; }
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.geoJSON(data.routes[0].geometry, { style: { color: '#06b6d4', weight: 5, opacity: .85 } }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
      toast(`Total: ${(data.routes[0].distance/1000).toFixed(1)} km`);
    } catch (e) { setError('Routing failed.'); }
  }

  function exportTripGPX(trip, stops) {
    const points = (stops || []).map(s => `  <wpt lat="${s.lat}" lon="${s.lng}"><name>${escXml(s.name)}</name></wpt>`).join('\n');
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="360 Maps" xmlns="http://www.topografix.com/GPX/1/1">\n${points}\n</gpx>`;
    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${trip.title.replace(/[^a-z0-9]+/gi,'-')}.gpx`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  function escXml(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  async function manageTrip(trip) {
    const makePublic = confirm(`"${trip.title}" is ${trip.is_public_editable ? 'PUBLIC (anyone can add stops)' : 'private'}.\n\nOK = make public-editable\nCancel = keep private (collaborator-only)`);
    await sb.from('maps_trips').update({ is_public_editable: makePublic }).eq('id', trip.id);
    if (!makePublic) {
      const { data: existing } = await sb.from('maps_trip_collaborators').select('user_id').eq('trip_id', trip.id);
      const { data: profs } = existing?.length ? await sb.from('profiles').select('id,username').in('id', existing.map(r=>r.user_id)) : { data: [] };
      const input = prompt('Collaborator usernames (comma separated):', (profs||[]).map(p=>p.username).join(', '));
      if (input !== null) {
        await sb.from('maps_trip_collaborators').delete().eq('trip_id', trip.id);
        for (const un of input.split(',').map(s=>s.trim()).filter(Boolean)) {
          const { data: p } = await sb.from('profiles').select('id').ilike('username', un).maybeSingle();
          if (p) await sb.from('maps_trip_collaborators').insert({ trip_id: trip.id, user_id: p.id, added_by: currentUser.id });
        }
      }
    }
    toast('✅ Trip settings updated.');
    openTrip(trip.id);
  }

  els.mapsAddStopQuickBtn.addEventListener('click', async () => {
    if (!activeTrip || !selected) return;
    await sb.from('maps_trip_stops').insert({ trip_id: activeTrip.id, name: selected.label || 'Stop', lat: selected.lat, lng: selected.lng, added_by: currentUser.id, position: 999 });
    toast('Added to trip.');
    showTab('trips'); openTrip(activeTrip.id);
  });

  async function checkTripDeepLink() {
    const code = new URLSearchParams(location.search).get('trip');
    if (!code) return;
    const { data: trip } = await sb.from('maps_trips').select('*').eq('share_code', code).maybeSingle();
    if (!trip) return;
    allTrips = [trip];
    showTab('trips');
    openTrip(trip.id);
  }

  function checkDeepLink() {
    const p = new URLSearchParams(location.search);
    const lat = parseFloat(p.get('lat')), lng = parseFloat(p.get('lng'));
    if (!isNaN(lat) && !isNaN(lng)) { selectLocation(lat, lng, p.get('label') || null); map.setView([lat, lng], 15); }
  }

  /* ════════════════════════════════════════════════════
     SESSION RESUME + AUTH
  ════════════════════════════════════════════════════ */
  let sessionSaveTimer = null;
  function scheduleSessionSave() {
    if (!currentUser) return;
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = setTimeout(async () => {
      const c = map.getCenter();
      await sb.from('maps_sessions').upsert({ user_id: currentUser.id, last_lat: c.lat, last_lng: c.lng, last_zoom: map.getZoom(), updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    }, 1500);
  }

  async function initAuth() {
    const { data: { session } } = await sb.auth.getSession();
    currentUser = session?.user ?? null;
    await afterAuthResolved();
  }
  sb.auth.onAuthStateChange(async (_e, session) => { currentUser = session?.user ?? null; await afterAuthResolved(); });

  async function afterAuthResolved() {
    await loadSavedPlaces();
    if (currentUser) {
      const { data } = await sb.from('maps_sessions').select('*').eq('user_id', currentUser.id).maybeSingle();
      if (data && !new URLSearchParams(location.search).has('lat')) map.setView([data.last_lat, data.last_lng], data.last_zoom || 12);
      map.on('moveend zoomend', scheduleSessionSave);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initAuth().then(checkTripDeepLink);
    checkDeepLink();
  });
})();
