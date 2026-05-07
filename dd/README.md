# DivyaDarshan (local)

## Run the UI (with APIs)

1) Create `.env` in the project root (copy from `.env.example`) and fill:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

2) Create Supabase tables (SQL below).

3) Start:

```powershell
npm run dev
```

Open:

- `http://127.0.0.1:3000/updated_dashboard_with_expanded_temples_and_feedback/code.html`

## Supabase schema (minimal)

Run this in Supabase SQL editor:

```sql
create table if not exists public.temple_app_data (
  slug text primary key,
  booking jsonb,
  parking jsonb,
  planner jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.temple_pages (
  slug text primary key,
  source_url text not null,
  title text,
  content_html text,
  updated_at timestamptz default now()
);

create table if not exists public.bookings (
  id text primary key,
  temple_key text not null,
  temple_name text not null,
  visit_date text,
  slot text,
  qty int4 not null,
  phone text,
  ticket_type text,
  source text default 'Online',
  status text default 'Pending',
  created_at timestamptz default now()
);

alter table public.temple_app_data disable row level security;
alter table public.temple_pages disable row level security;
alter table public.bookings disable row level security;
```

## Scrape temple timings/pages (example)

This caches the page into `temple_pages`:

```powershell
$body = @{
  slug = "manjunatha"
  url  = "https://www.ttdsevaonline.net/dharmasthala-temple-darshan-puja-seva-mudi-annadanam-timings/"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/api/scrape -ContentType "application/json" -Body $body
```

Then read it back:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/temple-page/manjunatha
```

## Notes

- The UI now **boots from Supabase** via `GET /api/bootstrap`.
- Scraping is done server-side to avoid browser CORS.
- Only `ttdsevaonline.net` is allowlisted right now (can be expanded in `server.js`).

