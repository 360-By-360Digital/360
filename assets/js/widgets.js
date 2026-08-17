/* ══════════════════════════════════════════════════════════════
   360 — WIDGETS.JS  v2.0
   Homepage draggable widget board + Settings form controller.
   Widget types: clock · weather · note · stocks · countdown · quote · news
══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Storage ───────────────────────────────────────────────── */
  const STORAGE_KEY = '360_widgets_v2';

  function loadWidgets() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }
  function saveWidgets(w) { localStorage.setItem(STORAGE_KEY, JSON.stringify(w)); }
  function uid() { return `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }

  function octicon(name) {
    return window.Octicons?.icon ? window.Octicons.icon(name) : '';
  }

  /* ── Widget type registry ──────────────────────────────────── */
  const WIDGET_TYPES = {
    clock:     { label: 'Clock',     icon: 'clock', color: '#8b5cf6', defaultW: 240, defaultH: 165 },
    weather:   { label: 'Weather',   icon: 'cloud', color: '#06b6d4', defaultW: 260, defaultH: 190 },
    note:      { label: 'Note',      icon: 'pencil', color: '#f59e0b', defaultW: 240, defaultH: 200 },
    stocks:    { label: 'Stocks',    icon: 'graph', color: '#10b981', defaultW: 270, defaultH: 228 },
    countdown: { label: 'Countdown', icon: 'hourglass', color: '#f43f5e', defaultW: 280, defaultH: 165 },
    quote:     { label: 'Quote',     icon: 'comment-discussion', color: '#3b82f6', defaultW: 270, defaultH: 175 },
    news:      { label: 'News',      icon: 'newspaper', color: '#f97316', defaultW: 280, defaultH: 280 },
    // Legacy alias
    time:      { label: 'Clock',     icon: 'clock', color: '#8b5cf6', defaultW: 240, defaultH: 165 },
  };

  /* ── Weather helpers ───────────────────────────────────────── */
  const WMO_ICONS = {
    0:'sun',1:'sun',2:'cloud',3:'cloud',45:'cloud',48:'cloud',
    51:'cloud',53:'cloud',55:'cloud',61:'cloud',63:'cloud',65:'cloud',
    71:'cloud',73:'cloud',75:'cloud',80:'cloud',81:'cloud',82:'alert',
    95:'alert',96:'alert',99:'alert'
  };
  const WMO_DESC = {
    0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
    45:'Foggy',48:'Icy fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
    61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',
    75:'Heavy snow',80:'Rain showers',81:'Heavy showers',82:'Violent showers',
    95:'Thunderstorm',96:'Thunderstorm + hail',99:'Thunderstorm + heavy hail'
  };

  async function fetchWeather(lat, lon, unit) {
    const tu = unit === 'F' ? 'fahrenheit' : 'celsius';
    const [wRes, gRes] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,windspeed_10m,relative_humidity_2m&temperature_unit=${tu}&wind_speed_unit=mph`),
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`)
    ]);
    const w = await wRes.json(), g = await gRes.json();
    const cur = w.current, code = cur.weathercode;
    return {
      temp: Math.round(cur.temperature_2m),
      unit,
      icon: WMO_ICONS[code] || 'meter',
      desc: WMO_DESC[code]  || 'Unknown',
      city: g.address?.city || g.address?.town || g.address?.village || 'Your location',
      wind: Math.round(cur.windspeed_10m),
      humidity: cur.relative_humidity_2m
    };
  }

  /* ── Mock stocks ───────────────────────────────────────────── */
  const BASE_STOCKS = [
    { symbol: 'AAPL',  name: 'Apple',     price: 213.49, change: +1.23 },
    { symbol: 'GOOGL', name: 'Google',    price: 178.22, change: -0.87 },
    { symbol: 'MSFT',  name: 'Microsoft', price: 425.52, change: +2.15 },
    { symbol: 'TSLA',  name: 'Tesla',     price: 248.91, change: -3.41 },
    { symbol: 'AMZN',  name: 'Amazon',    price: 202.60, change: +1.05 },
  ];

  /* ── Quotes ────────────────────────────────────────────────── */
  const QUOTES = [
    { text: 'The secret of getting ahead is getting started.',         author: 'Mark Twain' },
    { text: 'It does not matter how slowly you go — just don\'t stop.', author: 'Confucius' },
    { text: 'Build. Break. Learn. Repeat.',                            author: 'Unknown' },
    { text: 'Code is like humor. When you have to explain it, it\'s bad.', author: 'Cory House' },
    { text: 'Simplicity is the soul of efficiency.',                   author: 'Austin Freeman' },
    { text: 'Make it work, make it right, make it fast.',              author: 'Kent Beck' },
    { text: 'Stay focused and never stop.',                            author: '360 Digital' },
    { text: 'Every expert was once a beginner.',                       author: 'Helen Hayes' },
    { text: 'Dream big. Start small. Act now.',                        author: 'Robin Sharma' },
    { text: 'Progress, not perfection.',                               author: 'Unknown' },
    { text: 'Act as if what you do makes a difference. It does.',      author: 'William James' },
    { text: 'The best way to predict the future is to create it.',     author: 'Peter Drucker' },
  ];

  /* ── News fetch ────────────────────────────────────────────── */
  const FALLBACK_NEWS = [
    'Global markets react to latest economic data',
    'Tech giants report strong quarterly earnings',
    'New climate policy proposals announced at summit',
    'Scientists make breakthrough in renewable energy',
    'Sports: Record-breaking performances this season',
  ];

  async function fetchNews() {
    const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent('https://feeds.bbci.co.uk/news/rss.xml')}&count=5`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.items?.length) throw new Error('empty');
    return data.items;
  }

  /* ═══════════════════════════════════════════════════════════
     INDEX MODE — renders widgets on the homepage
  ═══════════════════════════════════════════════════════════ */
  function startIndexMode() {
    const host = document.getElementById('widgetBoard');
    if (!host) return;
    let widgets = loadWidgets();

    function renderAll() {
      host.innerHTML = '';
      widgets.forEach(w => renderWidget(w));
    }

    function renderWidget(w) {
      const def = WIDGET_TYPES[w.type] || WIDGET_TYPES.note;

      const card = document.createElement('section');
      card.className  = 'home-widget';
      card.dataset.id = w.id;
      card.dataset.type = w.type;
      card.style.cssText = [
        `left:${w.x ?? 20}px`,
        `top:${w.y ?? 80}px`,
        `width:${w.width  || def.defaultW}px`,
        `height:${w.height || def.defaultH}px`,
        `--widget-accent:${def.color}`,
      ].join(';');

      /* Header */
      const header = document.createElement('div');
      header.className = 'home-widget-header';
      header.innerHTML = `
        <span class="home-widget-icon">${octicon(def.icon)}</span>
        <span class="home-widget-title">${w.title || def.label}</span>
        <button class="home-widget-close" title="Remove widget">${octicon('x-circle')}</button>
      `;

      /* Body */
      const body = document.createElement('div');
      body.className = 'home-widget-body';

      /* Resize handle */
      const resizer = document.createElement('div');
      resizer.className = 'home-widget-resizer';

      card.append(header, body, resizer);
      host.appendChild(card);

      /* Close */
      header.querySelector('.home-widget-close').addEventListener('click', e => {
        e.stopPropagation();
        card.style.animation = 'widgetVanish 0.22s ease forwards';
        card.addEventListener('animationend', () => {
          widgets = widgets.filter(ww => ww.id !== w.id);
          saveWidgets(widgets);
          card.remove();
        }, { once: true });
      });

      /* Content */
      populateWidget(w, body);

      /* Interactions */
      makeDraggable(card, header, w, widgets);
      makeResizable(card, resizer, w, def, widgets);
    }

    renderAll();
  }

  /* ── Widget content dispatchers ────────────────────────────── */
  function populateWidget(w, body) {
    switch (w.type) {
      case 'clock':
      case 'time':      initClock(body, w);     break;
      case 'weather':   initWeather(body, w);   break;
      case 'note':      initNote(body, w);       break;
      case 'stocks':    initStocks(body, w);     break;
      case 'countdown': initCountdown(body, w); break;
      case 'quote':     initQuote(body, w);      break;
      case 'news':      initNews(body, w);       break;
      default: body.textContent = 'Unknown widget type';
    }
  }

  /* ── Clock ─────────────────────────────────────────────────── */
  function initClock(body, w) {
    body.innerHTML = `
      <div class="wg-clock-time">--:--:--</div>
      <div class="wg-clock-date"></div>
      <div class="wg-clock-greeting"></div>
    `;
    const timeEl  = body.querySelector('.wg-clock-time');
    const dateEl  = body.querySelector('.wg-clock-date');
    const greetEl = body.querySelector('.wg-clock-greeting');
    const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const locale = w.locale    || undefined;
    const tz     = w.timezone  || undefined;
    function tick() {
      const now  = new Date();
      timeEl.textContent = now.toLocaleTimeString(locale, { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const d   = tz ? new Date(now.toLocaleString('en-US', { timeZone: tz })) : now;
      dateEl.textContent  = `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
      const h   = d.getHours();
      greetEl.textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
    }
    tick();
    const iv = setInterval(tick, 1000);
    new MutationObserver((_, obs) => {
      if (!document.body.contains(body)) { clearInterval(iv); obs.disconnect(); }
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ── Weather ───────────────────────────────────────────────── */
  function initWeather(body, w) {
    body.innerHTML = `<div class="wg-weather-loading">${octicon('location')} Fetching weather…</div>`;
    const unit = w.unit || localStorage.getItem('tempUnit') || 'C';
    if (!navigator.geolocation) {
      body.innerHTML = `<div class="wg-weather-err">Geolocation unavailable</div>`;
      return;
    }
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const d = await fetchWeather(pos.coords.latitude, pos.coords.longitude, unit);
        body.innerHTML = `
          <div class="wg-weather-main">
            <span class="wg-weather-icon">${octicon(d.icon)}</span>
            <div>
              <div class="wg-weather-temp">${d.temp}°${d.unit}</div>
              <div class="wg-weather-desc">${d.desc}</div>
            </div>
          </div>
          <div class="wg-weather-loc">${octicon('location')} ${d.city}</div>
          <div class="wg-weather-extra">Humidity ${d.humidity}%&nbsp;&nbsp;Wind ${d.wind} mph</div>
        `;
      } catch { body.innerHTML = `<div class="wg-weather-err">Weather unavailable</div>`; }
    }, () => { body.innerHTML = `<div class="wg-weather-err">Location denied</div>`; });
  }

  /* ── Note ──────────────────────────────────────────────────── */
  function initNote(body, w) {
    const key   = `360_widget_note_${w.id}`;
    const saved = localStorage.getItem(key) ?? w.text ?? '';
    body.style.padding = '0';
    body.innerHTML = `<textarea class="wg-note-area" placeholder="Type a note…" maxlength="600">${saved}</textarea>`;
    const ta = body.querySelector('.wg-note-area');
    let debounce;
    ta.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => localStorage.setItem(key, ta.value), 400);
    });
  }

  /* ── Stocks ────────────────────────────────────────────────── */
  function initStocks(body, w) {
    const stocks = BASE_STOCKS.map(s => ({
      ...s,
      price:  +(s.price  + (Math.random() - 0.5) * 2.4).toFixed(2),
      change: +(s.change + (Math.random() - 0.5) * 0.6).toFixed(2),
    }));
    body.innerHTML = `
      <div class="wg-stocks-header">
        <span>Symbol</span><span>Price</span><span>Chg</span>
      </div>
      ${stocks.map(s => {
        const up = s.change >= 0;
        return `<div class="wg-stock-row">
          <span class="wg-stock-sym">${s.symbol}</span>
          <span class="wg-stock-name">${s.name}</span>
          <span class="wg-stock-price">$${s.price.toFixed(2)}</span>
          <span class="wg-stock-change ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(s.change).toFixed(2)}</span>
        </div>`;
      }).join('')}
      <div class="wg-stocks-note">Simulated · updates every 30s</div>
    `;
    const iv = setInterval(() => {
      if (!document.querySelector(`[data-id="${w.id}"]`)) { clearInterval(iv); return; }
      initStocks(body, w);
    }, 30000);
  }

  /* ── Countdown ─────────────────────────────────────────────── */
  function initCountdown(body, w) {
    if (!w.targetDate) {
      body.innerHTML = `<div class="wg-cd-none">No date set.<br><small>Configure in Widget Settings.</small></div>`;
      return;
    }
    const eventName = w.eventName || 'Event';
    body.innerHTML = `
      <div class="wg-cd-event">${eventName}</div>
      <div class="wg-cd-display">
        <div class="wg-cd-block"><span class="wg-cd-num" id="cd-d-${w.id}">-</span><span class="wg-cd-label">days</span></div>
        <div class="wg-cd-sep">:</div>
        <div class="wg-cd-block"><span class="wg-cd-num" id="cd-h-${w.id}">-</span><span class="wg-cd-label">hrs</span></div>
        <div class="wg-cd-sep">:</div>
        <div class="wg-cd-block"><span class="wg-cd-num" id="cd-m-${w.id}">-</span><span class="wg-cd-label">min</span></div>
        <div class="wg-cd-sep">:</div>
        <div class="wg-cd-block"><span class="wg-cd-num" id="cd-s-${w.id}">-</span><span class="wg-cd-label">sec</span></div>
      </div>
    `;
    function tick() {
      const diff = new Date(w.targetDate) - new Date();
      if (diff <= 0) {
        body.querySelector('.wg-cd-display').innerHTML = `<div class="wg-cd-done">${octicon('check-circle')} It's here!</div>`;
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000)  / 60000);
      const s = Math.floor((diff % 60000)    / 1000);
      const nd = document.getElementById(`cd-d-${w.id}`);
      const nh = document.getElementById(`cd-h-${w.id}`);
      const nm = document.getElementById(`cd-m-${w.id}`);
      const ns = document.getElementById(`cd-s-${w.id}`);
      if (nd) nd.textContent = d;
      if (nh) nh.textContent = String(h).padStart(2,'0');
      if (nm) nm.textContent = String(m).padStart(2,'0');
      if (ns) ns.textContent = String(s).padStart(2,'0');
    }
    tick();
    const iv = setInterval(() => {
      if (!document.querySelector(`[data-id="${w.id}"]`)) { clearInterval(iv); return; }
      tick();
    }, 1000);
  }

  /* ── Quote ─────────────────────────────────────────────────── */
  function initQuote(body) {
    const idx = new Date().getDate() % QUOTES.length;
    const q   = QUOTES[idx];
    body.innerHTML = `
      <div class="wg-quote-mark">"</div>
      <div class="wg-quote-text">${q.text}</div>
      <div class="wg-quote-author">— ${q.author}</div>
    `;
  }

  /* ── News ──────────────────────────────────────────────────── */
  async function initNews(body) {
    body.innerHTML = `<div class="wg-news-loading">${octicon('newspaper')} Loading headlines…</div>`;
    try {
      const items = await fetchNews();
      body.innerHTML = items.map(item => `
        <a class="wg-news-item" href="${item.link}" target="_blank" rel="noopener noreferrer">
          <div class="wg-news-headline">${item.title}</div>
          <div class="wg-news-meta">${new Date(item.pubDate).toLocaleDateString()}</div>
        </a>
      `).join('');
    } catch {
      body.innerHTML = FALLBACK_NEWS.map(t => `
        <div class="wg-news-item">
          <div class="wg-news-headline">${t}</div>
          <div class="wg-news-meta">Today</div>
        </div>
      `).join('');
    }
  }

  /* ═══════════════════════════════════════════════════════════
     DRAG & RESIZE
  ═══════════════════════════════════════════════════════════ */
  function makeDraggable(card, header, widget, allWidgets) {
    let sx=0, sy=0, ox=0, oy=0, dragging=false;
    header.addEventListener('pointerdown', e => {
      if (e.target.classList.contains('home-widget-close')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      ox = widget.x ?? 20; oy = widget.y ?? 80;
      header.style.cursor = 'grabbing';
      card.style.zIndex   = '20';
      header.setPointerCapture(e.pointerId);
    });
    header.addEventListener('pointermove', e => {
      if (!dragging) return;
      widget.x = Math.max(0, ox + e.clientX - sx);
      widget.y = Math.max(0, oy + e.clientY - sy);
      card.style.left = `${widget.x}px`;
      card.style.top  = `${widget.y}px`;
    });
    header.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      header.style.cursor = '';
      card.style.zIndex   = '';
      saveWidgets(allWidgets);
    });
  }

  function makeResizable(card, handle, widget, def, allWidgets) {
    const MIN_W = Math.min(def.defaultW * 0.65, 160);
    const MIN_H = Math.min(def.defaultH * 0.65, 100);
    let sx=0, sy=0, ow=0, oh=0, resizing=false;
    handle.addEventListener('pointerdown', e => {
      resizing = true;
      sx = e.clientX; sy = e.clientY;
      ow = widget.width  || def.defaultW;
      oh = widget.height || def.defaultH;
      handle.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });
    handle.addEventListener('pointermove', e => {
      if (!resizing) return;
      widget.width  = Math.max(MIN_W, ow + (e.clientX - sx));
      widget.height = Math.max(MIN_H, oh + (e.clientY - sy));
      card.style.width  = `${widget.width}px`;
      card.style.height = `${widget.height}px`;
    });
    handle.addEventListener('pointerup', () => {
      if (!resizing) return;
      resizing = false;
      saveWidgets(allWidgets);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     SETTINGS MODE — widget management form in settings.html
  ═══════════════════════════════════════════════════════════ */
  function startSettingsMode() {
    const list = document.getElementById('widgetList');
    if (!list) return;

    let widgets     = loadWidgets();
    let selectedType = 'clock';

    /* ── Type buttons ── */
    const typeButtons = document.querySelectorAll('[data-widget-type]');
    typeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        typeButtons.forEach(b => b.classList.remove('wf-type-active'));
        btn.classList.add('wf-type-active');
        selectedType = btn.dataset.widgetType;
        updateFields(selectedType);
      });
    });

    function updateFields(type) {
      const show = id => { const el = document.getElementById(id); if (el) el.style.display = ''; };
      const hide = id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };
      ['wf-note-fields', 'wf-weather-fields', 'wf-clock-fields', 'wf-countdown-fields']
        .forEach(hide);
      if (type === 'note')                    show('wf-note-fields');
      if (type === 'weather')                 show('wf-weather-fields');
      if (type === 'clock' || type === 'time') show('wf-clock-fields');
      if (type === 'countdown')               show('wf-countdown-fields');
    }

    /* ── Form submission ── */
    const form = document.getElementById('widgetForm');
    if (form) {
      form.addEventListener('submit', e => {
        e.preventDefault();
        const def = WIDGET_TYPES[selectedType] || WIDGET_TYPES.note;
        const g   = id => document.getElementById(id);
        const v   = id => g(id)?.value.trim() ?? '';

        /* Stagger spawn positions so they don't pile on top */
        const offset = (widgets.length % 8) * 22;

        widgets.push({
          id:         uid(),
          type:       selectedType,
          title:      v('wf-title') || def.label,
          width:      def.defaultW,
          height:     def.defaultH,
          text:       v('wf-note-text'),
          unit:       g('wf-unit')?.value || 'C',
          timezone:   v('wf-timezone'),
          locale:     v('wf-locale'),
          targetDate: v('wf-countdown-date') || null,
          eventName:  v('wf-countdown-event') || 'Event',
          x: 20 + offset,
          y: 80 + offset,
        });

        saveWidgets(widgets);
        form.reset();

        /* Reset type selector to clock */
        typeButtons.forEach(b => b.classList.remove('wf-type-active'));
        document.querySelector('[data-widget-type="clock"]')?.classList.add('wf-type-active');
        selectedType = 'clock';
        updateFields('clock');

        refresh();
        showToast('Widget added — drag it around on the homepage!');
      });
    }

    /* ── Widget list ── */
    function refresh() {
      if (!widgets.length) {
        list.innerHTML = `<div class="wf-empty">No widgets yet — add one above.</div>`;
        return;
      }
      list.innerHTML = widgets.map(w => {
        const def = WIDGET_TYPES[w.type] || WIDGET_TYPES.note;
        return `<div class="wf-widget-row" data-id="${w.id}">
          <span class="wf-row-icon">${def.icon}</span>
          <div class="wf-row-info">
            <div class="wf-row-name">${w.title || def.label}</div>
            <div class="wf-row-meta">${def.label} · ${w.width}×${w.height}px</div>
          </div>
          <button class="wf-del-btn" data-id="${w.id}" title="Delete widget">${octicon('trash')}</button>
        </div>`;
      }).join('');

      list.querySelectorAll('.wf-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          widgets = widgets.filter(w => w.id !== btn.dataset.id);
          saveWidgets(widgets);
          refresh();
          showToast('Widget removed.');
        });
      });
    }

    /* ── Toast ── */
    function showToast(msg) {
      let toast = document.getElementById('wf-toast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'wf-toast';
        Object.assign(toast.style, {
          position: 'fixed', bottom: '28px', left: '50%',
          transform: 'translateX(-50%) translateY(20px)',
          background: 'linear-gradient(120deg,#3b82f6,#8b5cf6)',
          color: '#fff', padding: '12px 24px',
          borderRadius: '999px', fontSize: '14px', fontWeight: '600',
          zIndex: '9999', opacity: '0',
          transition: 'opacity .25s,transform .25s',
          boxShadow: '0 8px 28px rgba(0,0,0,.35)',
          pointerEvents: 'none',
          fontFamily: '"Segoe UI",system-ui,sans-serif',
        });
        document.body.appendChild(toast);
      }
      toast.textContent = msg;
      requestAnimationFrame(() => {
        toast.style.opacity   = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
      });
      clearTimeout(toast._hide);
      toast._hide = setTimeout(() => {
        toast.style.opacity   = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
      }, 2800);
    }

    /* ── Init ── */
    document.querySelector('[data-widget-type="clock"]')?.classList.add('wf-type-active');
    updateFields('clock');
    refresh();
  }

  /* ═══════════════════════════════════════════════════════════
     BOOT
  ═══════════════════════════════════════════════════════════ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  function boot() {
    startIndexMode();
    startSettingsMode();
  }
})();
