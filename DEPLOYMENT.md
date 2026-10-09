# Deployment

Qualitas has three distinct ways to run, depending on the environment.
This file exists so you don't have to guess which one to touch.

## Production — Synology NAS

`docker-compose.yml` is the production deployment. It runs on a DS423+
behind a Cloudflare Tunnel and serves traffic at `qualitas.rokusumi.net`.

Three containers:
- `backend` — FastAPI app built from `./backend/Dockerfile`, binds
  `backend/qualitas.db`, `uploads`, `backups`, `logs` as volumes.
- `frontend` — `nginx:alpine` serving the prebuilt `react-app/dist`.
  Uses `nginx.conf` at repo root as the vhost config.
- `cloudflared` — Cloudflare Tunnel client, picks up
  `CLOUDFLARE_TUNNEL_TOKEN` from the environment.

To deploy: build `react-app` (`npm run build`), then
`docker compose up -d --build` on the NAS.

## Development — PM2 (Linux/macOS)

`ecosystem.config.js` runs both processes under PM2 without Docker:
- `qualitas-backend` → `uvicorn main:app` on port 8000
- `qualitas-frontend` → `vite --port 5173` (hot reload)

Use `pm2 start ecosystem.config.js` from the repo root. Good for a
staging host or long-running dev machine.

## Development — Windows scripts

`start-servers.bat` and `start-servers.ps1` launch three processes in
separate windows for local Windows development:
- Python FastAPI backend on port 8000
- Node.js auxiliary backend on port 3001/3002 (see `backend/package.json`)
- Vite dev server on port 3000

These are convenience wrappers, not part of any deployment.

## Tests

Run `cd backend && python -m pytest` for backend unit + integration tests.
Run `cd react-app && npx tsc --noEmit` for the frontend type check.
Both are also wired into CI — see `.github/workflows/ci.yml`.
