import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://wiswfpfsjiowtrdyqpxy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dmcGZzamlvd3RyZHlxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM";

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let DATA = [];

async function init() {
  const { data, error } = await client
    .from("methods")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load methods:", error);
    return;
  }

  DATA = data || [];
  render();
  route();
}

function render() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  DATA.forEach(item => {
    const div = document.createElement("div");
    div.className = "result-card";
    div.innerHTML = `<h3>${item.title}</h3><p>${item.short || ""}</p>`;
    div.onclick = () => location.hash = item.id;
    grid.appendChild(div);
  });
}

window.addEventListener("hashchange", route);

function route() {
  const id = location.hash.replace("#", "");
  if (!id) return showList();
  const item = DATA.find(d => d.id === id);
  if (item) showDetail(item);
}

function showList() {
  document.getElementById("listView").classList.remove("hidden");
  document.getElementById("detailView").classList.add("hidden");
}

function showDetail(item) {
  document.getElementById("listView").classList.add("hidden");
  document.getElementById("detailView").classList.remove("hidden");
  document.getElementById("title").textContent = item.title;
  document.getElementById("desc").textContent = item.description || "";
  const steps = document.getElementById("steps");
  steps.innerHTML = "";
  (item.methods || []).forEach(s => {
    const div = document.createElement("div");
    div.className = "step";
    div.textContent = s;
    steps.appendChild(div);
  });
}

function goHome() {
  location.hash = "";
}

window.goHome = goHome;

init();