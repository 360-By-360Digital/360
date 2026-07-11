/* ========================================================
   360 Maps — v3.0.0 client logic
   Built on Leaflet + OpenStreetMap + Nominatim + OSRM. 
   (I'm used to using that from weathermaps, the original inspiration of 360)
   No API keys, no per-request billing, no tracking sent to a
   third-party map vendor -- that's the actual differentiator
   here, not trying to out-feature Google's satellite imagery. 
   but this is tuff boiee.
======================================================== */
(function () {
  const SUPABASE_URL = 'https://wiswfpfsjiowtrdyqpxy.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dmcGZzamlvd3RyZHlxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM';
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  let map, marker, routeLine;
  let currentUser = null;
  let savedPlaces = [];
  let selected = null; // { lat, lng, label, address }
  let myPosition = null; // [lat, lng] from geolocation, for distance display + directions origin
  let suggestTimer = null;
  let lastSuggestId = 0;
  let travelMode = 'car'; // 'car' | 'bike' | 'foot'
  let activeTrip = null; // currently open trip { id, title, ... }
  let tripStopMarkers = [];

  const RECENTS_KEY = '360maps_recent_searches';
  function getRecents() { try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]'); } catch { return []; } }
  function pushRecent(entry) {
    let r = getRecents().filter(x => x.label !== entry.label);
    r.unshift(entry);
    r = r.slice(0, 8);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(r));
  }

  const els = {};
  ['mapsSearchForm','mapsSearchInput','mapsSuggestDropdown','mapsStatus','mapsError',
   'mapsListCard','mapsSigninNotice','mapsSavedList',
   'mapsDetailCard','mapsBackBtn','mapsDetailTitle','mapsDetailCoords',
   'mapsSaveBtn','mapsDirectionsBtn','mapsDirectionsBox','mapsDirectionsDistance','mapsDirectionsDuration',
   'mapsModalOverlay','mapsModalLabel','mapsModalNote','mapsModalCancel','mapsModalSave'
  ].forEach(id => els[id] = document.getElementById(id));

  function initMap() {
    map = L.map('mapsCanvas', { zoomControl: false, attributionControl: true }).setView([20, 0], 3);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    map.on('click', (e) => {
      selectLocation(e.latlng.lat, e.latlng.lng, null);
    });

    // Try to center on the user's location on first load (graceful no-op if denied).
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        myPosition = [pos.coords.latitude, pos.coords.longitude];
        if (!currentUser) map.setView(myPosition, 12); // signed-in users get their saved session view instead
        renderSavedList(); // refresh distances now that we know where we are
      }, () => {}, { timeout: 5000 });
    }
  }

  function setStatus(msg) { els.mapsStatus.textContent = msg || ''; }
  function setError(msg) { els.mapsError.textContent = msg || ''; }

  function fmtCoord(lat, lng) { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function showDetail() {
    els.mapsListCard.style.display = 'none';
    els.mapsDetailCard.style.display = '';
    els.mapsDirectionsBox.style.display = 'none';
  }
  function showList() {
    els.mapsListCard.style.display = '';
    els.mapsDetailCard.style.display = 'none';
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
  }

  function selectLocation(lat, lng, label, address) {
    selected = { lat, lng, label, address };
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng]).addTo(map);
    map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });

    els.mapsDetailTitle.textContent = label || address || 'Dropped pin';
    els.mapsDetailCoords.textContent = fmtCoord(lat, lng);
    showDetail();
    if (label) pushRecent({ lat, lng, label, address });
  }

  // ── Search (Nominatim, debounced autocomplete) ──
  els.mapsSearchInput.addEventListener('focus', () => {
    if (els.mapsSearchInput.value.trim()) return;
    const recents = getRecents();
    if (!recents.length) return;
    els.mapsSuggestDropdown.innerHTML = `<div class="maps-suggest-label">Recent</div>` + recents.map((r, i) => `
      <div class="maps-suggest-item" data-recent="${i}">
        <div class="maps-suggest-main">🕐 ${escHtml(r.label)}</div>
        <div class="maps-suggest-sub">${escHtml(r.address || '')}</div>
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

  els.mapsSearchInput.addEventListener('input', () => {
    clearTimeout(suggestTimer);
    const q = els.mapsSearchInput.value.trim();
    if (q.length < 3) { els.mapsSuggestDropdown.innerHTML = ''; return; }
    suggestTimer = setTimeout(() => fetchSuggestions(q), 300);
  });

  async function fetchSuggestions(q) {
    const myId = ++lastSuggestId;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`, {
        headers: { 'Accept-Language': navigator.language || 'en' }
      });
      const data = await res.json();
      if (myId !== lastSuggestId) return; // a newer keystroke already superseded this request
      if (!data.length) { els.mapsSuggestDropdown.innerHTML = ''; return; }
      els.mapsSuggestDropdown.innerHTML = data.map((r, i) => `
        <div class="maps-suggest-item" data-i="${i}">
          <div class="maps-suggest-main">${escHtml(shortLabel(r))}</div>
          <div class="maps-suggest-sub">${escHtml(r.display_name)}</div>
        </div>`).join('');
      els.mapsSuggestDropdown.querySelectorAll('.maps-suggest-item').forEach(el => {
        el.addEventListener('click', () => {
          const r = data[+el.dataset.i];
          els.mapsSearchInput.value = shortLabel(r);
          els.mapsSuggestDropdown.innerHTML = '';
          selectLocation(+r.lat, +r.lon, shortLabel(r), r.display_name);
        });
      });
    } catch (e) { /* offline or rate-limited -- fail quietly, plain search still works on submit */ }
  }

  function shortLabel(r) {
    return r.display_name.split(',')[0];
  }
  function escHtml(s) {
    return (s ?? '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  els.mapsSearchForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    els.mapsSuggestDropdown.innerHTML = '';
    const q = els.mapsSearchInput.value.trim();
    if (!q) return;
    setError(''); setStatus('Searching…');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`, {
        headers: { 'Accept-Language': navigator.language || 'en' }
      });
      const data = await res.json();
      setStatus('');
      if (!data.length) { setError('No results found.'); return; }
      const r = data[0];
      selectLocation(+r.lat, +r.lon, shortLabel(r), r.display_name);
    } catch (e) {
      setStatus(''); setError('Search failed — check your connection.');
    }
  });

  // Keyboard shortcut: "/" focuses search from anywhere on the page.
  window.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== els.mapsSearchInput) {
      e.preventDefault(); els.mapsSearchInput.focus();
    }
    if (e.key === 'Escape') { els.mapsSuggestDropdown.innerHTML = ''; }
  });

  els.mapsSearchInput.addEventListener('blur', () => {
    setTimeout(() => { els.mapsSuggestDropdown.innerHTML = ''; }, 150);
  });

  els.mapsBackBtn.addEventListener('click', showList);

  // ── Save location ──
  els.mapsSaveBtn.addEventListener('click', () => {
    if (!currentUser) { openAuthPopup(); return; }
    if (!selected) return;
    els.mapsModalLabel.value = selected.label || '';
    els.mapsModalNote.value = '';
    els.mapsModalOverlay.classList.add('open');
    els.mapsModalLabel.focus();
  });
  els.mapsModalCancel.addEventListener('click', () => els.mapsModalOverlay.classList.remove('open'));
  els.mapsModalOverlay.addEventListener('click', e => { if (e.target === els.mapsModalOverlay) els.mapsModalOverlay.classList.remove('open'); });

  els.mapsModalSave.addEventListener('click', async () => {
    if (!currentUser || !selected) return;
    const name = els.mapsModalLabel.value.trim() || selected.label || 'Saved place';
    const note = els.mapsModalNote.value.trim();
    const { data, error } = await sb.from('maps_saved_places').insert({
      user_id: currentUser.id, name, lat: selected.lat, lng: selected.lng,
      address: selected.address || null, notes: note || null, icon: '📍'
    }).select().single();
    if (error) { setError('Could not save: ' + error.message); return; }
    savedPlaces.unshift(data);
    els.mapsModalOverlay.classList.remove('open');
    renderSavedList();
    showToastLocal('📍 Saved!');
  });

  function showToastLocal(msg) {
    let t = document.getElementById('mapsToast');
    if (!t) {
      t = document.createElement('div'); t.id = 'mapsToast'; t.className = 'maps-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2200);
  }

  async function loadSavedPlaces() {
    if (!currentUser) {
      savedPlaces = [];
      els.mapsSigninNotice.style.display = '';
      renderSavedList();
      return;
    }
    els.mapsSigninNotice.style.display = 'none';
    const { data, error } = await sb.from('maps_saved_places').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    if (!error) savedPlaces = data || [];
    renderSavedList();
  }

  function renderSavedList() {
    if (!savedPlaces.length) {
      els.mapsSavedList.innerHTML = currentUser
        ? `<div class="maps-empty">No saved places yet. Search or click the map, then hit Save.</div>`
        : '';
      return;
    }
    els.mapsSavedList.innerHTML = savedPlaces.map(p => {
      const dist = myPosition ? `${haversineKm(myPosition[0], myPosition[1], p.lat, p.lng).toFixed(1)} km away` : '';
      return `
        <div class="maps-saved-item" data-id="${p.id}">
          <div class="maps-saved-icon">${escHtml(p.icon || '📍')}</div>
          <div class="maps-saved-info">
            <div class="maps-saved-name">${escHtml(p.name)}</div>
            <div class="maps-saved-sub">${escHtml(p.notes || p.address || '')}${dist ? ' · ' + dist : ''}</div>
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
        const id = btn.dataset.del;
        await sb.from('maps_saved_places').delete().eq('id', id);
        savedPlaces = savedPlaces.filter(p => p.id !== id);
        renderSavedList();
      });
    });
  }

  // Mode selector (Drive/Bike/Walk) -- injected once, lives above the directions button.
  const modeRow = document.createElement('div');
  modeRow.className = 'maps-mode-row';
  modeRow.innerHTML = `
    <button class="maps-mode-btn active" data-mode="car">🚗 Drive</button>
    <button class="maps-mode-btn" data-mode="bike">🚴 Bike</button>
    <button class="maps-mode-btn" data-mode="foot">🚶 Walk</button>`;
  els.mapsDetailCard.insertBefore(modeRow, els.mapsDirectionsBox);
  modeRow.querySelectorAll('.maps-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modeRow.querySelectorAll('.maps-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      travelMode = btn.dataset.mode;
      if (els.mapsDirectionsBox.style.display !== 'none') fetchDirections();
    });
  });

  // ── Directions (FOSSGIS's multi-modal router for bike/foot, with a
  // driving fallback if the endpoint pattern ever changes -- degrades
  // gracefully instead of breaking the whole feature) ──
  els.mapsDirectionsBtn.addEventListener('click', async () => {
    if (!selected) return;
    if (!myPosition) {
      setError('Enable location access to get directions.');
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          myPosition = [pos.coords.latitude, pos.coords.longitude];
          fetchDirections();
        }, () => setError('Location permission denied.'));
      }
      return;
    }
    fetchDirections();
  });

  async function fetchDirections() {
    setError(''); setStatus('Getting directions…');
    const profileUrls = {
      car:  [`https://routing.openstreetmap.de/routed-car/route/v1/driving/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?overview=full&geometries=geojson`,
             `https://router.project-osrm.org/route/v1/driving/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?overview=full&geometries=geojson`],
      bike: [`https://routing.openstreetmap.de/routed-bike/route/v1/bike/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?overview=full&geometries=geojson`,
             `https://router.project-osrm.org/route/v1/driving/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?overview=full&geometries=geojson`],
      foot: [`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?overview=full&geometries=geojson`,
             `https://router.project-osrm.org/route/v1/driving/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?overview=full&geometries=geojson`],
    };
    const urls = profileUrls[travelMode] || profileUrls.car;
    let route = null, usedFallback = false;
    for (let i = 0; i < urls.length; i++) {
      try {
        const res = await fetch(urls[i]);
        const data = await res.json();
        if (data.routes?.length) { route = data.routes[0]; usedFallback = i > 0; break; }
      } catch (e) { /* try next endpoint */ }
    }
    setStatus('');
    if (!route) { setError('No route found.'); return; }
    if (usedFallback && travelMode !== 'car') setStatus('Showing driving route — bike/walk routing unavailable right now.');

    if (routeLine) map.removeLayer(routeLine);
    routeLine = L.geoJSON(route.geometry, { style: { color: '#3b82f6', weight: 5, opacity: 0.85 } }).addTo(map);
    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });

    const km = (route.distance / 1000).toFixed(1);
    const mins = Math.round(route.duration / 60);
    els.mapsDirectionsDistance.textContent = `${km} km`;
    els.mapsDirectionsDuration.textContent = mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60}m`;
    els.mapsDirectionsBox.style.display = '';
  }

  // ── Share link (?lat=&lng=&label=) ──
  function checkDeepLink() {
    const p = new URLSearchParams(location.search);
    const lat = parseFloat(p.get('lat')), lng = parseFloat(p.get('lng'));
    if (!isNaN(lat) && !isNaN(lng)) {
      selectLocation(lat, lng, p.get('label') || null);
      map.setView([lat, lng], 15);
    }
  }

  function openAuthPopup() {
    document.getElementById('auth-popup')?.classList.remove('hidden');
  }

  // ── Session resume (signed-in users pick up where they left off) ──
  let sessionSaveTimer = null;
  function scheduleSessionSave() {
    if (!currentUser) return;
    clearTimeout(sessionSaveTimer);
    sessionSaveTimer = setTimeout(async () => {
      const c = map.getCenter();
      await sb.from('maps_sessions').upsert({
        user_id: currentUser.id, last_lat: c.lat, last_lng: c.lng, last_zoom: map.getZoom(), updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
    }, 1500);
  }

  async function initAuth() {
    const { data: { session } } = await sb.auth.getSession();
    currentUser = session?.user ?? null;
    await afterAuthResolved();
  }
  sb.auth.onAuthStateChange(async (_e, session) => {
    currentUser = session?.user ?? null;
    await afterAuthResolved();
  });

  async function afterAuthResolved() {
    await loadSavedPlaces();
    if (currentUser) {
      const { data } = await sb.from('maps_sessions').select('*').eq('user_id', currentUser.id).maybeSingle();
      if (data && !new URLSearchParams(location.search).has('lat')) {
        map.setView([data.last_lat, data.last_lng], data.last_zoom || 12);
      }
      map.on('moveend zoomend', scheduleSessionSave);
    }
  }

  // ══════════════════════════════════════════════════════
  // TRIPS — collaborative multi-stop route planning
  // ══════════════════════════════════════════════════════
  let allTrips = [];

  function injectTripsUI() {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'maps-btn-outline maps-trips-toggle';
    toggleBtn.textContent = '🧳 Trips';
    els.mapsSearchForm.parentElement.insertBefore(toggleBtn, els.mapsSuggestDropdown);

    const tripsCard = document.createElement('div');
    tripsCard.className = 'maps-glass-card';
    tripsCard.id = 'mapsTripsCard';
    tripsCard.style.display = 'none';
    tripsCard.innerHTML = `<div class="maps-panel-title">Trips</div><div id="mapsTripsList"></div>`;
    els.mapsListCard.parentElement.insertBefore(tripsCard, els.mapsListCard);
    els.mapsTripsCard = tripsCard;
    els.mapsTripsList = document.getElementById('mapsTripsList');

    toggleBtn.addEventListener('click', async () => {
      const showing = tripsCard.style.display !== 'none';
      if (showing) { tripsCard.style.display = 'none'; showList(); return; }
      els.mapsListCard.style.display = 'none';
      els.mapsDetailCard.style.display = 'none';
      tripsCard.style.display = '';
      await loadTrips();
    });
  }

  async function loadTrips() {
    if (!currentUser) {
      els.mapsTripsList.innerHTML = `<div class="maps-signin-notice">Sign in to plan trips.</div>`;
      return;
    }
    const { data: mine } = await sb.from('maps_trips').select('*').eq('user_id', currentUser.id);
    const { data: collabRows } = await sb.from('maps_trip_collaborators').select('trip_id').eq('user_id', currentUser.id);
    const collabIds = (collabRows || []).map(r => r.trip_id);
    let collabTrips = [];
    if (collabIds.length) {
      const { data } = await sb.from('maps_trips').select('*').in('id', collabIds);
      collabTrips = data || [];
    }
    allTrips = [...(mine || []), ...collabTrips];
    renderTripsList();
  }

  function renderTripsList() {
    const newBtn = `<div class="maps-saved-item" id="newTripBtn"><div class="maps-saved-icon">➕</div><div class="maps-saved-info"><div class="maps-saved-name">New trip</div></div></div>`;
    if (!allTrips.length) {
      els.mapsTripsList.innerHTML = newBtn + `<div class="maps-empty">No trips yet.</div>`;
    } else {
      els.mapsTripsList.innerHTML = newBtn + allTrips.map(t => `
        <div class="maps-saved-item" data-trip-id="${t.id}">
          <div class="maps-saved-icon">🧳</div>
          <div class="maps-saved-info"><div class="maps-saved-name">${escHtml(t.title)}</div>
          <div class="maps-saved-sub">${t.is_public_editable ? '🌐 anyone can edit' : ''}</div></div>
        </div>`).join('');
    }
    document.getElementById('newTripBtn').addEventListener('click', createTrip);
    els.mapsTripsList.querySelectorAll('[data-trip-id]').forEach(el => {
      el.addEventListener('click', () => openTrip(el.dataset.tripId));
    });
  }

  async function createTrip() {
    if (!currentUser) return;
    const title = prompt('Trip name:', 'My trip');
    if (!title) return;
    const { data, error } = await sb.from('maps_trips').insert({ user_id: currentUser.id, title }).select().single();
    if (error) { setError(error.message); return; }
    showToastLocal('✅ Trip created.');
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
    (stops || []).forEach((s, i) => {
      const m = L.marker([s.lat, s.lng]).addTo(map).bindTooltip(`${i+1}. ${s.name}`, { permanent: false });
      tripStopMarkers.push(m);
    });
    if (stops?.length) map.fitBounds(L.latLngBounds(stops.map(s => [s.lat, s.lng])), { padding: [50, 50] });

    els.mapsTripsList.innerHTML = `
      <div class="maps-back-row"><button class="maps-btn-text" id="tripBackBtn">← All trips</button></div>
      <div class="maps-detail-title">${escHtml(trip.title)}</div>
      <div class="maps-detail-coords">${(stops||[]).length} stop${(stops||[]).length===1?'':'s'}${editable ? ' · you can edit' : ''}</div>
      <div class="maps-detail-actions" style="margin-bottom:10px;">
        ${editable ? `<button class="maps-btn" id="addStopBtn">＋ Add current pin</button>` : ''}
        <button class="maps-btn-outline" id="shareTripBtn">🔗 Share</button>
        ${(stops||[]).length >= 2 ? `<button class="maps-btn-outline" id="routeTripBtn">Route</button>` : ''}
        ${isOwner ? `<button class="maps-btn-outline" id="manageTripBtn">⚙️</button>` : ''}
      </div>
      <div class="maps-saved-list">
        ${(stops||[]).map((s, i) => `
          <div class="maps-saved-item">
            <div class="maps-saved-icon">${i+1}</div>
            <div class="maps-saved-info"><div class="maps-saved-name">${escHtml(s.name)}</div><div class="maps-saved-sub">${escHtml(s.notes||'')}</div></div>
            ${editable ? `<button class="maps-saved-del" data-remove-stop="${s.id}">✕</button>` : ''}
          </div>`).join('')}
      </div>`;

    document.getElementById('tripBackBtn').addEventListener('click', () => { activeTrip = null; renderTripsList(); });
    document.getElementById('addStopBtn')?.addEventListener('click', async () => {
      if (!selected) { showToastLocal('Search or click the map to pick a spot first.'); return; }
      await sb.from('maps_trip_stops').insert({ trip_id: id, name: selected.label || selected.address || 'Stop', lat: selected.lat, lng: selected.lng, added_by: currentUser.id, position: (stops||[]).length });
      openTrip(id);
    });
    document.getElementById('shareTripBtn').addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?trip=${trip.share_code}`;
      navigator.clipboard.writeText(url).then(() => showToastLocal('🔗 Trip link copied!')).catch(() => showToastLocal(url));
    });
    document.getElementById('routeTripBtn')?.addEventListener('click', () => routeTripStops(stops));
    document.getElementById('manageTripBtn')?.addEventListener('click', () => manageTrip(trip));
    els.mapsTripsList.querySelectorAll('[data-remove-stop]').forEach(btn => {
      btn.addEventListener('click', async () => { await sb.from('maps_trip_stops').delete().eq('id', btn.dataset.removeStop); openTrip(id); });
    });
  }

  async function routeTripStops(stops) {
    if (!stops || stops.length < 2) return;
    const coords = stops.map(s => `${s.lng},${s.lat}`).join(';');
    try {
      const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
      const data = await res.json();
      if (!data.routes?.length) { setError('No route through these stops.'); return; }
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.geoJSON(data.routes[0].geometry, { style: { color: '#06b6d4', weight: 5, opacity: 0.85 } }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [50, 50] });
    } catch (e) { setError('Routing failed.'); }
  }

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
    showToastLocal('✅ Trip settings updated.');
    openTrip(trip.id);
  }

  async function checkTripDeepLink() {
    const code = new URLSearchParams(location.search).get('trip');
    if (!code) return;
    const { data: trip } = await sb.from('maps_trips').select('*').eq('share_code', code).maybeSingle();
    if (!trip) return;
    els.mapsListCard.style.display = 'none';
    els.mapsTripsCard.style.display = '';
    allTrips = [trip];
    openTrip(trip.id);
  }

  // ── Boot ──
  document.addEventListener('DOMContentLoaded', () => {
    initMap();
    injectTripsUI();
    initAuth().then(checkTripDeepLink);
    checkDeepLink();
  });
})();
