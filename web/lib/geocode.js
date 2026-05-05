/**
 * OpenAI geocoding + JSON cache (same behavior as Python).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import OpenAI from "openai";

const COORD_RE = /(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/;

export function parseLatLon(text) {
  if (!text) return null;
  for (const line of String(text).split("\n")) {
    const m = line.match(COORD_RE);
    if (!m) continue;
    const lat = parseFloat(m[1]);
    const lon = parseFloat(m[2]);
    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) return { lat, lon };
  }
  return null;
}

export function loadCache(cachePath) {
  try {
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, "utf8"));
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function saveCache(cachePath, cache) {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf8");
}

export async function geocodeWithGpt(client, locationString) {
  const res = await client.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      {
        role: "system",
        content:
          "You are a geolocation API. Only respond with valid latitude and longitude in the format: 12.34, -56.78. Do not add any explanation or extra words.",
      },
      {
        role: "user",
        content: `What are the latitude and longitude coordinates for ${locationString}?`,
      },
    ],
    temperature: 0,
  });
  const raw = res.choices[0]?.message?.content?.trim() ?? "";
  return parseLatLon(raw);
}

export async function geocodeLocation(locationString, cache, cachePath, apiKey, log) {
  const key = String(locationString).trim();
  if (!key) return null;

  if (cache[key]) {
    const v = cache[key];
    log?.(`Cached: ${key}`);
    return { lat: v[0], lon: v[1] };
  }
  const lower = key.toLowerCase();
  for (const [k, v] of Object.entries(cache)) {
    if (k.toLowerCase() === lower && Array.isArray(v) && v.length >= 2) {
      log?.(`Cached: ${key}`);
      return { lat: v[0], lon: v[1] };
    }
  }

  if (!apiKey) {
    log?.("OPENAI_API_KEY missing");
    return null;
  }

  const client = new OpenAI({ apiKey });
  log?.(`Geocoding: ${key}`);
  const coords = await geocodeWithGpt(client, key);
  if (coords) {
    cache[key] = [coords.lat, coords.lon];
    saveCache(cachePath, cache);
    return coords;
  }
  log?.(`Failed: ${key}`);
  return null;
}

export async function geocodeAll(rows, cachePath, apiKey, log, excelCache = {}) {
  const cache = { ...loadCache(cachePath), ...excelCache };
  const out = [];
  for (const row of rows) {
    const c = await geocodeLocation(row.LocationString, cache, cachePath, apiKey, log);
    out.push({
      ...row,
      Latitude: c?.lat ?? null,
      Longitude: c?.lon ?? null,
      _geocoded: !!c,
    });
  }
  return out;
}
