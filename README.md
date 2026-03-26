# Four Walls Trading (Nifty futures & OI tools)

Real-time **Nifty futures OI monitor** using the **Upstox** API. React SPA + Express proxy (`proxy-server.js`).

## Features

- OI monitor (primary UI)
- OAuth with Upstox; callback redirect delivers `?token=` → saved in `localStorage` for API calls
- Polling-based market data (REST, not WebSockets)

## Local development

1. **Install**

   ```bash
   npm install
   ```

2. **Environment**

   - Copy `.env.example` to `.env`, or use `env.local.template` → `.env.local` for a separate Upstox app (see comments in that file).
   - Set `UPSTOX_API_KEY`, `UPSTOX_API_SECRET`, `UPSTOX_REDIRECT_URI` (e.g. `http://localhost:3000/api/auth/callback`), and optionally `FRONTEND_URI` for dev (`http://localhost:5173`).

3. **Run** (two terminals)

   ```bash
   npm run proxy    # API on :3000
   npm run dev      # Vite on :5173
   ```

4. Open the Vite URL, sign in with Upstox when prompted.

## Production

- **Build:** `npm run build` — static assets go to `dist/`.
- **Serve:** `NODE_ENV=production node proxy-server.js` serves `dist/` and `/api/*` (PM2 + Nginx on EC2 is the supported path in `deploy/`).

```bash
npm run build
NODE_ENV=production node proxy-server.js
```

Then open `http://localhost:3000` (or your configured host).

## Project layout

```
├── src/                 # React app (Vite)
├── proxy-server.js      # Express: OAuth, Upstox proxies, static dist in production
├── utils/tokenManager.js # Optional .env token write after OAuth (server)
├── deploy/              # CloudFormation, nginx, ALB, runbooks, CI helpers
└── doc/                 # Helper scripts referenced by deploy docs
```

## npm scripts

| Script    | Purpose                          |
|----------|-----------------------------------|
| `dev`    | Vite dev server                   |
| `proxy`  | Express API + proxy               |
| `build`  | Production frontend build         |
| `lint`   | ESLint                            |
| `preview`| Preview production build (Vite)   |

## Environment variables

**Required for OAuth / API**

- `UPSTOX_API_KEY`, `UPSTOX_API_SECRET`, `UPSTOX_REDIRECT_URI`

**Production**

- `NODE_ENV=production`
- `PORT` (default `3000`)
- `FRONTEND_URI` — public app origin (e.g. `https://app.example.com`)

**Optional**

- `VITE_API_BASE` — override API base in the built SPA (usually empty for same-origin)
- `VITE_INSTRUMENT_KEY` — default instrument if discover fails (dev only for real tokens per `AuthContext`)

## API (selected)

- `GET /api/health` — liveness
- `GET /api/auth/login` — redirect to Upstox
- `GET /api/auth/callback` — OAuth callback
- `GET /api/quotes?instrument_keys=...` — quotes (requires `Authorization: Bearer …`)
- `GET /api/tools/discover-nifty-future` — current Nifty future from master list

## Deployment on AWS

See `deploy/cloudformation.yaml`, `deploy/deploy-live.ps1`, `deploy/deploy-alb-https.ps1`, and `.github/workflows/cd-ec2.yml`. Operational notes: `deploy/CLOUD_INCIDENT_RUNBOOK.md`, `deploy/CLOUDFLARE_TUNNEL.md`, `deploy/ROUTE53.md`.

## Troubleshooting

- **Login:** `UPSTOX_REDIRECT_URI` must match the Upstox developer console exactly; production should use HTTPS.
- **No data:** Confirm a valid token, instrument key, and Upstox API responses in the Network tab.
- **503 on discover:** Server must reach `https://assets.upstox.com` for the instruments gzip.

## License

MIT
