import { loadUserEvents, loadUniversities } from "./excel.js";
import { geocodeAll } from "./geocode.js";
import { renderRegionSvg, REGION_SUFFIX } from "./maps.js";

const REGION_ORDER = ["world", "europe", "asia", "north_america", "south_america"];

export async function runPipeline(buffer, options, log) {
  const {
    sheetName,
    mode,
    onlyOnMap = true,
    useMemberSize = false,
    dotColor = null,
    dotSizeMultiplier = 1,
    outlineWidthMultiplier = 1,
    removeOcean = false,
    landOutline = false,
    landOutlineColor = null,
    basename = "map",
    regions = REGION_ORDER,
    apiKey,
    cachePath,
  } = options;

  let rows;
  if (mode === "user_events") {
    rows = loadUserEvents(buffer, sheetName, onlyOnMap);
  } else {
    rows = loadUniversities(buffer, sheetName);
  }

  if (!rows.length) {
    log?.("No rows to plot after filtering.");
    return { files: [], plotted: 0 };
  }

  const allRows = await geocodeAll(rows, cachePath, apiKey, log);
  const geocoded = allRows.filter((r) => r._geocoded);
  log?.(`${geocoded.length} locations with coordinates.`);

  const base = basename.replace(/[^\w\-]+/g, "_") || "map";
  const files = [];
  const want = new Set(regions);

  for (const key of REGION_ORDER) {
    if (!want.has(key)) continue;
    const suf = REGION_SUFFIX[key];
    const filename = suf ? `${base}${suf}.svg` : `${base}.svg`;
    const svg = renderRegionSvg(key, geocoded, { useMemberSize, dotColor, dotSizeMultiplier, outlineWidthMultiplier, removeOcean, landOutline, landOutlineColor });
    files.push({ filename, svg });
  }

  const details = allRows.map((r) => ({
    location: r.LocationString,
    llmLocation: r._geocoded ? `${r.Latitude}, ${r.Longitude}` : null,
    memberCount: r.MemberCount ?? null,
    onMap: r._geocoded,
  }));

  return { files, plotted: geocoded.length, details };
}
