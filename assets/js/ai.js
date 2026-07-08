(() => {
  /* ── 360 AI — ai.js (scoped + safer) ─────────────────────────────────── */

  // main.js declares `const supabaseClient = supabase.createClient(...)` at
  // the top level of a classic <script>. That does NOT create a
  // window.supabaseClient property (only var/function declarations do), so
  // window.supabaseClient / window.sb were always undefined here and every
  // Supabase call below silently no-opped — this is why saved chats never
  // loaded. Classic scripts do share one global lexical scope though, so
  // the bare `supabaseClient` identifier from main.js is reachable here.
  const sb = window.supabaseClient || window.sb ||
    (typeof supabaseClient !== "undefined" ? supabaseClient : null);

  const aiInput = document.getElementById("ai-input");
  const aiSendBtn = document.getElementById("ai-send-btn");
  const aiOutput = document.getElementById("ai-output");
  const convList = document.getElementById("conv-list");
  const fileInput = document.getElementById("ai-file-input");
  const welcome = document.getElementById("ai-welcome");
  const modelBadge = document.getElementById("model-badge");
  const aiMain = document.getElementById("ai-main");

  const attachBtn = document.getElementById("ai-attach-btn");
  const filePreview = document.getElementById("file-preview");
  const fpThumb = document.getElementById("fp-thumb");
  const fpName = document.getElementById("fp-name");
  const fpCancel = document.getElementById("fp-cancel");
  const sidebarToggleBtn = document.getElementById("ai-chat-sidebar-toggle");
  const aiSidebar = document.getElementById("ai-sidebar");
  const aiShell = document.querySelector(".ai-shell");
  // Sidebar overlays on mobile (see ai.html's max-width:760px rule) —
  // start collapsed there so it doesn't block the chat on first load.
  if (aiSidebar && window.innerWidth <= 760) {
    aiSidebar.classList.add("collapsed");
    aiShell?.classList.add("sidebar-collapsed");
  }
  const newChatBtn = document.getElementById("new-chat-btn");

  const SB_URL = "https://wiswfpfsjiowtrdyqpxy.supabase.co";

  let history = [];
  let currentConvId = null;
  let currentUserId = null;
  let pendingFile = null;
  let isSending = false;
  let autoSaveTimer = null;
  let loadConvTimer = null;

  function on(el, evt, handler, opts) {
    if (el) el.addEventListener(evt, handler, opts);
  }

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function scrollBottom() {
    if (!aiOutput) return;
    aiOutput.scrollTop = aiOutput.scrollHeight;
  }

  function hideWelcome() {
    if (welcome) welcome.style.display = "none";
  }

  function showWelcome() {
    if (welcome) welcome.style.display = "flex";
  }

  function clearMessages() {
    // Removes rendered bubbles only, instead of wiping #ai-output's
    // entire innerHTML — that used to permanently delete the
    // #ai-welcome node from the DOM on the first new/loaded chat,
    // so showWelcome() silently did nothing ever after.
    if (!aiOutput) return;
    aiOutput.querySelectorAll(".ai-bubble").forEach(el => el.remove());
  }

  function safeFocus(el) {
    try { el?.focus(); } catch (_) {}
  }

  function setInputHeight() {
    if (!aiInput) return;
    aiInput.style.height = "auto";
    aiInput.style.height = Math.min(aiInput.scrollHeight, 200) + "px";
  }

  function fileLooksLikeImage(name = "") {
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
  }

  /* ── markdown ─────────────────────────────────────────────────────── */

  if (window.marked) {
    marked.setOptions({ breaks: true, gfm: true });

    const renderer = new marked.Renderer();
    renderer.code = function (codeArg, langArg) {
      // marked v5+ calls renderer.code(token) with a single
      // { text, lang, escaped } object; older versions called
      // renderer.code(code, infostring). Support both so a version
      // bump can't silently turn code blocks into "[object Object]".
      let codeText, lang;
      if (codeArg && typeof codeArg === "object") {
        codeText = codeArg.text ?? "";
        lang = codeArg.lang ?? "";
      } else {
        codeText = codeArg;
        lang = langArg;
      }

      const safeCode = String(codeText ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const label = (lang || "code").trim().split(/\s+/)[0];
      const id = "cb-" + Math.random().toString(36).slice(2, 8);

      return `
        <div class="code-block-wrap">
          <div class="code-block-header">
            <span class="code-block-lang">${label}</span>
            <button class="code-copy-btn" data-copy-target="${id}">Copy</button>
          </div>
          <pre><code id="${id}" class="language-${label}">${safeCode}</code></pre>
        </div>
      `;
    };

    marked.use({ renderer });
  }

  function renderMarkdown(text) {
    const raw = String(text || "");
    if (!window.marked) return escHtml(raw).replace(/\n/g, "<br>");

    const html = marked.parse(raw);
    const wrap = document.createElement("div");
    wrap.innerHTML = html;

    if (window.hljs) {
      wrap.querySelectorAll("pre code").forEach(el => {
        try { hljs.highlightElement(el); } catch (_) {}
      });
    }

    return wrap.innerHTML;
  }

  /* delegated copy buttons */
  on(document, "click", async (e) => {
    const btn = e.target.closest?.(".code-copy-btn");
    if (!btn) return;

    const id = btn.getAttribute("data-copy-target");
    if (!id || !navigator.clipboard) return;

    const el = document.getElementById(id);
    if (!el) return;

    try {
      await navigator.clipboard.writeText(el.textContent || "");
      const old = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = old || "Copy"; }, 1800);
    } catch (_) {}
  });

  /* ── bubbles ──────────────────────────────────────────────────────── */

  function appendUserBubble(text, file) {
    if (!aiOutput) return null;

    hideWelcome();

    const div = document.createElement("div");
    div.className = "ai-bubble user";

    let inner = "";

    if (file?.previewUrl && file.mimeType?.startsWith("image/")) {
      inner += `
        <div class="attached-preview">
          <img src="${file.previewUrl}" alt="${escHtml(file.name || "image")}" />
        </div>
      `;
    } else if (file) {
      inner += `
        <a class="attached-file-link" href="${file.previewUrl || "#"}" target="_blank" rel="noopener noreferrer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          ${escHtml(file.name || "file")}
        </a>
      `;
    }

    if (text) {
      inner += `<div class="bubble-inner">${escHtml(text)}</div>`;
    }

    div.innerHTML = inner;
    aiOutput.appendChild(div);
    scrollBottom();
    return div;
  }

  function appendAssistantBubble(text, isThinking = false) {
    if (!aiOutput) return { div: null, inner: null };

    hideWelcome();

    const div = document.createElement("div");
    div.className = "ai-bubble assistant";

    const avatar = document.createElement("div");
    avatar.className = "ai-avatar";
    avatar.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z"/></svg>`;

    const inner = document.createElement("div");
    inner.className = "bubble-inner";

    if (isThinking) {
      inner.innerHTML = `<div class="thinking"><span></span><span></span><span></span></div>`;
    } else {
      inner.innerHTML = renderMarkdown(text);
    }

    div.appendChild(avatar);
    div.appendChild(inner);
    aiOutput.appendChild(div);
    scrollBottom();

    return { div, inner };
  }

  /* ── file handling ───────────────────────────────────────────────── */

  function updateFilePreview(fileObj) {
    if (!filePreview || !fpThumb || !fpName) return;

    if (!fileObj) {
      filePreview.classList.remove("show");
      fpThumb.innerHTML = "";
      fpName.textContent = "";
      return;
    }

    const isImage = fileObj.mimeType?.startsWith("image/");

    if (isImage && fileObj.previewUrl) {
      fpThumb.innerHTML = `<img src="${fileObj.previewUrl}" alt="preview" style="max-height:44px;border-radius:6px;" />`;
    } else {
      fpThumb.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
    }

    fpName.textContent = fileObj.name || "file";
    filePreview.classList.add("show");
  }

  function clearFile() {
    pendingFile = null;
    updateFilePreview(null);
  }

  function attachFile(file) {
    if (!file) return;
    const name = file.name || "file";
    const mimeType = file.type || "application/octet-stream";
    const isImage = mimeType.startsWith("image/");

    if (isImage) {
      // Compress to max 1024px / JPEG 0.82 — keeps base64 under ~500KB for OpenRouter
      const objUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objUrl);
        const MAX = 1024;
        let { naturalWidth: w, naturalHeight: h } = img;
        if (w > MAX || h > MAX) {
          if (w >= h) { h = Math.round(h * MAX / w); w = MAX; }
          else        { w = Math.round(w * MAX / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
        pendingFile = { file, name, base64: dataUrl.split(",")[1], mimeType: "image/jpeg", previewUrl: dataUrl };
        updateFilePreview(pendingFile);
      };
      img.onerror = () => { URL.revokeObjectURL(objUrl); showToast("Could not read image"); };
      img.src = objUrl;
    } else {
      const reader = new FileReader();
      reader.onload = ev => {
        const result = ev.target?.result;
        if (typeof result !== "string" || !result.includes(",")) return;
        pendingFile = { file, name, base64: result.split(",")[1], mimeType, previewUrl: null };
        updateFilePreview(pendingFile);
      };
      reader.readAsDataURL(file);
    }
  }

  on(attachBtn, "click", () => fileInput?.click());

  on(fileInput, "change", e => {
    const file = e.target?.files?.[0];
    if (file) attachFile(file);
    if (e.target) e.target.value = "";
  });

  on(fpCancel, "click", clearFile);

  on(document, "paste", e => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type?.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) return;

        const named = new File(
          [file],
          `pasted-image-${Date.now()}.png`,
          { type: file.type || "image/png" }
        );

        attachFile(named);
        break;
      }
    }
  });

  on(aiMain, "dragover", e => {
    e.preventDefault();
    aiMain.classList.add("drag-over");
  });

  on(aiMain, "dragleave", e => {
    if (!aiMain) return;
    const related = e.relatedTarget;
    if (!related || !aiMain.contains(related)) {
      aiMain.classList.remove("drag-over");
    }
  });

  on(aiMain, "drop", e => {
    e.preventDefault();
    aiMain?.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (file) attachFile(file);
  });

  /* ── storage upload ──────────────────────────────────────────────── */

  async function uploadToStorage(file, name) {
    if (!sb?.storage || !file) return null;

    const ext = (name?.split(".").pop() || "bin").replace(/[^\w-]/g, "");
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await sb.storage
      .from("ai-uploads")
      .upload(path, file, { cacheControl: "3600", upsert: false });

    if (error) return null;

    return sb.storage.from("ai-uploads").getPublicUrl(path).data?.publicUrl || null;
  }

  function updateModelBadge(model) {
    if (!modelBadge || !model) return;

    const m = String(model).toLowerCase();
    const map = {
      openrouter: "Claude Opus · OpenRouter",
      claude: "Claude Sonnet · Direct",
      groq: "Llama 3.3 · Groq",
      gemini: "Gemini · Google",
    };

    for (const [key, label] of Object.entries(map)) {
      if (m.includes(key)) {
        modelBadge.textContent = label;
        return;
      }
    }

    modelBadge.textContent = model;
  }

  /* ── send ────────────────────────────────────────────────────────── */

  async function sendAI() {
    if (isSending) return;
    if (!aiInput && !pendingFile) return;

    const prompt = aiInput?.value?.trim() || "";
    if (!prompt && !pendingFile) return;

    isSending = true;
    if (aiSendBtn) aiSendBtn.disabled = true;

    if (aiInput) {
      aiInput.value = "";
      aiInput.style.height = "auto";
    }

    const captured = pendingFile ? { ...pendingFile } : null;
    clearFile();

    let storageUrl = null;
    if (captured?.file) {
      storageUrl = await uploadToStorage(captured.file, captured.name).catch(() => null);
    }

    appendUserBubble(
      prompt,
      captured ? { ...captured, previewUrl: storageUrl || captured.previewUrl } : null
    );

    const { inner: thinkInner } = appendAssistantBubble("", true);

    try {
      const body = {
        message: prompt || "The user attached a file. Please analyze it.",
        memory: history,
      };

      if (captured) {
        body.file = {
          base64: captured.base64,
          mimeType: captured.mimeType,
          fileName: captured.name,
        };
      }

      const res = await fetch(`${SB_URL}/functions/v1/ai-chatbot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      let data = {};
      try {
        data = await res.json();
      } catch (_) {
        data = {};
      }

      if (!res.ok) {
        throw new Error(data.error || data.reply || res.statusText || "Request failed");
      }

      const reply = data.reply || "No response.";

      const modelUsed = res.headers.get("x-model-used");
      if (modelUsed) updateModelBadge(modelUsed);

      if (thinkInner) {
        thinkInner.innerHTML = renderMarkdown(reply);
      }

      scrollBottom();

      const userEntry = {
        role: "user",
        content: prompt || "(file attached)",
      };

      if (storageUrl && captured) {
        userEntry.fileUrl = storageUrl;
        userEntry.fileName = captured.name;
      }

      history.push(userEntry);
      history.push({ role: "assistant", content: reply });

      scheduleAutoSave();
    } catch (err) {
      if (thinkInner) {
        thinkInner.innerHTML = `<span style="color:#ef4444;">${escHtml(err?.message || "Unknown error")}</span>`;
      }
    } finally {
      isSending = false;
      if (aiSendBtn) aiSendBtn.disabled = false;
      safeFocus(aiInput);
    }
  }

  /* ── input events ────────────────────────────────────────────────── */

  on(aiInput, "input", setInputHeight);

  on(aiInput, "keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendAI();
    }
  });

  on(aiSendBtn, "click", sendAI);

  document.querySelectorAll(".wl-chip").forEach(chip => {
    on(chip, "click", () => {
      if (!aiInput) return;
      aiInput.value = chip.dataset.prompt || "";
      setInputHeight();
      safeFocus(aiInput);
      sendAI();
    });
  });

  on(sidebarToggleBtn, "click", () => {
    aiSidebar?.classList.toggle("collapsed");
    aiShell?.classList.toggle("sidebar-collapsed", !!aiSidebar?.classList.contains("collapsed"));
  });

  /* ── autosave ────────────────────────────────────────────────────── */

  function scheduleAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => saveConversation(true), 1800);
  }

  async function saveConversation(silent = false) {
    if (!sb || !currentUserId) return;

    const userMsgs = history.filter(m => m.role === "user");
    if (!userMsgs.length) return;

    const title = (userMsgs[0]?.content || "Chat").slice(0, 50);
    const payload = {
      user_id: currentUserId,
      title,
      messages: history,
      updated_at: new Date().toISOString(),
    };

    try {
      if (currentConvId) {
        await sb.from("ai_conversations").update(payload).eq("id", currentConvId);
      } else {
        const { data, error } = await sb
          .from("ai_conversations")
          .insert(payload)
          .select()
          .single();

        if (error) {
          if (!silent) showToast("Save failed: " + error.message);
          return;
        }

        currentConvId = data.id;
      }

      if (!silent) showToast("Saved");
      loadConversations();
    } catch (_) {
      if (!silent) showToast("Save failed");
    }
  }

  function scheduleLoad() {
    clearTimeout(loadConvTimer);
    loadConvTimer = setTimeout(loadConversations, 100);
  }

  async function loadConversations() {
    if (!convList) return;

    convList.innerHTML = "";

    if (!sb || !currentUserId) {
      convList.innerHTML = `<div class="conv-empty">Sign in to save chats</div>`;
      return;
    }

    const { data } = await sb
      .from("ai_conversations")
      .select("id,title,updated_at")
      .eq("user_id", currentUserId)
      .order("updated_at", { ascending: false })
      .limit(60);

    if (!data?.length) {
      convList.innerHTML = `<div class="conv-empty">No saved chats yet</div>`;
      return;
    }

    data.forEach(conv => {
      const item = document.createElement("div");
      item.className = "conv-item" + (conv.id === currentConvId ? " active" : "");
      item.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <span class="conv-item-title">${escHtml(conv.title)}</span>
        <button class="conv-del" title="Delete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;

      on(item, "click", e => {
        if (!e.target.classList.contains("conv-del")) {
          loadConversation(conv.id);
        }
      });

      const delBtn = item.querySelector(".conv-del");
      on(delBtn, "click", e => {
        e.stopPropagation();
        deleteConversation(conv.id);
      });

      convList.appendChild(item);
    });
  }

  async function loadConversation(id) {
    if (!sb || !id) return;

    const { data } = await sb
      .from("ai_conversations")
      .select("*")
      .eq("id", id)
      .single();

    if (!data) return;

    currentConvId = data.id;
    history = Array.isArray(data.messages) ? data.messages : [];

    clearMessages();
    if (!history.length) {
      showWelcome();
    } else {
      hideWelcome();
    }

    history
      .filter(m => m.role !== "system")
      .forEach(m => {
        if (m.role === "user") {
          const att = m.fileUrl
            ? {
                name: m.fileName || "file",
                previewUrl: m.fileUrl,
                mimeType: fileLooksLikeImage(m.fileUrl)
                  ? "image/jpeg"
                  : "application/octet-stream",
              }
            : null;

          appendUserBubble(m.content, att);
        } else {
          appendAssistantBubble(m.content);
        }
      });

    scrollBottom();
    loadConversations();
  }

  async function deleteConversation(id) {
    if (!sb || !id) return;
    if (!confirm("Delete this chat?")) return;

    await sb.from("ai_conversations").delete().eq("id", id);

    if (currentConvId === id) {
      startNewChat();
    } else {
      loadConversations();
    }
  }

  function startNewChat() {
    currentConvId = null;
    history = [];
    clearMessages();
    showWelcome();
    clearFile();
    loadConversations();
  }

  on(newChatBtn, "click", startNewChat);

  /* ── seed conversation from search.html's "Continue this conversation"
     handoff link (?q=...&a=...) — makes the AI tab feel like Gemini's
     "continue in full chat" flow instead of starting over from scratch ── */
  (() => {
    const params = new URLSearchParams(location.search);
    const seedQ = params.get("q");
    const seedA = params.get("a");
    if (!seedQ || !seedA) return;
    try {
      const decodedA = decodeURIComponent(escape(atob(seedA)));
      appendUserBubble(seedQ);
      appendAssistantBubble(decodedA);
      history.push({ role: "user", content: seedQ });
      history.push({ role: "assistant", content: decodedA });
      const url = new URL(location.href);
      url.searchParams.delete("q");
      url.searchParams.delete("a");
      window.history.replaceState(null, "", url.toString());
    } catch (e) {
      console.error("Failed to seed conversation from handoff:", e);
    }
  })();

  function showToast(msg) {
    const t = document.createElement("div");
    t.className = "ai-toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  /* ── auth ────────────────────────────────────────────────────────── */

  (async () => {
    if (!sb?.auth) return;

    try {
      const { data: { session } } = await sb.auth.getSession();
      currentUserId = session?.user?.id || null;
      scheduleLoad();
    } catch (_) {}
  })();

  if (sb?.auth) {
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      currentUserId = session?.user?.id || null;
      scheduleLoad();
    });
  }
})();
