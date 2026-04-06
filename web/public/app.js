const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const fileInput      = $("#file");
const dropZone       = $("#dropZone");
const dropText       = $("#dropText");
const sheetRow       = $("#sheetRow");
const sheetSelect    = $("#sheet");
const modeSelect     = $("#mode");
const onMapRow       = $("#onMapRow");
const onlyOnMap      = $("#onlyOnMap");
const previewBtn     = $("#previewBtn");
const panelLocations = $("#panelLocations");
const locMeta        = $("#locMeta");
const locBody        = $("#locBody");
const panelGenerate  = $("#panelGenerate");
const goBtn          = $("#goBtn");
const errorHint      = $("#errorHint");
const panelResults   = $("#panelResults");
const resultsMeta    = $("#resultsMeta");
const mapsContainer  = $("#mapsContainer");
const logEl          = $("#log");
const logDetails     = $("#logDetails");

let currentFile = null;

const REGION_LABELS = {
  world: "World",
  europe: "Europe",
  asia: "Asia",
  north_america: "North America",
  south_america: "South America",
};

// ── File handling ──────────────────────────────────────────

function handleFile(file) {
  if (!file) return;
  currentFile = file;
  dropZone.classList.add("has-file");
  dropText.textContent = file.name;
  resetFrom("locations");
  loadSheets();
}

fileInput.addEventListener("change", () => {
  handleFile(fileInput.files?.[0]);
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
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

// ── Sheets ─────────────────────────────────────────────────

async function loadSheets() {
  if (!currentFile) return;
  const fd = new FormData();
  fd.append("file", currentFile);
  try {
    const res = await fetch("/api/sheets", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    sheetSelect.innerHTML = "";
    for (const name of data.sheets) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sheetSelect.appendChild(opt);
    }
    sheetSelect.disabled = false;
    autoSelectSheet();
    sheetRow.hidden = false;
    onMapRow.hidden = false;
    previewBtn.hidden = false;
  } catch (e) {
    alert("Could not read sheets: " + e.message);
  }
}

function autoSelectSheet() {
  const mode = modeSelect.value;
  const preferred = mode === "user_events" ? "FY 2026" : "Schools --> Customers";
  for (let i = 0; i < sheetSelect.options.length; i++) {
    if (sheetSelect.options[i].value === preferred) {
      sheetSelect.selectedIndex = i;
      return;
    }
  }
  sheetSelect.selectedIndex = 0;
}

modeSelect.addEventListener("change", () => {
  onMapRow.hidden = modeSelect.value !== "user_events";
  autoSelectSheet();
  resetFrom("locations");
});

// ── Preview ────────────────────────────────────────────────

previewBtn.addEventListener("click", loadPreview);

async function loadPreview() {
  if (!currentFile) return;
  previewBtn.disabled = true;
  previewBtn.innerHTML = '<span class="spinner"></span>Reading…';
  resetFrom("locations");

  const fd = new FormData();
  fd.append("file", currentFile);
  fd.append("sheetName", sheetSelect.value);
  fd.append("mode", modeSelect.value);
  fd.append("onlyOnMap", String(onlyOnMap.checked));

  try {
    const res = await fetch("/api/preview", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    showLocations(data);
  } catch (e) {
    alert("Preview error: " + e.message);
  } finally {
    previewBtn.disabled = false;
    previewBtn.textContent = "Load locations";
  }
}

function showLocations(data) {
  const hasMember = data.locations.some((l) => l.memberCount != null && l.memberCount !== "");
  locMeta.textContent = `${data.totalLocations} location${data.totalLocations !== 1 ? "s" : ""} found on sheet "${data.sheetName}" (${data.mode === "user_events" ? "user events" : "universities"}).`;

  locBody.innerHTML = "";
  for (const loc of data.locations) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${loc.index}</td><td>${esc(loc.location)}</td><td>${hasMember && loc.memberCount != null ? esc(String(loc.memberCount)) : "—"}</td>`;
    locBody.appendChild(tr);
  }

  panelLocations.hidden = false;
  panelGenerate.hidden = false;
  panelGenerate.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ── Generate ───────────────────────────────────────────────

goBtn.addEventListener("click", generate);

async function generate() {
  if (!currentFile) return;
  const regions = $$(".region:checked").map((c) => c.value);
  if (!regions.length) {
    errorHint.textContent = "Select at least one region.";
    errorHint.hidden = false;
    return;
  }
  errorHint.hidden = true;
  goBtn.disabled = true;
  goBtn.innerHTML = '<span class="spinner"></span>Generating…';

  const fd = new FormData();
  fd.append("file", currentFile);
  fd.append("sheetName", sheetSelect.value);
  fd.append("mode", modeSelect.value);
  fd.append("onlyOnMap", String(onlyOnMap.checked));
  fd.append("useMemberSize", String($("#useMemberSize").checked));
  fd.append("basename", "map");
  fd.append("regions", JSON.stringify(regions));

  try {
    const res = await fetch("/api/generate", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) {
      if (String(data.error).includes("OPENAI_API_KEY")) {
        errorHint.innerHTML = 'Server needs <code>OPENAI_API_KEY</code> set on the host.';
      } else {
        errorHint.textContent = data.error || "Generation failed.";
      }
      errorHint.hidden = false;
      return;
    }
    showResults(data, regions);
  } catch (e) {
    errorHint.textContent = String(e.message || e);
    errorHint.hidden = false;
  } finally {
    goBtn.disabled = false;
    goBtn.textContent = "Generate";
  }
}

function showResults(data, regions) {
  resultsMeta.textContent = `${data.plotted} location${data.plotted !== 1 ? "s" : ""} plotted.`;
  mapsContainer.innerHTML = "";

  for (const f of data.files || []) {
    const card = document.createElement("div");
    card.className = "map-card";

    const regionKey = extractRegionKey(f.filename);
    const label = REGION_LABELS[regionKey] || f.filename;

    const blob = new Blob([f.svg], { type: "image/svg+xml" });
    const dlUrl = URL.createObjectURL(blob);

    card.innerHTML = `
      <div class="map-card-header">
        <span class="map-card-title">${esc(label)}</span>
        <a class="map-card-dl" href="${dlUrl}" download="${esc(f.filename)}">Download SVG</a>
      </div>
      <div class="map-card-body"></div>
    `;

    const body = card.querySelector(".map-card-body");
    body.innerHTML = f.svg.replace(/<\?xml[^?]*\?>/, "");

    mapsContainer.appendChild(card);
  }

  logEl.textContent = (data.logs || []).join("\n");
  panelResults.hidden = false;
  panelResults.scrollIntoView({ behavior: "smooth", block: "start" });
}

function extractRegionKey(filename) {
  if (filename.includes("_europe"))        return "europe";
  if (filename.includes("_asia"))          return "asia";
  if (filename.includes("_north_america")) return "north_america";
  if (filename.includes("_south_america")) return "south_america";
  return "world";
}

// ── Utilities ──────────────────────────────────────────────

function resetFrom(level) {
  if (level === "locations") {
    panelLocations.hidden = true;
    locBody.innerHTML = "";
    panelGenerate.hidden = true;
  }
  panelResults.hidden = true;
  mapsContainer.innerHTML = "";
  errorHint.hidden = true;
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
