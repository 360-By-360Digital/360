/* ============================================================
   360 STOCKS — stocks.js
   Talks to the `stock-data` Supabase edge function (no API key
   needed client-side; the function proxies public market data
   server-side to avoid CORS).
   ============================================================ */

(function () {
  const FN_BASE = "https://wiswfpfsjiowtrdyqpxy.supabase.co/functions/v1/stock-data";

  const $ = (s) => document.querySelector(s);
  const els = {
    searchInput: $("#stockSearchInput"),
    searchResults: $("#stockSearchResults"),
    watchlistChips: $("#watchlistChips"),
    loading: $("#stocksLoading"),
    error: $("#stocksError"),
    grid: $("#stocksGrid"),
    qCompany: $("#qCompany"),
    qSymbol: $("#qSymbol"),
    qPrice: $("#qPrice"),
    qChange: $("#qChange"),
    rangeBtns: $("#rangeBtns"),
    statsGrid: $("#statsGrid"),
    outlookBadge: $("#outlookBadge"),
    gaugeDot: $("#gaugeDot"),
    signalsList: $("#signalsList"),
    analystGrid: $("#analystGrid"),
  };

  let currentSymbol = "AAPL";
  let currentRange = "6mo";
  let chartInstance = null;
  let searchDebounce = null;

  const PREF_SYMBOL_KEY = "stocksSymbol";
  const PREF_RANGE_KEY = "stocksRange";

  function fmtNum(n, opts = {}) {
    if (n === null || n === undefined || Number.isNaN(n)) return "—";
    return Number(n).toLocaleString(undefined, opts);
  }

  function fmtCompact(n) {
    if (n === null || n === undefined) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
    if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
    if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
    return fmtNum(n);
  }

  function fmtPct(n, alreadyPct = false) {
    if (n === null || n === undefined) return "—";
    const v = alreadyPct ? n : n * 100;
    return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
  }

  function setLoading(isLoading) {
    els.loading.style.display = isLoading ? "block" : "none";
    if (isLoading) {
      els.error.style.display = "none";
      els.grid.classList.remove("visible");
    }
  }

  function setError(msg) {
    els.error.textContent = msg;
    els.error.style.display = "block";
    els.loading.style.display = "none";
    els.grid.classList.remove("visible");
  }

  async function fetchStock(symbol, range) {
    const url = `${FN_BASE}?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!resp.ok || data.error) throw new Error(data.error || "Failed to load stock data");
    return data;
  }

  async function fetchSearch(q) {
    const url = `${FN_BASE}?action=search&q=${encodeURIComponent(q)}`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.quotes || [];
  }

  function renderChart(series, range) {
    const ctx = document.getElementById("priceChart");
    const labels = (series.timestamps || []).map((t) => {
      const d = new Date(t * 1000);
      if (range === "1d" || range === "5d") {
        return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      }
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: range === "5y" || range === "max" ? "2-digit" : undefined });
    });

    const isDark = document.body.classList.contains("dark");
    const gridColor = isDark ? "rgba(255,255,255,.06)" : "rgba(0,0,0,.06)";
    const textColor = isDark ? "#a3a7b3" : "#6b7280";

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Close",
            data: series.closes,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,.08)",
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            tension: 0.15,
            spanGaps: true,
          },
          {
            label: "SMA 20",
            data: series.sma20,
            borderColor: "#f59e0b",
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0.15,
            spanGaps: true,
          },
          {
            label: "SMA 50",
            data: series.sma50,
            borderColor: "#a21caf",
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false,
            tension: 0.15,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { labels: { color: textColor, boxWidth: 12, font: { size: 11 } } },
          tooltip: { mode: "index", intersect: false },
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, maxTicksLimit: 8, font: { size: 10 } } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } },
        },
      },
    });
  }

  function renderStats(d) {
    const rows = [
      ["Day Range", d.dayLow != null && d.dayHigh != null ? `${fmtNum(d.dayLow, { maximumFractionDigits: 2 })} – ${fmtNum(d.dayHigh, { maximumFractionDigits: 2 })}` : "—"],
      ["52-Week Range", d.fiftyTwoWeekLow != null && d.fiftyTwoWeekHigh != null ? `${fmtNum(d.fiftyTwoWeekLow, { maximumFractionDigits: 2 })} – ${fmtNum(d.fiftyTwoWeekHigh, { maximumFractionDigits: 2 })}` : "—"],
      ["Market Cap", fmtCompact(d.marketCap)],
      ["Volume", fmtCompact(d.volume)],
      ["Avg Volume", fmtCompact(d.avgVolume)],
      ["P/E (TTM)", d.peRatio != null ? fmtNum(d.peRatio, { maximumFractionDigits: 2 }) : "—"],
      ["Forward P/E", d.forwardPE != null ? fmtNum(d.forwardPE, { maximumFractionDigits: 2 }) : "—"],
      ["Beta", d.beta != null ? fmtNum(d.beta, { maximumFractionDigits: 2 }) : "—"],
      ["Dividend Yield", d.dividendYield != null ? fmtPct(d.dividendYield) : "—"],
      ["Sector", d.sector || "—"],
      ["Industry", d.industry || "—"],
    ];
    els.statsGrid.innerHTML = rows
      .map(([k, v]) => `<div class="s-stat"><span class="k">${k}</span><span class="v">${v}</span></div>`)
      .join("");
  }

  function renderAnalyst(d) {
    const rows = [
      ["Analyst Rating", d.recommendationKey ? d.recommendationKey.replace(/_/g, " ").toUpperCase() : "—"],
      ["Analyst Target (avg)", d.targetMeanPrice != null ? fmtNum(d.targetMeanPrice, { maximumFractionDigits: 2 }) : "—"],
      ["Revenue Growth (YoY)", d.revenueGrowth != null ? fmtPct(d.revenueGrowth) : "—"],
      ["Profit Margin", d.profitMargins != null ? fmtPct(d.profitMargins) : "—"],
    ];
    els.analystGrid.innerHTML = rows
      .map(([k, v]) => `<div class="s-stat"><span class="k">${k}</span><span class="v">${v}</span></div>`)
      .join("");
  }

  function renderOutlook(t) {
    const label = t.outlookLabel || "Neutral / Mixed";
    let cls = "neutral";
    if (label.includes("Bullish")) cls = "bull";
    else if (label.includes("Bearish")) cls = "bear";

    els.outlookBadge.className = `s-outlook-badge ${cls}`;
    els.outlookBadge.textContent = label;

    // gauge position from -3..3 style score approximated via label; fall back to 50%
    let pct = 50;
    if (cls === "bull") pct = 78;
    else if (cls === "bear") pct = 22;
    els.gaugeDot.style.left = pct + "%";

    els.signalsList.innerHTML = (t.signals || [])
      .map((s) => `<li>${s}</li>`)
      .join("") || "<li>Not enough data to generate signals.</li>";
  }

  function renderQuote(d) {
    els.qCompany.textContent = `${d.companyName} · ${d.exchangeName || ""}`.trim();
    els.qSymbol.textContent = d.symbol;
    els.qPrice.textContent = d.lastClose != null ? fmtNum(d.lastClose, { maximumFractionDigits: 2 }) + (d.currency ? " " + d.currency : "") : "—";
    if (d.changePct != null) {
      const up = d.changePct >= 0;
      els.qChange.textContent = `${up ? "▲" : "▼"} ${fmtPct(d.changePct, true)} today`;
      els.qChange.className = `s-change ${up ? "up" : "down"}`;
    } else {
      els.qChange.textContent = "—";
      els.qChange.className = "s-change";
    }
  }

  function setActiveWatchlistChip(symbol) {
    els.watchlistChips.querySelectorAll(".watchlist-chip").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.symbol === symbol);
    });
  }

  function setActiveRangeBtn(range) {
    els.rangeBtns.querySelectorAll(".s-range-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.range === range);
    });
  }

  async function loadSymbol(symbol, range) {
    currentSymbol = symbol.toUpperCase();
    currentRange = range || currentRange;
    setLoading(true);
    setActiveWatchlistChip(currentSymbol);
    setActiveRangeBtn(currentRange);
    try {
      const data = await fetchStock(currentSymbol, currentRange);
      renderQuote(data);
      renderStats(data);
      renderAnalyst(data);
      renderOutlook(data.technical || {});
      renderChart(data.series || {}, currentRange);
      els.loading.style.display = "none";
      els.error.style.display = "none";
      els.grid.classList.add("visible");
      localStorage.setItem(PREF_SYMBOL_KEY, currentSymbol);
      localStorage.setItem(PREF_RANGE_KEY, currentRange);
      const url = new URL(window.location);
      url.searchParams.set("symbol", currentSymbol);
      window.history.replaceState({}, "", url);
    } catch (err) {
      setError(`Couldn't load data for "${currentSymbol}". ${err.message || ""}`.trim());
    }
  }

  // --- range buttons ---
  els.rangeBtns.addEventListener("click", (e) => {
    const btn = e.target.closest(".s-range-btn");
    if (!btn) return;
    loadSymbol(currentSymbol, btn.dataset.range);
  });

  // --- watchlist chips ---
  els.watchlistChips.addEventListener("click", (e) => {
    const btn = e.target.closest(".watchlist-chip");
    if (!btn) return;
    els.searchInput.value = "";
    els.searchResults.classList.remove("open");
    loadSymbol(btn.dataset.symbol, currentRange);
  });

  // --- search ---
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    const q = els.searchInput.value.trim();
    if (!q) {
      els.searchResults.classList.remove("open");
      return;
    }
    searchDebounce = setTimeout(async () => {
      const quotes = await fetchSearch(q);
      if (!quotes.length) {
        els.searchResults.innerHTML = `<div class="stocks-search-result"><span>No matches</span></div>`;
        els.searchResults.classList.add("open");
        return;
      }
      els.searchResults.innerHTML = quotes
        .map(
          (q) => `<div class="stocks-search-result" data-symbol="${q.symbol}">
            <span><span class="r-sym">${q.symbol}</span> — ${q.name}</span>
            <span class="r-ex">${q.exchange || ""}</span>
          </div>`
        )
        .join("");
      els.searchResults.classList.add("open");
    }, 300);
  });

  els.searchResults.addEventListener("click", (e) => {
    const row = e.target.closest(".stocks-search-result");
    if (!row || !row.dataset.symbol) return;
    els.searchInput.value = "";
    els.searchResults.classList.remove("open");
    loadSymbol(row.dataset.symbol, currentRange);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".stocks-search")) els.searchResults.classList.remove("open");
  });

  // --- init ---
  const urlSymbol = new URLSearchParams(window.location.search).get("symbol");
  const initialSymbol = urlSymbol || localStorage.getItem(PREF_SYMBOL_KEY) || "AAPL";
  const initialRange = localStorage.getItem(PREF_RANGE_KEY) || "6mo";
  loadSymbol(initialSymbol, initialRange);
})();
