/**
 * SVG maps via d3-geo + Natural Earth (110m for world, 50m for regions).
 * Supports multiple detail levels via topojson-simplify.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import * as d3 from "d3-geo";
import { feature } from "topojson-client";
import { presimplify, simplify, quantile } from "topojson-simplify";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOPO_110 = join(__dirname, "../node_modules/world-atlas/countries-110m.json");
const TOPO_50 = join(__dirname, "../node_modules/world-atlas/countries-50m.json");

// Detail levels: quantile values for simplification (0 = max simplify, 1 = full detail)
// These are the quantile thresholds: lower = more simplified
const DETAIL_LEVELS = [0, 25, 50, 75];  // 100 is full detail (original)
const DETAIL_QUANTILES = {
  0:  0.01,   // very simplified — continental outlines
  25: 0.05,   // simplified — major country shapes
  50: 0.15,   // moderate — clear country borders
  75: 0.40,   // mostly detailed
};

const _topoCache = {};
function loadTopo(path) {
  if (_topoCache[path]) return _topoCache[path];
  _topoCache[path] = JSON.parse(readFileSync(path, "utf8"));
  return _topoCache[path];
}

const _simplifiedCache = {};
function getSimplifiedFeatures(topoPath, level) {
  const cacheKey = `${topoPath}:${level}`;
  if (_simplifiedCache[cacheKey]) return _simplifiedCache[cacheKey];

  const topo = loadTopo(topoPath);
  const pre = presimplify({ ...topo, objects: { ...topo.objects } });
  const q = quantile(pre, DETAIL_QUANTILES[level]);
  const simplified = simplify(pre, q);
  const fc = feature(simplified, simplified.objects.countries);
  _simplifiedCache[cacheKey] = fc;
  return fc;
}

function loadFeatures(topoPath) {
  const cacheKey = `${topoPath}:full`;
  if (_simplifiedCache[cacheKey]) return _simplifiedCache[cacheKey];
  const topo = loadTopo(topoPath);
  const fc = feature(topo, topo.objects.countries);
  _simplifiedCache[cacheKey] = fc;
  return fc;
}

export const REGION_FILTERS = {
  world: () => true,
  europe: (p) =>
    p.Latitude >= 35 && p.Latitude <= 70 && p.Longitude >= -12 && p.Longitude <= 42,
  asia: (p) =>
    p.Latitude >= -10 && p.Latitude <= 55 && p.Longitude >= 60 && p.Longitude <= 150,
  north_america: (p) =>
    p.Latitude >= 15 && p.Latitude <= 75 && p.Longitude >= -170 && p.Longitude <= -50,
  south_america: (p) =>
    p.Latitude >= -60 && p.Latitude <= 15 && p.Longitude >= -85 && p.Longitude <= -30,
};

/** [lonMin, lonMax, latMin, latMax] */
export const REGION_EXTENTS = {
  world: null,
  europe: [-12, 42, 34, 72],
  asia: [55, 155, -15, 58],
  north_america: [-172, -48, 12, 78],
  south_america: [-88, -28, -62, 18],
};

const REGION_CANVAS = {
  world: [2400, 1200],
  europe: [2400, 2000],
  asia: [2800, 1800],
  north_america: [2200, 2600],
  south_america: [2000, 2600],
};

export const REGION_SUFFIX = {
  world: "",
  europe: "_europe",
  asia: "_asia",
  north_america: "_north_america",
  south_america: "_south_america",
};

/**
 * Build a mercator projection manually fitted to a lon/lat extent.
 * This avoids d3's fitExtent + bboxFeature which fails for regional polygons
 * due to spherical geometry interpretation.
 */
function buildRegionalProjection(lonMin, lonMax, latMin, latMax, width, height, pad) {
  const centerLon = (lonMin + lonMax) / 2;
  const centerLat = (latMin + latMax) / 2;
  const usableW = width - 2 * pad;
  const usableH = height - 2 * pad;

  const proj = d3.geoMercator()
    .center([centerLon, centerLat])
    .translate([width / 2, height / 2])
    .scale(1);

  const sw = proj([lonMin, latMin]);
  const ne = proj([lonMax, latMax]);
  if (!sw || !ne) return proj;

  const projW = Math.abs(ne[0] - sw[0]);
  const projH = Math.abs(ne[1] - sw[1]);

  const scale = Math.min(usableW / projW, usableH / projH);

  return d3.geoMercator()
    .center([centerLon, centerLat])
    .translate([width / 2, height / 2])
    .scale(scale);
}

function pointRadius(useSize, memberCount, isRegional) {
  const base = isRegional ? 5.5 : 4;
  if (!useSize || memberCount == null || memberCount === "") return base;
  const n = Number(memberCount);
  if (!Number.isFinite(n)) return base;
  const r = Math.sqrt(Math.max(0, n) * 2) / 3;
  return Math.max(base * 0.6, Math.min(base * 4, r));
}

function darkenHex(hex, factor = 0.5) {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Build projection for a region.
 */
function buildProjection(regionKey, landFc, width, height, pad, extent) {
  if (!extent) {
    return d3.geoEquirectangular().fitExtent(
      [[pad, pad], [width - pad, height - pad]],
      landFc
    );
  }
  const [lonMin, lonMax, latMin, latMax] = extent;
  return buildRegionalProjection(lonMin, lonMax, latMin, latMax, width, height, pad);
}

/**
 * Build clip def for a region.
 */
function buildClipDef(regionKey, projection, extent) {
  if (!extent) return "";
  const [lonMin, lonMax, latMin, latMax] = extent;
  const tl = projection([lonMin, latMax]);
  const br = projection([lonMax, latMin]);
  if (!tl || !br) return "";
  const cx = Math.min(tl[0], br[0]) - 2;
  const cy = Math.min(tl[1], br[1]) - 2;
  const cw = Math.abs(br[0] - tl[0]) + 4;
  const ch = Math.abs(br[1] - tl[1]) + 4;
  return `<defs><clipPath id="clip-${regionKey}"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}"/></clipPath></defs>`;
}

export function renderRegionSvg(regionKey, points, opts = {}) {
  const { useMemberSize = false, dotColor = null, removeOcean = false, landOutline = false, landOutlineColor = null, includeAntarctica = false } = opts;
  const fill = dotColor || "#1a7f37";
  const stroke = dotColor ? darkenHex(dotColor) : "#0d3d1a";
  const isRegional = regionKey !== "world";
  const topoPath = isRegional ? TOPO_50 : TOPO_110;
  const landFc = loadFeatures(topoPath);
  const [width, height] = REGION_CANVAS[regionKey] || [2400, 1200];
  const pad = isRegional ? 40 : 24;

  const extent = REGION_EXTENTS[regionKey];
  const filter = REGION_FILTERS[regionKey];
  const data = points.filter((p) => filter(p));

  const projection = buildProjection(regionKey, landFc, width, height, pad, extent);
  const path = d3.geoPath(projection);
  const clipDef = buildClipDef(regionKey, projection, extent);

  // Pre-compute simplified paths for each detail level
  const simplifiedFcs = {};
  const simplifiedPaths = {};
  for (const level of DETAIL_LEVELS) {
    simplifiedFcs[level] = getSimplifiedFeatures(topoPath, level);
    simplifiedPaths[level] = d3.geoPath(projection);
  }

  const strokeW = isRegional ? 0.5 : 0.35;
  const landFill = landOutline ? "none" : "#e4e2dc";
  const landStroke = landOutline && landOutlineColor ? landOutlineColor : "#b8b6b0";
  const landStrokeW = landOutline ? (isRegional ? 1 : 0.7) : strokeW;

  // Build paths: each feature gets its full-detail `d` plus simplified `data-d-*` attributes
  const featureFilter = (f) => includeAntarctica || f.id !== "010";
  const pathElements = landFc.features
    .filter(featureFilter)
    .map((f, idx) => {
      const d = path(f);
      if (!d) return "";

      // Build simplified d attributes
      const simplifiedAttrs = DETAIL_LEVELS.map((level) => {
        const simpleFc = simplifiedFcs[level];
        // Match by index — features are in the same order
        const simpleF = simpleFc.features.find(sf => sf.id === f.id);
        if (!simpleF) return `data-d-${level}=""`;
        const sd = simplifiedPaths[level](simpleF);
        return `data-d-${level}="${sd || ""}"`;
      }).join(" ");

      const area = d3.geoArea(f);
      return `<path d="${d}" ${simplifiedAttrs} fill="${landFill}" stroke="${landStroke}" stroke-width="${landStrokeW}" data-country-id="${f.id}" data-area="${area.toExponential(3)}"/>`;
    })
    .join("\n");

  const circles = data
    .map((p) => {
      const xy = projection([p.Longitude, p.Latitude]);
      if (!xy || xy.some((n) => !Number.isFinite(n))) return "";
      const [x, y] = xy;
      if (x < -10 || x > width + 10 || y < -10 || y > height + 10) return "";
      const r = pointRadius(useMemberSize, p.MemberCount, isRegional);
      const sw = isRegional ? 0.7 : 0.5;
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" opacity="0.9"/>`;
    })
    .filter(Boolean)
    .join("\n");

  const clipAttr = clipDef ? ` clip-path="url(#clip-${regionKey})"` : "";
  const bgRect = removeOcean ? '' : '<rect width="100%" height="100%" fill="#e8eef5"/>';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${clipDef}
  ${bgRect}
  <g class="land"${clipAttr}>${pathElements}</g>
  <g class="points">${circles}</g>
</svg>`;
}
