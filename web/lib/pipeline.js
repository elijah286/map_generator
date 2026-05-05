import { loadUserEvents, loadUniversities, readExcelCache, writeExcelCache } from "./excel.js";
import { geocodeAll } from "./geocode.js";
import { renderRegionSvg, REGION_SUFFIX } from "./maps.js";

const REGION_ORDER = ["world", "europe", "asia", "north_america", "south_america"];

export async function runPipeline(buffer, options, log, onProgress) {
  const {
    sheetName,
    mode,
    onlyOnMap = true,
    useMemberSize = false,
    dotColor = null,
    removeOcean = false,
    landOutline = false,
    landOutlineColor = null,
    includeAntarctica = false,
    basename = "map",
    regions = REGION_ORDER,
    apiKey,
    cachePath,
  } = options;

  // Merge Excel-embedded cache into server cache
  const excelCache = readExcelCache(buffer);
  const excelCacheCount = Object.keys(excelCache).length;
  if (excelCacheCount > 0) {
    log?.(`Loaded ${excelCacheCount} cached locations from Excel "cache" sheet.`);
  }

  let rows;
  if (mode === "user_events") {
    rows = loadUserEvents(buffer, sheetName, onlyOnMap);
  } else {
    rows = loadUniversities(buffer, sheetName);
  }

  if (!rows.length) {
    log?.("No rows to plot after filtering.");
    return { files: [], plotted: 0, updatedExcel: null };
  }

  const allRows = await geocodeAll(rows, cachePath, apiKey, log, excelCache, onProgress);
  const geocoded = allRows.filter((r) => r._geocoded);
  log?.(`${geocoded.length} locations with coordinates.`);

  // Write updated cache back into the Excel file
  const { loadCache } = await import("./geocode.js");
  const serverCache = loadCache(cachePath);
  const mergedCache = { ...serverCache, ...excelCache };
  const updatedExcel = writeExcelCache(buffer, mergedCache);

  const base = basename.replace(/[^\w\-]+/g, "_") || "map";
  const files = [];
  const want = new Set(regions);

  for (const key of REGION_ORDER) {
    if (!want.has(key)) continue;
    const suf = REGION_SUFFIX[key];
    const filename = suf ? `${base}${suf}.svg` : `${base}.svg`;
    const svg = renderRegionSvg(key, geocoded, { useMemberSize, dotColor, removeOcean, landOutline, landOutlineColor, includeAntarctica });
    files.push({ filename, svg });
  }

  const details = allRows.map((r) => ({
    location: r.LocationString,
    llmLocation: r._geocoded ? `${r.Latitude}, ${r.Longitude}` : null,
    memberCount: r.MemberCount ?? null,
    onMap: r._geocoded,
  }));

  return { files, plotted: geocoded.length, details, updatedExcel };
}
