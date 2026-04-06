# Map Generator (web)

Node.js + Express app: upload Excel, geocode with OpenAI (server-side), download SVG maps.

## Setup

```bash
cd web
npm install
cp .env.example .env
# Edit .env — set OPENAI_API_KEY
npm start
```

Open http://localhost:3847 (or `PORT` from `.env`).

## Railway + GitHub

This repo has **Python files at the root** and the **Node app in `web/`**. Railway’s **Railpack** builder may auto-detect Python and fail unless you do one of the following.

### Option A — Root directory (simplest)

1. **New project** → **Deploy from GitHub** → pick this repo.
2. **Service → Settings → Root directory:** set to **`web`**.
3. **Variables:** add `OPENAI_API_KEY`. Railway sets `PORT` automatically.
4. Deploy. Railpack/Nixpacks will use `web/package.json` and `web/railway.toml`.

### Option B — Build from repo root (default)

The repo root includes **`railpack.json`** so Railpack uses **Node 22**, runs **`npm ci --prefix web`**, and starts with **`npm start --prefix web`**. A minimal root **`package.json`** exposes the same `start` script.

You still need **`OPENAI_API_KEY`** in Railway variables.

`web/railway.toml` sets a **health check** on `GET /health`. The server listens on **`0.0.0.0`**.

After deploy, open the service **public URL** (HTTPS). Optional: add a **volume** for persistent `web/data/location_cache.json` across redeploys.

## Deploy (any host)

1. Node **20+** recommended (`engines` in `package.json`).
2. Set **`OPENAI_API_KEY`** on the host (never commit it).
3. Prefer putting the app behind auth (SSO, VPN, IP allowlist) so the public internet cannot abuse uploads or your key.

The coordinate cache is stored in `data/location_cache.json` on the server filesystem (created on first run).

## Differences from the Python desktop app

- Same Excel modes (user events / universities), regions, and bbox filters.
- SVG maps use **Natural Earth 110m** country shapes + **d3-geo** (visuals are close; not identical to Cartopy).
