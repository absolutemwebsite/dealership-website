# Absolute Motor Cars — Dealership Platform

Public website + internal CRM for **GP Auto Sales Ltd.** (brand: **Absolute Motor Cars**).
Everything runs on **one Railway service**: a Node/Express + SQLite backend that serves
the public site, the staff/owner admin, and the CRM — one login, one database, one deploy.

## Status — build in progress
- [x] Phase 1 · Step 1 — server, SQLite schema, two-role auth, vehicle CRUD
- [x] **Phase 1 · Step 2** — public site (black/red/chrome) + live inventory + detail modal + contact form ← *you are here*
- [ ] Steps 3–14 — admin dashboard, image upload, VIN decode, financing, email notifications, documents (window sticker / BOS / waiver)
- [ ] Phase 2 — CRM (production / ledger / sold, inspection PDF, backups)

## Config
Business identity lives in `config.js`. Values marked `⚠ FILL IN` are intentionally blank
(no placeholder data). Fill them before launch: **email, Instagram, hours, tagline,
inspection facility name/number, technician name.** Known values (address, phone, dealer
reg #, GST/PST #) are already set from the master Bill of Sale.

## Deploy (Railway)
1. Push this repo to GitHub.
2. Railway → New Project → Deploy from GitHub repo.
3. Add a **Volume** mounted at `/app/storage` (persists the database + uploaded images).
4. Set environment variables (see `.env.example`):
   - `JWT_SECRET` — long random string
   - `OWNER_USERNAME` / `OWNER_PASSWORD` — strong password
   - `STAFF_USERNAME` / `STAFF_PASSWORD` — strong password
   - `DATA_DIR=/app/storage/data`, `UPLOADS_DIR=/app/storage/uploads`
   - (Resend keys added in a later phase for email)
5. Railway runs `npm start`. Visit the generated URL.
6. On first boot the two logins are seeded from the env vars (watch the deploy logs).

## Local run
```bash
cp .env.example .env      # fill in JWT_SECRET + the 4 login vars
npm install
npm start                 # http://localhost:3000
```

## Verify Step 1 is live
- `GET /api/health` → `{ ok: true }`
- `GET /api/config` → your branding (no secrets)
- `POST /api/auth/login` with the owner creds → returns a token
- `POST /api/vehicles` (with `Authorization: Bearer <token>`) → creates a car
- `GET /api/vehicles` → lists it (public, no auth needed)

## What to commit for this step
`server.js`, `config.js`, `package.json`, `.env.example`, `.gitignore`, `public/index.html`, `README.md`
