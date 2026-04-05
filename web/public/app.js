const fileInput = document.getElementById("file");
const fileLabel = document.getElementById("fileLabel");
const sheetSelect = document.getElementById("sheet");
const goBtn = document.getElementById("go");
const logEl = document.getElementById("log");
const logSection = document.getElementById("logSection");
const dlSection = document.getElementById("dlSection");
const downloads = document.getElementById("downloads");
const keyHint = document.getElementById("keyHint");

let currentFile = null;

fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0];
  currentFile = f || null;
  downloads.innerHTML = "";
  dlSection.hidden = true;
  if (!f) {
    fileLabel.textContent = "No file chosen";
    sheetSelect.innerHTML = "";
    sheetSelect.disabled = true;
    goBtn.disabled = true;
    return;
  }
  fileLabel.textContent = f.name;
  sheetSelect.innerHTML = "";
  sheetSelect.disabled = true;
  goBtn.disabled = true;

  const fd = new FormData();
  fd.append("file", f);
  try {
    const r = await fetch("/api/sheets", { method: "POST", body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || r.statusText);
    for (const name of data.sheets) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sheetSelect.appendChild(opt);
    }
    sheetSelect.disabled = false;
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const preferred = mode === "user_events" ? "FY 2026" : "Schools --> Customers";
    const idx = data.sheets.indexOf(preferred);
    sheetSelect.selectedIndex = idx >= 0 ? idx : 0;
    goBtn.disabled = false;
  } catch (e) {
    fileLabel.textContent = "Error loading sheets";
    alert(String(e.message || e));
  }
});

document.querySelectorAll('input[name="mode"]').forEach((el) => {
  el.addEventListener("change", () => {
    if (!currentFile || sheetSelect.options.length === 0) return;
    const mode = el.value;
    const preferred = mode === "user_events" ? "FY 2026" : "Schools --> Customers";
    for (let i = 0; i < sheetSelect.options.length; i++) {
      if (sheetSelect.options[i].value === preferred) {
        sheetSelect.selectedIndex = i;
        return;
      }
    }
  });
});

goBtn.addEventListener("click", async () => {
  if (!currentFile) return;
  goBtn.disabled = true;
  logSection.hidden = false;
  dlSection.hidden = true;
  downloads.innerHTML = "";
  logEl.textContent = "Generating…\n";

  const regions = [...document.querySelectorAll(".region:checked")].map((c) => c.value);
  if (regions.length === 0) {
    alert("Select at least one map.");
    goBtn.disabled = false;
    return;
  }

  const fd = new FormData();
  fd.append("file", currentFile);
  fd.append("sheetName", sheetSelect.value);
  fd.append("mode", document.querySelector('input[name="mode"]:checked').value);
  fd.append("onlyOnMap", String(document.getElementById("onlyOnMap").checked));
  fd.append("useMemberSize", String(document.getElementById("useMemberSize").checked));
  fd.append("basename", document.getElementById("basename").value.trim() || "map");
  fd.append("regions", JSON.stringify(regions));

  try {
    const r = await fetch("/api/generate", { method: "POST", body: fd });
    const data = await r.json();
    if (!r.ok) {
      keyHint.hidden = !String(data.error || "").includes("OPENAI_API_KEY");
      throw new Error(data.error || r.statusText);
    }
    keyHint.hidden = true;
    logEl.textContent = (data.logs || []).join("\n") + `\n\nPlotted: ${data.plotted} locations.`;
    downloads.innerHTML = "";
    for (const f of data.files || []) {
      const blob = new Blob([f.svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = url;
      a.download = f.filename;
      a.textContent = f.filename;
      a.addEventListener("click", () => setTimeout(() => URL.revokeObjectURL(url), 60_000));
      li.appendChild(a);
      downloads.appendChild(li);
    }
    dlSection.hidden = (data.files || []).length === 0;
  } catch (e) {
    logEl.textContent += "\n\nError: " + (e.message || e);
  } finally {
    goBtn.disabled = false;
  }
});
