(function () {
  const STORAGE_KEY = '360_widgets_v1';
  const TYPES = {
    weather: { label: 'Weather' },
    time: { label: 'Time' },
    note: { label: 'Note' }
  };

  function loadWidgets() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
  }
  function saveWidgets(w) { localStorage.setItem(STORAGE_KEY, JSON.stringify(w)); }
  function uid() { return `w_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

  async function getWeather(lat, lon, unit) {
    const tempUnit = unit === 'F' ? 'fahrenheit' : 'celsius';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&temperature_unit=${tempUnit}`;
    const res = await fetch(url);
    const data = await res.json();
    return data?.current?.temperature_2m;
  }

  function startIndexMode() {
    const host = document.getElementById('widgetBoard');
    if (!host) return;
    let widgets = loadWidgets();

    function render() {
      host.innerHTML = '';
      widgets.forEach(w => {
        const card = document.createElement('section');
        card.className = 'home-widget';
        card.dataset.id = w.id;
        card.style.left = (w.x || 20) + 'px';
        card.style.top = (w.y || 20) + 'px';
        card.style.width = (w.width || 220) + 'px';
        card.style.height = (w.height || 130) + 'px';

        const header = document.createElement('div');
        header.className = 'home-widget-header';
        header.textContent = w.title || TYPES[w.type]?.label || 'Widget';

        const body = document.createElement('div');
        body.className = 'home-widget-body';
        card.append(header, body);
        host.appendChild(card);

        if (w.type === 'time') {
          const locale = w.locale || undefined;
          const tz = w.timezone || undefined;
          const f = () => { body.textContent = new Date().toLocaleTimeString(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
          f();
          setInterval(f, 1000);
        } else if (w.type === 'note') {
          body.textContent = w.text || 'Empty note';
        } else if (w.type === 'weather') {
          body.textContent = 'Loading weather…';
          const unit = w.unit || 'C';
          const setFallback = () => body.textContent = 'Weather unavailable';
          if (!navigator.geolocation) setFallback();
          else navigator.geolocation.getCurrentPosition(async pos => {
            try {
              const t = await getWeather(pos.coords.latitude, pos.coords.longitude, unit);
              body.textContent = t == null ? 'Weather unavailable' : `${Math.round(t)}°${unit}`;
            } catch { setFallback(); }
          }, setFallback);
        }

        makeDraggable(card, w);
      });
    }

    function makeDraggable(el, widget) {
      const header = el.querySelector('.home-widget-header');
      let sx=0, sy=0, ox=0, oy=0, dragging=false;
      header.addEventListener('pointerdown', e => {
        dragging = true;
        sx = e.clientX; sy = e.clientY;
        ox = widget.x || 20; oy = widget.y || 20;
        el.setPointerCapture(e.pointerId);
      });
      header.addEventListener('pointermove', e => {
        if (!dragging) return;
        widget.x = Math.max(0, ox + e.clientX - sx);
        widget.y = Math.max(0, oy + e.clientY - sy);
        el.style.left = widget.x + 'px';
        el.style.top = widget.y + 'px';
      });
      header.addEventListener('pointerup', () => {
        dragging = false;
        saveWidgets(widgets);
      });
    }

    render();
  }

  function startSettingsMode() {
    const list = document.getElementById('widgetList');
    if (!list) return;
    const form = document.getElementById('widgetForm');
    const type = document.getElementById('widgetType');
    const title = document.getElementById('widgetTitle');
    const width = document.getElementById('widgetWidth');
    const height = document.getElementById('widgetHeight');
    const noteText = document.getElementById('widgetText');
    const unit = document.getElementById('widgetUnit');
    const timezone = document.getElementById('widgetTimezone');
    const locale = document.getElementById('widgetLocale');
    let widgets = loadWidgets();

    function refresh() {
      list.innerHTML = widgets.map(w => `<div class="st-row"><div><div class="st-row-label">${w.title || w.type}</div><div class="st-row-sub">${w.type} • ${w.width}x${w.height}</div></div><div class="st-row-right"><button class="st-btn" data-act="del" data-id="${w.id}">Delete</button></div></div>`).join('') || '<div class="st-row-sub">No widgets yet.</div>';
      saveWidgets(widgets);
    }

    list.addEventListener('click', e => {
      const btn = e.target.closest('button[data-act="del"]');
      if (!btn) return;
      widgets = widgets.filter(w => w.id !== btn.dataset.id);
      refresh();
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      widgets.push({
        id: uid(),
        type: type.value,
        title: title.value.trim() || TYPES[type.value].label,
        width: Number(width.value) || 220,
        height: Number(height.value) || 130,
        text: noteText.value.trim(),
        unit: unit.value,
        timezone: timezone.value.trim(),
        locale: locale.value.trim(),
        x: 20,
        y: 20
      });
      form.reset();
      refresh();
    });
    refresh();
  }

  document.addEventListener('DOMContentLoaded', () => {
    startIndexMode();
    startSettingsMode();
  });
})();
