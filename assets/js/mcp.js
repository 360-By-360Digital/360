(() => {
  /* ── 360 AI — mcp.js ─────────────────────────────────────────────
   *
   * MCP Connector panel. Lets the user connect external services
   * (currently Supabase) so the AI backend can call their tools.
   *
   * Credentials are stored in localStorage under "mcp_creds" so
   * they survive page refreshes without requiring a server round-trip.
   * The backend reads SUPABASE_ACCESS_TOKEN from env for its own
   * server-to-server MCP calls; this panel sends the user's token
   * along with chat requests so the backend can act on their behalf.
   *
   * SSE event shape from the backend:
   *   { type: "tool", name: "list_tables", status: "running"|"done" }
   * The ai.js onTool handler already surfaces these in the work-state
   * indicator — no changes needed there.
   * ──────────────────────────────────────────────────────────────── */

  const STORAGE_KEY = "mcp_creds";

  /* ── connector registry ─────────────────────────────────────────── */

  const CONNECTORS = [
    {
      id: "supabase",
      name: "Supabase",
      icon: "🟩",
      desc: "Query your database, list tables, and run SELECT statements.",
      fields: [
        { key: "access_token", label: "Personal access token", type: "password", placeholder: "sbp_…" },
        { key: "project_ref",  label: "Project ref (optional)", type: "text",     placeholder: "wiswfpfsjiowtrdyqpxy" },
      ],
      tools: [
        { name: "list_tables", desc: "List all tables in the project" },
        { name: "execute_sql", desc: "Run a read-only SELECT query" },
      ],
    },
    {
      id: "github",
      name: "GitHub",
      icon: "🐙",
      desc: "Search repos, read files, and browse issues. (coming soon)",
      fields: [
        { key: "access_token", label: "Personal access token", type: "password", placeholder: "github_pat_…" },
      ],
      tools: [
        { name: "search_repos", desc: "Search GitHub repositories" },
        { name: "get_file",     desc: "Read a file from a repo" },
      ],
      comingSoon: true,
    },
  ];

  /* ── credential storage ─────────────────────────────────────────── */

  function loadCreds() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (_) { return {}; }
  }

  function saveCreds(creds) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(creds)); }
    catch (_) {}
  }

  function getConnectorCreds(id) {
    return loadCreds()[id] || null;
  }

  function setConnectorCreds(id, fields) {
    const all = loadCreds();
    all[id] = fields;
    saveCreds(all);
  }

  function clearConnectorCreds(id) {
    const all = loadCreds();
    delete all[id];
    saveCreds(all);
  }

  function isConnected(id) {
    const c = getConnectorCreds(id);
    if (!c) return false;
    /* require at least one non-empty field */
    return Object.values(c).some(v => v && String(v).trim());
  }

  /* ── expose active creds for ai.js to include in requests ─────── */

  /* ai.js reads window.__mcpCreds before sending each message and
   * merges them into the request body so the backend can pass them
   * to the MCP server on the user's behalf. */
  function syncWindowCreds() {
    const creds = loadCreds();
    window.__mcpCreds = {};
    for (const conn of CONNECTORS) {
      if (isConnected(conn.id)) {
        window.__mcpCreds[conn.id] = creds[conn.id];
      }
    }
  }

  syncWindowCreds();

  /* ── DOM refs ───────────────────────────────────────────────────── */

  const mcpBtn       = document.getElementById("mcp-btn");
  const mcpPanel     = document.getElementById("mcp-panel");
  const mcpOverlay   = document.getElementById("mcp-overlay");
  const mcpClose     = document.getElementById("mcp-panel-close");
  const mcpBody      = document.getElementById("mcp-panel-body");
  const ctxBar       = document.getElementById("mcp-context-bar");
  const ctxLabel     = document.getElementById("mcp-ctx-label");
  const ctxClose     = document.getElementById("mcp-ctx-close");

  if (!mcpBtn || !mcpPanel || !mcpBody) return;

  /* ── panel open / close ─────────────────────────────────────────── */

  function openPanel() {
    mcpPanel.classList.add("open");
    mcpBtn.classList.add("active");
    if (mcpOverlay) mcpOverlay.classList.add("show");
    renderCards();
  }

  function closePanel() {
    mcpPanel.classList.remove("open");
    mcpBtn.classList.remove("active");
    if (mcpOverlay) mcpOverlay.classList.remove("show");
  }

  mcpBtn.addEventListener("click", () => {
    mcpPanel.classList.contains("open") ? closePanel() : openPanel();
  });

  mcpClose.addEventListener("click", closePanel);
  if (mcpOverlay) mcpOverlay.addEventListener("click", closePanel);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && mcpPanel.classList.contains("open")) closePanel();
  });

  /* ── context bar ────────────────────────────────────────────────── */

  function refreshContextBar() {
    const active = CONNECTORS.filter(c => !c.comingSoon && isConnected(c.id));
    if (!ctxBar || !ctxLabel) return;
    if (active.length) {
      ctxLabel.textContent = active.map(c => c.name).join(", ") + " connected";
      ctxBar.classList.add("show");
    } else {
      ctxBar.classList.remove("show");
    }
    /* update button dot */
    mcpBtn.classList.toggle("has-active", active.length > 0);
  }

  if (ctxClose) {
    ctxClose.addEventListener("click", () => ctxBar.classList.remove("show"));
  }

  refreshContextBar();

  /* ── card rendering ─────────────────────────────────────────────── */

  function renderCards() {
    mcpBody.innerHTML = "";

    const connectedList  = CONNECTORS.filter(c => !c.comingSoon && isConnected(c.id));
    const availableList  = CONNECTORS.filter(c => !c.comingSoon && !isConnected(c.id));
    const comingSoonList = CONNECTORS.filter(c => c.comingSoon);

    if (connectedList.length) {
      mcpBody.appendChild(sectionLabel("Connected"));
      connectedList.forEach(c => mcpBody.appendChild(buildCard(c)));
    }

    if (availableList.length) {
      mcpBody.appendChild(sectionLabel("Available"));
      availableList.forEach(c => mcpBody.appendChild(buildCard(c)));
    }

    if (comingSoonList.length) {
      mcpBody.appendChild(sectionLabel("Coming soon"));
      comingSoonList.forEach(c => mcpBody.appendChild(buildCard(c)));
    }
  }

  function sectionLabel(text) {
    const el = document.createElement("div");
    el.className = "mcp-section-label";
    el.textContent = text;
    return el;
  }

  function buildCard(connector) {
    const connected = isConnected(connector.id);
    const wrap = document.createElement("div");
    wrap.className = "mcp-card" + (connected ? " connected" : "");

    /* icon + info + button row */
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:12px;width:100%;";

    const icon = document.createElement("div");
    icon.className = "mcp-card-icon";
    icon.textContent = connector.icon;

    const info = document.createElement("div");
    info.className = "mcp-card-info";
    info.innerHTML = `<div class="mcp-card-name">${escHtml(connector.name)}</div>
                      <div class="mcp-card-desc">${escHtml(connector.desc)}</div>`;

    const btn = document.createElement("button");
    btn.className = "mcp-connect-btn " + (connector.comingSoon ? "connect" : connected ? "disconnect" : "connect");
    btn.disabled = !!connector.comingSoon;
    btn.style.opacity = connector.comingSoon ? ".4" : "";
    btn.style.cursor  = connector.comingSoon ? "default" : "";
    btn.textContent   = connector.comingSoon ? "Soon" : connected ? "Disconnect" : "Connect";

    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(btn);
    wrap.appendChild(row);

    if (connector.comingSoon) return wrap;

    /* tools list (shown when connected) */
    const toolsList = document.createElement("div");
    toolsList.className = "mcp-tools-list" + (connected ? " show" : "");
    connector.tools.forEach(tool => {
      const toolRow = document.createElement("div");
      toolRow.className = "mcp-tool-row";
      toolRow.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <span><strong>${escHtml(tool.name)}</strong> — ${escHtml(tool.desc)}</span>`;
      toolsList.appendChild(toolRow);
    });
    wrap.appendChild(toolsList);

    /* auth form (shown when not yet connected) */
    const form = document.createElement("div");
    form.className = "mcp-auth-form" + (connected ? "" : "");

    connector.fields.forEach(field => {
      const input = document.createElement("input");
      input.type        = field.type;
      input.placeholder = field.placeholder || field.label;
      input.dataset.key = field.key;
      input.setAttribute("aria-label", field.label);
      const existing = getConnectorCreds(connector.id);
      if (existing && existing[field.key]) input.value = existing[field.key];
      form.appendChild(input);
    });

    const formActions = document.createElement("div");
    formActions.className = "mcp-auth-form-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "mcp-auth-save";
    saveBtn.textContent = "Connect";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "mcp-auth-cancel";
    cancelBtn.textContent = "Cancel";

    formActions.appendChild(cancelBtn);
    formActions.appendChild(saveBtn);
    form.appendChild(formActions);
    wrap.appendChild(form);

    /* ── button interactions ── */

    if (connected) {
      /* disconnect */
      btn.addEventListener("click", () => {
        clearConnectorCreds(connector.id);
        syncWindowCreds();
        refreshContextBar();
        renderCards();
      });
    } else {
      /* show auth form */
      btn.addEventListener("click", () => {
        form.classList.toggle("show");
        btn.textContent = form.classList.contains("show") ? "Cancel" : "Connect";
        btn.className   = "mcp-connect-btn " + (form.classList.contains("show") ? "disconnect" : "connect");
      });

      cancelBtn.addEventListener("click", () => {
        form.classList.remove("show");
        btn.textContent = "Connect";
        btn.className   = "mcp-connect-btn connect";
      });

      saveBtn.addEventListener("click", () => {
        const fields = {};
        let hasValue = false;
        form.querySelectorAll("input[data-key]").forEach(input => {
          const val = input.value.trim();
          fields[input.dataset.key] = val;
          if (val) hasValue = true;
        });

        if (!hasValue) {
          /* shake the form lightly */
          form.style.animation = "none";
          requestAnimationFrame(() => {
            form.style.animation = "aiConfirmScaleIn .15s ease";
          });
          return;
        }

        setConnectorCreds(connector.id, fields);
        syncWindowCreds();
        refreshContextBar();
        renderCards();
      });
    }

    return wrap;
  }

  /* ── patch ai.js sendAI to include MCP creds in request body ───── */
  /*
   * ai.js's streamChatEndpoint builds the body object before calling
   * fetch. We patch window.fetch here to intercept requests going to
   * the ai-chatbot endpoint and inject mcp_creds automatically, so
   * ai.js doesn't need to be modified.
   */
  const SB_AI_URL_PATTERN = /\/functions\/v1\/ai-chatbot/;
  const _origFetch = window.fetch;

  window.fetch = function(input, init, ...rest) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (SB_AI_URL_PATTERN.test(url) && init && init.body) {
      try {
        const body = JSON.parse(init.body);
        const creds = window.__mcpCreds || {};
        if (Object.keys(creds).length) {
          body.mcp_creds = creds;
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch (_) {}
    }
    return _origFetch.call(this, input, init, ...rest);
  };

  /* ── helpers ────────────────────────────────────────────────────── */

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

})();
