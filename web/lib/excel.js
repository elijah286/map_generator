/**
 * Excel → location rows (mirrors Python mapgen_core).
 */
import XLSX from "xlsx";

const CACHE_SHEET = "cache";

export function getSheetNames(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return wb.SheetNames.filter((n) => n !== CACHE_SHEET);
}

/**
 * Read geocode cache from a hidden sheet in the workbook.
 * Returns { "Location String": [lat, lon], ... }
 */
export function readExcelCache(buffer) {
  try {
    const wb = XLSX.read(buffer, { type: "buffer" });
    if (!wb.SheetNames.includes(CACHE_SHEET)) return {};
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[CACHE_SHEET], { defval: "" });
    const cache = {};
    for (const row of rows) {
      const loc = String(row.location || "").trim();
      const lat = parseFloat(row.lat);
      const lon = parseFloat(row.lon);
      if (loc && Number.isFinite(lat) && Number.isFinite(lon)) {
        cache[loc] = [lat, lon];
      }
    }
    return cache;
  } catch {
    return {};
  }
}

/**
 * Write geocode cache into a hidden sheet in the workbook.
 * Returns the updated Excel buffer.
 */
export function writeExcelCache(buffer, cache) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const rows = Object.entries(cache).map(([location, coords]) => ({
    location,
    lat: coords[0],
    lon: coords[1],
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  if (wb.SheetNames.includes(CACHE_SHEET)) {
    wb.Sheets[CACHE_SHEET] = ws;
  } else {
    XLSX.utils.book_append_sheet(wb, ws, CACHE_SHEET);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function findMemberCount(row) {
  const keys = Object.keys(row);
  const k = keys.find((x) => x.toLowerCase().includes("member count"));
  if (k !== undefined && row[k] !== undefined && row[k] !== "") return row[k];
  return undefined;
}

function findCol(row, ...candidates) {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const k = keys.find((x) => x.trim().toLowerCase() === c.toLowerCase());
    if (k !== undefined && row[k] !== undefined && row[k] !== "") return String(row[k]).trim();
  }
  return "";
}

export function loadUserEvents(buffer, sheetName, onlyOnMap) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Worksheet not found: ${sheetName}`);
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  const onKey = columns.find((k) => k.trim().toLowerCase() === "on map?") ?? null;

  let out = rows.map((row) => {
    const city = findCol(row, "City");
    const state = findCol(row, "State");
    const country = findCol(row, "Country");
    const parts = [city, state, country].filter(Boolean);
    return {
      LocationString: parts.join(", "),
      MemberCount: findMemberCount(row),
    };
  });

  const totalBeforeFilter = out.length;
  const nonEmpty = out.filter((r) => r.LocationString.length > 0);
  const totalWithLocation = nonEmpty.length;

  let filtered = nonEmpty;
  let onMapFilterActive = false;
  if (onlyOnMap && onKey) {
    onMapFilterActive = true;
    filtered = nonEmpty.filter((_, i) => {
      const origIdx = out.indexOf(nonEmpty[i]);
      const v = String(rows[origIdx]?.[onKey] ?? "").trim().toLowerCase();
      return v === "yes" || v === "y" || v === "true" || v === "1";
    });
  }

  filtered._meta = {
    columns,
    totalRows: rows.length,
    totalBeforeFilter,
    totalWithLocation,
    onMapColumn: onKey,
    onMapFilterActive,
  };
  return filtered;
}

export function loadUniversities(buffer, sheetName) {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Worksheet not found: ${sheetName}`);

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  let headerRow = 0;
  for (let i = 0; i < matrix.length; i++) {
    const cell = String(matrix[i]?.[0] ?? "")
      .trim()
      .toLowerCase();
    if (cell === "university") {
      headerRow = i;
      break;
    }
  }

  let rows;
  if (headerRow > 0) {
    const sub = XLSX.utils.aoa_to_sheet(matrix.slice(headerRow));
    rows = XLSX.utils.sheet_to_json(sub, { defval: "" });
  } else {
    try {
      rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    } catch {
      const sub = XLSX.utils.aoa_to_sheet(matrix.slice(3));
      rows = XLSX.utils.sheet_to_json(sub, { defval: "" });
    }
  }

  const out = [];
  for (const row of rows) {
    const vals = Object.values(row);
    const university = String(vals[0] ?? "").trim();
    const location = String(vals[1] ?? "").trim();
    if (university.toLowerCase() === "university") continue;
    let locStr = "";
    if (university && location) locStr = `${university}, ${location}`;
    else if (location) locStr = location;
    else if (university) locStr = university;
    if (!locStr) continue;
    out.push({
      LocationString: locStr,
      MemberCount: row["Member Count"] ?? row["Member count"],
    });
  }
  return out;
}
