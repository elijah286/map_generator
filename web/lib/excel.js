/**
 * Excel → location rows (mirrors Python mapgen_core).
 */
import XLSX from "xlsx";

export function getSheetNames(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return wb.SheetNames;
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
  const onKey =
    rows.length > 0
      ? Object.keys(rows[0]).find((k) => k.trim().toLowerCase() === "on map?")
      : null;

  let out = rows.map((row) => {
    const city = findCol(row, "City");
    const state = findCol(row, "State");
    const country = findCol(row, "Country");
    const parts = [city, state, country].filter(Boolean);
    return {
      LocationString: parts.join(", "),
      MemberCount: row["Member Count"] ?? row["Member count"] ?? row["member count"],
    };
  });

  if (onlyOnMap && onKey) {
    out = out.filter((_, i) => {
      const v = String(rows[i][onKey] ?? "")
        .trim()
        .toLowerCase();
      return v === "yes";
    });
  }

  return out.filter((r) => r.LocationString.length > 0);
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
