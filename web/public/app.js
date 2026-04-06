const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];


// Sidebar
const fileInput   = $("#file");
const dropZone    = $("#dropZone");
const dropText    = $("#dropText");
const fileConfig  = $("#fileConfig");
const sheetSelect = $("#sheet");
const modeSelect  = $("#mode");
const onMapRow    = $("#onMapRow");
const onlyOnMap   = $("#onlyOnMap");
const loadBtn     = $("#loadBtn");
const locCount    = $("#locCount");
const showLocsBtn = $("#showLocsBtn");
const goBtn       = $("#goBtn");
const errorHint   = $("#errorHint");
const logToggle   = $("#logToggle");
const logEl       = $("#log");
const dotColorInput = $("#dotColor");
const dotColorHex   = $("#dotColorHex");

// Steps
const step1 = $("#step1");
const step2 = $("#step2");
const step3 = $("#step3");

// Canvas states
const emptyState   = $("#emptyState");
const confirmState = $("#confirmState");
const confirmTitle = $("#confirmTitle");
const confirmSub   = $("#confirmSub");
const mapState     = $("#mapState");
const tabBar       = $("#tabBar");
const mapViewport  = $("#mapViewport");
const dlBtn        = $("#dlBtn");

// Overlay
const locOverlay  = $("#locOverlay");
const locBody     = $("#locBody");
const closeOverlay = $("#closeOverlay");

// Results overlay
const viewTableBtn   = $("#viewTableBtn");
const resultsOverlay = $("#resultsOverlay");
const resultsBody    = $("#resultsBody");
const closeResults   = $("#closeResults");

let currentFile = null;
let locationData = null;
let generatedMaps = [];
let generatedDetails = [];
let activeTab = null;

const REGION_LABELS = {
  world: "World",
  europe: "Europe",
  asia: "Asia",
  north_america: "N. America",
  south_america: "S. America",
};

// ── Steps ──────────────────────────────────────────────

function activateStep(n) {
  [step1, step2, step3].forEach((s, i) => {
    s.classList.remove("active", "done", "disabled");
    if (i + 1 < n) s.classList.add("done");
    else if (i + 1 === n) s.classList.add("active");
    else s.classList.add("disabled");
  });
}

function showCanvas(which) {
  emptyState.hidden   = which !== "empty";
  confirmState.hidden = which !== "confirm";
  mapState.hidden     = which !== "maps";
}

// ── File handling ──────────────────────────────────────

function handleFile(file) {
  if (!file) return;
  currentFile = file;
  locationData = null;
  generatedMaps = [];
  dropZone.classList.add("has-file");
  dropText.textContent = file.name;
  loadSheets();
}

fileInput.addEventListener("change", () => handleFile(fileInput.files?.[0]));

dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const f = e.dataTransfer.files?.[0];
  if (f) handleFile(f);
});
dropZone.addEventListener("click", (e) => {
  if (e.target === fileInput) return;
  fileInput.click();
});

// ── Sheets ─────────────────────────────────────────────

async function loadSheets() {
  const fd = new FormData();
  fd.append("file", currentFile);
  try {
    const res = await fetch("/api/sheets", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    sheetSelect.innerHTML = "";
    for (const n of data.sheets) {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      sheetSelect.appendChild(opt);
    }
    autoSelectSheet();
    fileConfig.hidden = false;
    activateStep(1);
    showCanvas("empty");
    resetDownstream();
  } catch (e) {
    alert("Could not read sheets: " + e.message);
  }
}

function autoSelectSheet() {
  const preferred = modeSelect.value === "user_events" ? "FY 2026" : "Schools --> Customers";
  for (let i = 0; i < sheetSelect.options.length; i++) {
    if (sheetSelect.options[i].value === preferred) { sheetSelect.selectedIndex = i; return; }
  }
  sheetSelect.selectedIndex = 0;
}

modeSelect.addEventListener("change", () => {
  onMapRow.style.display = modeSelect.value === "user_events" ? "" : "none";
  autoSelectSheet();
  resetDownstream();
});

// ── Load locations (preview) ───────────────────────────

loadBtn.addEventListener("click", loadLocations);

async function loadLocations() {
  if (!currentFile) return;
  loadBtn.disabled = true;
  loadBtn.innerHTML = '<span class="spinner"></span>Reading…';
  resetDownstream();

  const fd = new FormData();
  fd.append("file", currentFile);
  fd.append("sheetName", sheetSelect.value);
  fd.append("mode", modeSelect.value);
  fd.append("onlyOnMap", String(onlyOnMap.checked));

  try {
    const res = await fetch("/api/preview", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    locationData = data;
    onLocationsLoaded(data);
  } catch (e) {
    alert("Preview error: " + e.message);
  } finally {
    loadBtn.disabled = false;
    loadBtn.textContent = "Load locations";
  }
}

function onLocationsLoaded(data) {
  const n = data.totalLocations;
  const meta = data.meta || {};

  if (n === 0) {
    let msg = `0 locations found on sheet "${data.sheetName}".`;
    if (meta.totalRows === 0) {
      msg += " The sheet appears to be empty.";
    } else if (meta.columns?.length) {
      msg += ` Columns found: ${meta.columns.slice(0, 8).join(", ")}${meta.columns.length > 8 ? "…" : ""}.`;
      if (meta.totalWithLocation === 0) {
        msg += ' Could not find City/State/Country columns.';
      } else if (meta.onMapFilterActive && meta.totalWithLocation > 0) {
        msg += ` ${meta.totalWithLocation} rows had location data but all were filtered by "On Map?" column. Try unchecking the "Only On Map? = yes" filter.`;
      }
    }
    locCount.textContent = msg;
    showLocsBtn.hidden = true;
    activateStep(1);
    showCanvas("empty");
    confirmTitle.textContent = "No locations found";
    confirmSub.textContent = msg;
    showCanvas("confirm");
    return;
  }

  locCount.textContent = `${n} location${n !== 1 ? "s" : ""} found`;
  showLocsBtn.hidden = false;

  const hasMember = data.locations.some((l) => l.memberCount != null && l.memberCount !== "");
  locBody.innerHTML = "";
  for (const loc of data.locations) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${loc.index}</td><td>${esc(loc.location)}</td><td>${hasMember && loc.memberCount != null ? esc(String(loc.memberCount)) : "—"}</td>`;
    locBody.appendChild(tr);
  }

  activateStep(2);
  step3.classList.remove("disabled");
  step3.classList.add("active");
  goBtn.disabled = false;

  confirmTitle.textContent = `${n} location${n !== 1 ? "s" : ""} loaded`;
  confirmSub.textContent = `Sheet: "${data.sheetName}" · Mode: ${data.mode === "user_events" ? "User events" : "Universities"}`;
  showCanvas("confirm");
}

// ── Overlay ────────────────────────────────────────────

showLocsBtn.addEventListener("click", () => { locOverlay.hidden = false; });
closeOverlay.addEventListener("click", () => { locOverlay.hidden = true; });
locOverlay.addEventListener("click", (e) => { if (e.target === locOverlay) locOverlay.hidden = true; });

viewTableBtn.addEventListener("click", () => { resultsOverlay.hidden = false; });
closeResults.addEventListener("click", () => { resultsOverlay.hidden = true; });
resultsOverlay.addEventListener("click", (e) => { if (e.target === resultsOverlay) resultsOverlay.hidden = true; });

// ── Generate ───────────────────────────────────────────

goBtn.addEventListener("click", generate);

async function generate() {
  const regions = $$(".region:checked").map((c) => c.value);
  if (!regions.length) {
    errorHint.textContent = "Select at least one region.";
    errorHint.hidden = false;
    return;
  }
  errorHint.hidden = true;
  goBtn.disabled = true;
  goBtn.innerHTML = '<span class="spinner"></span>Generating…';
  logToggle.hidden = false;
  logEl.textContent = "Starting…\n";

  const fd = new FormData();
  fd.append("file", currentFile);
  fd.append("sheetName", sheetSelect.value);
  fd.append("mode", modeSelect.value);
  fd.append("onlyOnMap", String(onlyOnMap.checked));
  fd.append("useMemberSize", String($("#useMemberSize").checked));
  fd.append("dotColor", dotColorInput.value);
  fd.append("basename", "map");
  fd.append("regions", JSON.stringify(regions));

  try {
    const res = await fetch("/api/generate", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      errorHint.innerHTML = String(data.error).includes("OPENAI_API_KEY")
        ? 'Server needs <code>OPENAI_API_KEY</code>.'
        : esc(data.error || "Generation failed.");
      errorHint.hidden = false;
      return;
    }
    logEl.textContent = (data.logs || []).join("\n");
    generatedDetails = data.details || [];
    populateResultsTable(generatedDetails);
    showMaps(data);
  } catch (e) {
    errorHint.textContent = String(e.message || e);
    errorHint.hidden = false;
  } finally {
    goBtn.disabled = false;
    goBtn.textContent = "Generate maps";
  }
}

// ── Map viewer ─────────────────────────────────────────

function showMaps(data) {
  generatedMaps = (data.files || []).map((f) => {
    const regionKey = extractRegionKey(f.filename);
    const blob = new Blob([f.svg], { type: "image/svg+xml" });
    return {
      regionKey,
      label: REGION_LABELS[regionKey] || f.filename,
      filename: f.filename,
      blobUrl: URL.createObjectURL(blob),
    };
  });

  tabBar.innerHTML = "";
  for (const m of generatedMaps) {
    const btn = document.createElement("button");
    btn.className = "tab-btn";
    btn.textContent = m.label;
    btn.dataset.region = m.regionKey;
    btn.addEventListener("click", () => selectTab(m.regionKey));
    tabBar.appendChild(btn);
  }

  showCanvas("maps");
  if (generatedMaps.length) selectTab(generatedMaps[0].regionKey);
  viewTableBtn.hidden = !generatedDetails.length;

  step3.classList.remove("active");
  step3.classList.add("done");
}

function selectTab(regionKey) {
  activeTab = regionKey;
  $$(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.region === regionKey));

  const m = generatedMaps.find((x) => x.regionKey === regionKey);
  if (!m) return;

  const img = document.createElement("img");
  img.src = m.blobUrl;
  img.alt = m.label;
  mapViewport.innerHTML = "";
  mapViewport.appendChild(img);

  dlBtn.href = m.blobUrl;
  dlBtn.download = m.filename;
  dlBtn.hidden = false;
}

function extractRegionKey(filename) {
  if (filename.includes("_europe"))        return "europe";
  if (filename.includes("_asia"))          return "asia";
  if (filename.includes("_north_america")) return "north_america";
  if (filename.includes("_south_america")) return "south_america";
  return "world";
}

// ── Results table ───────────────────────────────────────

function populateResultsTable(details) {
  resultsBody.innerHTML = "";
  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    const tr = document.createElement("tr");
    if (!d.onMap) tr.classList.add("row-miss");
    tr.innerHTML =
      `<td>${i + 1}</td>` +
      `<td>${esc(d.location)}</td>` +
      `<td>${d.llmLocation ? esc(d.llmLocation) : '<span class="tag tag-fail">Failed</span>'}</td>` +
      `<td>${d.memberCount != null ? esc(String(d.memberCount)) : "—"}</td>` +
      `<td>${d.onMap ? '<span class="tag tag-yes">Yes</span>' : '<span class="tag tag-no">No</span>'}</td>`;
    resultsBody.appendChild(tr);
  }
}

// ── Util ───────────────────────────────────────────────

function resetDownstream() {
  locationData = null;
  generatedMaps = [];
  generatedDetails = [];
  locCount.textContent = "—";
  showLocsBtn.hidden = true;
  locBody.innerHTML = "";
  goBtn.disabled = true;
  errorHint.hidden = true;
  logToggle.hidden = true;
  step2.classList.add("disabled");
  step2.classList.remove("active", "done");
  step3.classList.add("disabled");
  step3.classList.remove("active", "done");
  showCanvas("empty");
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ── Dot color ───────────────────────────────────────
dotColorInput.addEventListener("input", () => {
  dotColorHex.textContent = dotColorInput.value;
});

// Init
activateStep(1);
showCanvas("empty");
