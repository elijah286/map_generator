import "dotenv/config";
import express from "express";
import multer from "multer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, existsSync } from "fs";

import { getSheetNames, loadUserEvents, loadUniversities } from "./lib/excel.js";
import { runPipeline } from "./lib/pipeline.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname);
const DATA_DIR = join(ROOT, "data");
const CACHE_PATH = join(DATA_DIR, "location_cache.json");

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const app = express();
app.use(express.static(join(ROOT, "public"), {
  etag: false,
  lastModified: true,
  setHeaders(res) {
    res.set("Cache-Control", "no-cache, must-revalidate");
  },
}));

/** Railway / load balancers */
app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "map-gen-web" });
});

app.post("/api/sheets", upload.single("file"), (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "Missing file" });
    }
    const sheets = getSheetNames(req.file.buffer);
    res.json({ sheets });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/preview", upload.single("file"), (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "Missing file" });
    }
    const sheetName = req.body.sheetName || req.body.sheet;
    if (!sheetName) {
      return res.status(400).json({ error: "sheetName is required" });
    }
    const mode = req.body.mode === "universities" ? "universities" : "user_events";
    const onlyOnMap = req.body.onlyOnMap !== "false" && req.body.onlyOnMap !== false;

    let rows;
    if (mode === "user_events") {
      rows = loadUserEvents(req.file.buffer, sheetName, onlyOnMap);
    } else {
      rows = loadUniversities(req.file.buffer, sheetName);
    }

    const meta = rows._meta || {};
    console.log(`[preview] sheet="${sheetName}" mode=${mode} onlyOnMap=${onlyOnMap} → ${rows.length} locations`);

    res.json({
      ok: true,
      mode,
      sheetName,
      totalLocations: rows.length,
      meta,
      locations: rows.map((r, i) => ({
        index: i + 1,
        location: r.LocationString,
        memberCount: r.MemberCount ?? null,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/generate", upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "Missing Excel file" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        error: "Server is not configured: set OPENAI_API_KEY on the host.",
      });
    }

    const sheetName = req.body.sheetName || req.body.sheet;
    if (!sheetName) {
      return res.status(400).json({ error: "sheetName is required" });
    }

    const mode = req.body.mode === "universities" ? "universities" : "user_events";
    const onlyOnMap = req.body.onlyOnMap !== "false" && req.body.onlyOnMap !== false;
    const useMemberSize = req.body.useMemberSize === "true" || req.body.useMemberSize === true;
    const basename = (req.body.basename || "map").trim() || "map";
    const dotColor = /^#[0-9a-fA-F]{6}$/.test(req.body.dotColor) ? req.body.dotColor : null;

    let regions;
    try {
      regions = JSON.parse(req.body.regions || "[]");
    } catch {
      regions = ["world", "europe", "asia", "north_america", "south_america"];
    }
    if (!Array.isArray(regions) || regions.length === 0) {
      regions = ["world", "europe", "asia", "north_america", "south_america"];
    }

    const logs = [];
    const log = (msg) => logs.push(`[${new Date().toISOString()}] ${msg}`);

    const { files, plotted, details } = await runPipeline(req.file.buffer, {
      sheetName,
      mode,
      onlyOnMap,
      useMemberSize,
      dotColor,
      basename,
      regions,
      apiKey,
      cachePath: CACHE_PATH,
    }, log);

    res.json({
      ok: true,
      plotted,
      logs,
      details,
      files: files.map((f) => ({
        filename: f.filename,
        svg: f.svg,
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

const PORT = Number(process.env.PORT) || 3847;
const HOST = process.env.HOST || "0.0.0.0";

import { execSync } from "child_process";

function killExistingOnPort(port) {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: "utf8" })
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
      .filter((p) => p !== process.pid);
    for (const pid of pids) {
      try { process.kill(pid, "SIGTERM"); } catch {}
    }
    if (pids.length) console.log(`Killed existing process(es) on port ${port}: ${pids.join(", ")}`);
  } catch {
    // lsof exits non-zero when nothing found — that's fine
  }
}

killExistingOnPort(PORT);

app.listen(PORT, HOST, () => {
  const display = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`Map Generator web → http://${display}:${PORT}`);
});
