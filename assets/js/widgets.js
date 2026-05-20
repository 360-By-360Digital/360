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
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  async function getWeather(lat, lon, unit) {
    const tempUnit = unit === 'F' ? 'fahrenheit' : 'celsius';
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&temperature_unit=${tempUnit}`;
    const res = await fetch(url);
    const data = await res.json();
    return data?.current?.temperature_2m;
  }

  function applyWidgetStyles(card, header, body, w) {
    const opacity = clamp(Number(w.opacity ?? 0.85), 0.2, 1);
    card.style.background = w.bgColor || `rgba(15,23,42,${opacity})`;
    card.style.color = w.textColor || '#ffffff';
    card.style.borderRadius = `${clamp(Number(w.radius ?? 12), 0, 48)}px`;
    card.style.borderColor = w.borderColor || 'var(--br)';
    body.style.fontSize = `${clamp(Number(w.fontSize ?? 18), 10, 48)}px`;
    if ((w.shape || 'rounded') === 'pill') card.style.borderRadius = '999px';
    if ((w.shape || 'rounded') === 'square') card.style.borderRadius = '0px';
    header.style.background = w.headerColor || 'rgba(59,130,246,.35)';
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
        card.style.width = `${clamp(Number(w.width || 220), 140, 600)}px`;
        card.style.height = `${clamp(Number(w.height || 130), 80, 500)}px`;

        const header = document.createElement('div');
        header.className = 'home-widget-header';
        header.textContent = w.title || TYPES[w.type]?.label || 'Widget';

        const body = document.createElement('div');
        body.className = 'home-widget-body';
        card.append(header, body);
        applyWidgetStyles(card, header, body, w);
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
    const fields = {
      type: document.getElementById('widgetType'),
      title: document.getElementById('widgetTitle'),
      width: document.getElementById('widgetWidth'),
      height: document.getElementById('widgetHeight'),
      text: document.getElementById('widgetText'),
      unit: document.getElementById('widgetUnit'),
      timezone: document.getElementById('widgetTimezone'),
      locale: document.getElementById('widgetLocale'),
      shape: document.getElementById('widgetShape'),
      bgColor: document.getElementById('widgetBgColor'),
      headerColor: document.getElementById('widgetHeaderColor'),
      textColor: document.getElementById('widgetTextColor'),
      borderColor: document.getElementById('widgetBorderColor'),
      radius: document.getElementById('widgetRadius'),
      fontSize: document.getElementById('widgetFontSize'),
      opacity: document.getElementById('widgetOpacity')
    };
    let widgets = loadWidgets();

    function refresh() {
      list.innerHTML = widgets.map(w => `
      <div class="st-row">
        <div>
          <div class="st-row-label">${w.title || w.type}</div>
          <div class="st-row-sub">${w.type} • ${w.width}x${w.height} • ${(w.shape||'rounded')}</div>
        </div>
        <div class="st-row-right">
          <button class="st-btn" data-act="dup" data-id="${w.id}">Duplicate</button>
          <button class="st-btn" data-act="del" data-id="${w.id}">Delete</button>
        </div>
      </div>`).join('') || '<div class="st-row-sub">No widgets yet.</div>';
      saveWidgets(widgets);
    }

    list.addEventListener('click', e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const { act, id } = btn.dataset;
      if (act === 'del') widgets = widgets.filter(w => w.id !== id);
      if (act === 'dup') {
        const src = widgets.find(w => w.id === id);
        if (src) widgets.push({ ...src, id: uid(), title: `${src.title || src.type} Copy`, x: (src.x || 20) + 20, y: (src.y || 20) + 20 });
      }
      refresh();
    });

    form.addEventListener('submit', e => {
      e.preventDefault();
      widgets.push({
        id: uid(),
        type: fields.type.value,
        title: fields.title.value.trim() || TYPES[fields.type.value].label,
        width: clamp(Number(fields.width.value) || 220, 140, 600),
        height: clamp(Number(fields.height.value) || 130, 80, 500),
        text: fields.text.value.trim(),
        unit: fields.unit.value,
        timezone: fields.timezone.value.trim(),
        locale: fields.locale.value.trim(),
        shape: fields.shape.value,
        bgColor: fields.bgColor.value,
        headerColor: fields.headerColor.value,
        textColor: fields.textColor.value,
        borderColor: fields.borderColor.value,
        radius: clamp(Number(fields.radius.value) || 12, 0, 48),
        fontSize: clamp(Number(fields.fontSize.value) || 18, 10, 48),
        opacity: clamp(Number(fields.opacity.value) || 0.85, 0.2, 1),
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
