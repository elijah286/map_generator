/**
 * SVG maps via d3-geo + Natural Earth 110m countries (Plate Carree–style view).
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import * as d3 from "d3-geo";
import { feature } from "topojson-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOPO_PATH = join(__dirname, "../node_modules/world-atlas/countries-110m.json");

let _landFc = null;
function landFeatureCollection() {
  if (_landFc) return _landFc;
  const topo = JSON.parse(readFileSync(TOPO_PATH, "utf8"));
  _landFc = feature(topo, topo.objects.countries);
  return _landFc;
}

export const REGION_FILTERS = {
  world: () => true,
  europe: (p) =>
    p.Latitude >= 35 && p.Latitude <= 70 && p.Longitude >= -10 && p.Longitude <= 40,
  asia: (p) =>
    p.Latitude >= -10 && p.Latitude <= 55 && p.Longitude >= 60 && p.Longitude <= 150,
  north_america: (p) =>
    p.Latitude >= 15 && p.Latitude <= 75 && p.Longitude >= -170 && p.Longitude <= -50,
  south_america: (p) =>
    p.Latitude >= -60 && p.Latitude <= 15 && p.Longitude >= -85 && p.Longitude <= -30,
};

/** [lonMin, lonMax, latMin, latMax] — matches cartopy PlateCarree set_extent */
export const REGION_EXTENTS = {
  world: null,
  europe: [-10, 40, 35, 70],
  asia: [60, 150, -10, 55],
  north_america: [-170, -50, 15, 75],
  south_america: [-85, -30, -60, 15],
};

export const REGION_SUFFIX = {
  world: "",
  europe: "_europe",
  asia: "_asia",
  north_america: "_north_america",
  south_america: "_south_america",
};

function bboxFeature(lonMin, lonMax, latMin, latMax) {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lonMin, latMin],
          [lonMax, latMin],
          [lonMax, latMax],
          [lonMin, latMax],
          [lonMin, latMin],
        ],
      ],
    },
  };
}

function defaultPointRadius(useSize, memberCount) {
  if (!useSize || memberCount == null || memberCount === "") return 4;
  const n = Number(memberCount);
  if (!Number.isFinite(n)) return 4;
  const r = Math.sqrt(Math.max(0, n) * 2) / 4;
  return Math.max(2.5, Math.min(18, r));
}

export function renderRegionSvg(regionKey, points, opts = {}) {
  const { useMemberSize = false } = opts;
  const width = 1800;
  const height = 900;
  const pad = 24;
  const landFc = landFeatureCollection();

  const extent = REGION_EXTENTS[regionKey];
  const filter = REGION_FILTERS[regionKey];
  const data = points.filter((p) => filter(p));

  let projection;
  if (!extent) {
    projection = d3.geoEquirectangular().fitExtent(
      [[pad, pad], [width - pad, height - pad]],
      landFc
    );
  } else {
    const [lonMin, lonMax, latMin, latMax] = extent;
    projection = d3.geoEquirectangular().fitExtent(
      [[pad, pad], [width - pad, height - pad]],
      bboxFeature(lonMin, lonMax, latMin, latMax)
    );
  }

  const path = d3.geoPath(projection);

  const paths = landFc.features
    .map((f) => {
      const d = path(f);
      if (!d) return "";
      return `<path d="${d}" fill="#e4e2dc" stroke="#b8b6b0" stroke-width="0.35"/>`;
    })
    .join("\n");

  const circles = data
    .map((p) => {
      const lon = p.Longitude;
      const lat = p.Latitude;
      const xy = projection([lon, lat]);
      if (!xy || xy.some((n) => !Number.isFinite(n))) return "";
      const [x, y] = xy;
      const r = defaultPointRadius(useMemberSize, p.MemberCount);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(2)}" fill="#1a7f37" stroke="#0d3d1a" stroke-width="0.5" opacity="0.9"/>`;
    })
    .filter(Boolean)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#e8eef5"/>
  <g class="land">${paths}</g>
  <g class="points">${circles}</g>
</svg>`;
}
