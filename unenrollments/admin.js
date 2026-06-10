import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://wiswfpfsjiowtrdyqpxy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dmcGZzamlvd3RyZHlxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM";

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let DATA = [];
let currentMethod = null;
let editingMethod = null;

function uuid12() {
  return Math.random().toString(36).substring(2, 14);
}

// ── Scroll: hide h1 in top-bar ──
window.addEventListener("scroll", () => {
  const topBar = document.querySelector(".top-bar");
  if (!topBar) return;
  topBar.classList.toggle("scrolled", window.scrollY > 40);
});

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("addMethodBtn").onclick = () => openEditor(null);
  document.getElementById("cancelBtn").onclick = closeEditor;
  document.getElementById("saveBtn").onclick = saveMethod;
  document.getElementById("editBtn").onclick = () => openEditor(currentMethod);
  document.getElementById("deleteBtn").onclick = deleteCurrentMethod;
  document.getElementById("addStepBtn").onclick = () => addStepRow("");
  window.addEventListener("hashchange", route);
  loadMethods();
});

// ── Step rows ──
function addStepRow(value = "") {
  const list = document.getElementById("stepsList");
  const row = document.createElement("div");
  row.className = "step-input-row";
  row.innerHTML = `
    <input type="text" placeholder="Enter step…" value="${value.replace(/"/g, '&quot;')}">
    <button class="remove-step-btn" title="Remove">✕</button>
  `;
  row.querySelector(".remove-step-btn").onclick = () => row.remove();
  list.appendChild(row);
  row.querySelector("input").focus();
}

function getSteps() {
  return [...document.querySelectorAll("#stepsList .step-input-row input")]
    .map(i => i.value.trim())
    .filter(Boolean);
}

function clearSteps() {
  document.getElementById("stepsList").innerHTML = "";
}

// ── Load ──
async function loadMethods() {
  try {
    const { data, error } = await client.from("methods").select("*").order("created_at", { ascending: true });
    if (error) throw error;
    DATA = data || [];
    renderGrid();
    route();
  } catch (err) {
    console.error("Failed to load methods:", err);
    DATA = [];
    renderGrid();
  }
}

// ── Grid ──
function renderGrid() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  DATA.forEach((method) => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.innerHTML = `<h3>${method.title}</h3><p>${method.short || ""}</p>`;
    card.onclick = () => { location.hash = method.id; };
    grid.appendChild(card);
  });
}

// ── Routing ──
function route() {
  const id = location.hash.replace("#", "");
  if (!id) { showList(); return; }
  const method = DATA.find((m) => m.id === id);
  if (method) showDetail(method);
}

function goHome() { location.hash = ""; }

function showList() {
  document.getElementById("listView").classList.remove("hidden");
  document.getElementById("detailView").classList.add("hidden");
}

function showDetail(method) {
  currentMethod = method;
  document.getElementById("listView").classList.add("hidden");
  document.getElementById("detailView").classList.remove("hidden");
  document.getElementById("title").textContent = method.title;
  document.getElementById("desc").textContent = method.description || "";
  const steps = document.getElementById("steps");
  steps.innerHTML = "";
  (method.methods || []).forEach((step) => {
    const div = document.createElement("div");
    div.className = "step";
    div.textContent = step;
    steps.appendChild(div);
  });
}

// ── Editor ──
function openEditor(method = null) {
  editingMethod = method;
  document.getElementById("editor").classList.remove("hidden");
  clearSteps();
  if (method) {
    document.getElementById("editorTitle").textContent = "Edit Method";
    document.getElementById("methodTitle").value = method.title;
    document.getElementById("methodShort").value = method.short || "";
    document.getElementById("methodDescription").value = method.description || "";
    (method.methods || []).forEach(s => addStepRow(s));
  } else {
    document.getElementById("editorTitle").textContent = "Add Method";
    clearForm();
    addStepRow(""); // start with one empty row
  }
}

function closeEditor() {
  document.getElementById("editor").classList.add("hidden");
}

function clearForm() {
  document.getElementById("methodTitle").value = "";
  document.getElementById("methodShort").value = "";
  document.getElementById("methodDescription").value = "";
  clearSteps();
}

// ── Save ──
async function saveMethod() {
  const title = document.getElementById("methodTitle").value.trim();
  if (!title) { alert("Title required"); return; }

  const obj = {
    title,
    short: document.getElementById("methodShort").value,
    description: document.getElementById("methodDescription").value,
    methods: getSteps(),
    updated_at: new Date().toISOString(),
  };

  try {
    if (editingMethod) {
      const { error } = await client.from("methods").update(obj).eq("id", editingMethod.id);
      if (error) throw error;
    } else {
      const { error } = await client.from("methods").insert({ ...obj, id: uuid12(), created_at: new Date().toISOString() });
      if (error) throw error;
    }
    await loadMethods();
    closeEditor();
  } catch (err) {
    console.error("Failed to save:", err);
    alert("Failed to save: " + err.message);
  }
}

// ── Delete ──
async function deleteCurrentMethod() {
  if (!currentMethod) return;
  if (!confirm("Delete this method?")) return;
  try {
    const { error } = await client.from("methods").delete().eq("id", currentMethod.id);
    if (error) throw error;
    await loadMethods();
    goHome();
  } catch (err) {
    console.error("Failed to delete:", err);
    alert("Failed to delete: " + err.message);
  }
}

window.goHome = goHome;