/* ========================================================
   360 Maps — v3.0.0 client logic
   Built on Leaflet + OpenStreetMap + Nominatim + OSRM.
   No API keys, no per-request billing, no tracking sent to a
   third-party map vendor -- that's the actual differentiator
   here, not trying to out-feature Google's satellite imagery.
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
  }

  // ── Search (Nominatim, debounced autocomplete) ──
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

  // ── Directions (OSRM public demo router -- free, no key) ──
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
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${myPosition[1]},${myPosition[0]};${selected.lng},${selected.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      setStatus('');
      if (!data.routes?.length) { setError('No route found.'); return; }
      const route = data.routes[0];
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.geoJSON(route.geometry, { style: { color: '#3b82f6', weight: 5, opacity: 0.85 } }).addTo(map);
      map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });

      const km = (route.distance / 1000).toFixed(1);
      const mins = Math.round(route.duration / 60);
      els.mapsDirectionsDistance.textContent = `${km} km`;
      els.mapsDirectionsDuration.textContent = mins < 60 ? `${mins} min` : `${Math.floor(mins/60)}h ${mins%60}m`;
      els.mapsDirectionsBox.style.display = '';
    } catch (e) {
      setStatus(''); setError('Directions failed — check your connection.');
    }
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

  // ── Boot ──
  document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initAuth();
    checkDeepLink();
  });
})();
