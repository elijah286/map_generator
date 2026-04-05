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

This repo mixes Python (optional) and Node in `web/`. Point Railway at **only the Node app**:

1. **New project** → **Deploy from GitHub** → pick this repo.
2. **Service → Settings → Root directory:** set to `web` (critical).
3. **Variables:** add `OPENAI_API_KEY` (your secret key). Railway injects `PORT` automatically — do not set `PORT` unless you know you need to.
4. Deploy. Nixpacks will run `npm install` / `npm ci` and `npm start` per `package.json` and `railway.toml`.

`railway.toml` in `web/` sets `startCommand`, a **health check** on `GET /health`, and a 300s healthcheck timeout. The server binds to **`0.0.0.0`**, which Railway’s proxy expects.

After deploy, open the generated **public URL** (HTTPS). Optional: enable Railway **cron** or **volume** later if you need a persistent `data/location_cache.json` across deploys (ephemeral disk resets on redeploy unless you add a volume).

## Deploy (any host)

1. Node **20+** recommended (`engines` in `package.json`).
2. Set **`OPENAI_API_KEY`** on the host (never commit it).
3. Prefer putting the app behind auth (SSO, VPN, IP allowlist) so the public internet cannot abuse uploads or your key.

The coordinate cache is stored in `data/location_cache.json` on the server filesystem (created on first run).

## Differences from the Python desktop app

- Same Excel modes (user events / universities), regions, and bbox filters.
- SVG maps use **Natural Earth 110m** country shapes + **d3-geo** (visuals are close; not identical to Cartopy).
