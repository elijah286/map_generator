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
const removeOceanCheck     = $("#removeOcean");
const landOutlineCheck     = $("#landOutline");
const landOutlineColorField = $("#landOutlineColorField");
const landOutlineColorInput = $("#landOutlineColor");
const landOutlineColorHex   = $("#landOutlineColorHex");
const dotSizeSlider    = $("#dotSize");
const dotSizeVal       = $("#dotSizeVal");
const outlineWidthSlider = $("#outlineWidth");
const outlineWidthVal    = $("#outlineWidthVal");
const bgColorInput  = $("#bgColor");
const bgColorHex    = $("#bgColorHex");
const includeAntarcticaCheck = $("#includeAntarctica");
const detailSlider  = $("#mapDetail");
const detailVal     = $("#detailVal");

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
  fd.append("removeOcean", String(removeOceanCheck.checked));
  fd.append("landOutline", String(landOutlineCheck.checked));
  if (landOutlineCheck.checked) {
    fd.append("landOutlineColor", landOutlineColorInput.value);
  }
  fd.append("includeAntarctica", String(includeAntarcticaCheck.checked));
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

    // Store updated Excel with embedded cache for re-upload
    if (data.updatedExcel) {
      const bytes = Uint8Array.from(atob(data.updatedExcel), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      currentFile = new File([blob], currentFile.name, { type: blob.type });
    }
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
    return {
      regionKey,
      label: REGION_LABELS[regionKey] || f.filename,
      filename: f.filename,
      rawSvg: f.svg,
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

  // Parse SVG string and embed inline for live manipulation
  const parser = new DOMParser();
  const doc = parser.parseFromString(m.rawSvg, "image/svg+xml");
  const svg = doc.documentElement;
  svg.style.width = "100%";
  svg.style.height = "100%";
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Store base radii + stroke widths so sliders can scale from originals
  svg.querySelectorAll("g.points circle").forEach((c) => {
    c.dataset.baseR = c.getAttribute("r");
    c.dataset.baseSw = c.getAttribute("stroke-width");
  });
  svg.querySelectorAll("g.land path").forEach((p) => {
    p.dataset.baseSw = p.getAttribute("stroke-width");
    p.dataset.baseFill = p.getAttribute("fill");
    p.dataset.baseStroke = p.getAttribute("stroke");
    p.dataset.baseD = p.getAttribute("d");
    if (p.dataset.countryId === "010") p.dataset.isAntarctica = "1";
  });

  mapViewport.innerHTML = "";
  mapViewport.appendChild(svg);

  // Apply current slider/color settings instantly
  applyLiveSettings();
  updateDownloadLink();
}

function updateDownloadLink() {
  const svg = mapViewport.querySelector("svg");
  if (!svg || !activeTab) return;
  const m = generatedMaps.find((x) => x.regionKey === activeTab);
  if (!m) return;
  // Serialize current SVG state (with live edits) for download
  const serializer = new XMLSerializer();
  const svgStr = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(svg);
  const blob = new Blob([svgStr], { type: "image/svg+xml" });
  if (dlBtn._blobUrl) URL.revokeObjectURL(dlBtn._blobUrl);
  dlBtn._blobUrl = URL.createObjectURL(blob);
  dlBtn.href = dlBtn._blobUrl;
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

// ── Client-side darken helper ───────────────────────
function darkenHex(hex, factor = 0.5) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ── Apply live settings to inline SVG ───────────────
const DETAIL_LEVELS = [0, 25, 50, 75]; // must match server DETAIL_LEVELS

function applyLiveSettings() {
  const svg = mapViewport.querySelector("svg");
  if (!svg) return;

  const dotMul = parseFloat(dotSizeSlider.value) || 1;
  const outMul = parseFloat(outlineWidthSlider.value) || 1;
  const color = dotColorInput.value;
  const stroke = darkenHex(color);
  const ocean = removeOceanCheck.checked;
  const outline = landOutlineCheck.checked;
  const outlineColor = landOutlineColorInput.value;

  // Background rect (first rect child of svg)
  const bgRect = svg.querySelector(":scope > rect");
  if (bgRect) bgRect.setAttribute("display", ocean ? "none" : "inline");

  // Dots
  svg.querySelectorAll("g.points circle").forEach((c) => {
    const baseR = parseFloat(c.dataset.baseR) || 4;
    const baseSw = parseFloat(c.dataset.baseSw) || 0.5;
    c.setAttribute("r", (baseR * dotMul).toFixed(2));
    c.setAttribute("stroke-width", (baseSw * dotMul).toFixed(2));
    c.setAttribute("fill", color);
    c.setAttribute("stroke", stroke);
  });

  // Detail level: pick the right simplified `d` attribute
  const detailPct = parseFloat(detailSlider.value);
  // Find the appropriate detail level
  let detailAttr = null; // null = use original d (100%)
  if (detailPct < 100) {
    // Find the closest level at or below the slider value
    let best = DETAIL_LEVELS[0];
    for (const lvl of DETAIL_LEVELS) {
      if (lvl <= detailPct) best = lvl;
    }
    detailAttr = `d-${best}`;
  }

  // Land paths
  svg.querySelectorAll("g.land path").forEach((p) => {
    const baseSw = parseFloat(p.dataset.baseSw) || 0.35;
    p.setAttribute("stroke-width", (baseSw * outMul).toFixed(2));
    p.setAttribute("fill", outline ? "none" : p.dataset.baseFill);
    p.setAttribute("stroke", outline ? outlineColor : p.dataset.baseStroke);

    // Antarctica toggle
    if (p.dataset.isAntarctica === "1") {
      p.setAttribute("display", includeAntarcticaCheck.checked ? "inline" : "none");
      return;
    }

    // Detail: swap the path's `d` attribute with the simplified version
    if (detailAttr) {
      const simplified = p.dataset[detailAttr.replace("-", "")]; // data-d-0 → dataset.d0, etc.
      // dataset keys: data-d-0 → d0, data-d-25 → d25, etc.
      const key = `d${detailAttr.split("-")[1]}`;
      const simplifiedD = p.dataset[key];
      if (simplifiedD != null) {
        p.setAttribute("d", simplifiedD || "");
        // Hide paths that simplified away completely
        p.setAttribute("display", simplifiedD ? "inline" : "none");
      }
    } else {
      // Restore full detail from stored base
      if (p.dataset.baseD) {
        p.setAttribute("d", p.dataset.baseD);
      }
      p.setAttribute("display", "inline");
    }
  });

  // Viewport background
  mapViewport.style.background = bgColorInput.value;

  updateDownloadLink();
}

// ── Wire up all visual controls ─────────────────────
const _visualControls = [
  [dotColorInput, "input", () => { dotColorHex.textContent = dotColorInput.value; }],
  [dotSizeSlider, "input", () => { dotSizeVal.textContent = `${parseFloat(dotSizeSlider.value).toFixed(1)}×`; }],
  [outlineWidthSlider, "input", () => { outlineWidthVal.textContent = `${parseFloat(outlineWidthSlider.value).toFixed(1)}×`; }],
  [removeOceanCheck, "change", null],
  [landOutlineCheck, "change", () => { landOutlineColorField.hidden = !landOutlineCheck.checked; }],
  [landOutlineColorInput, "input", () => { landOutlineColorHex.textContent = landOutlineColorInput.value; }],
  [bgColorInput, "input", () => { bgColorHex.textContent = bgColorInput.value; }],
  [includeAntarcticaCheck, "change", null],
  [detailSlider, "input", () => { detailVal.textContent = `${detailSlider.value}%`; }],
];
_visualControls.forEach(([el, evt, extra]) => {
  el.addEventListener(evt, () => {
    if (extra) extra();
    applyLiveSettings();
  });
});

// Init
activateStep(1);
showCanvas("empty");
