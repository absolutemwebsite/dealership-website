# Absolute Motor Cars — Dealership Platform

Public website + internal CRM for **GP Auto Sales Ltd.** (brand: **Absolute Motor Cars**).
Everything runs on **one Railway service**: a Node/Express + SQLite backend that serves
the public site, the staff/owner admin, and the CRM — one login, one database, one deploy.

## Status — build complete

- [x] Public site (`/`) — black/red/chrome design, live inventory, detail modal, 3-mode contact form, WhatsApp button
- [x] Financing application (`/financing`) — 6 sections, vehicle-of-interest picker from live inventory, credit-check consent
- [x] Admin dashboard (`/admin`) — login, inventory CRUD, image upload + reorder, VIN decode (NHTSA vPIC), financing review, message inbox, documents (window sticker, Bill of Sale, delivery waiver)
- [x] CRM (`/crm`) — production board with location tracking, ledger (owner-only), sold tracker with profit calc (owner-only), inspection checklist + printable MFA report, backup / restore
- [x] Server — Express + SQLite (WAL, auto-recovery on volume adoption), JWT auth with owner/staff roles, Resend email hook (optional)

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

## Fill-in-before-launch checklist

In `config.js`, fill the fields marked `⚠ FILL IN`: email, Instagram, hours, tagline, inspection facility name/number, technician name. In `public/admin.js`, replace the `[[PASTE EXACT WAIVER WORDING]]` placeholder inside `waiverHTML()` with the dealership's approved waiver text.

**Have the Bill of Sale + Waiver reviewed by a lawyer or the VSA before using with customers.** The BOS reproduces the master template text verbatim, but formatting or PDF-generation quirks can still shift how a court reads a clause.


