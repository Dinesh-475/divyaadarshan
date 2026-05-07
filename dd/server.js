const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cheerio = require('cheerio');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_FROM = process.env.TWILIO_FROM || ''; // whatsapp:+14155238886 (sandbox) or +1...
const TWILIO_CHANNEL = (process.env.TWILIO_CHANNEL || '').toLowerCase(); // 'whatsapp' or 'sms'

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  // Server can still run to serve static UI, but APIs will error clearly.
  console.warn('[divyadarshan] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
const BUILD_ID = new Date().toISOString();

// Serve the existing static project (so one command runs everything)
app.use(express.static(path.join(__dirname)));

function requireSupabase(req, res) {
  if (!supabase) {
    res.status(500).json({
      error:
        'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in a .env file.',
    });
    return false;
  }
  return true;
}

function normalizeTwilioTo(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // If user provided +..., keep it; else assume E.164-ish by prefixing +.
  const e164 = raw.startsWith('+') ? raw : `+${digits}`;
  if (TWILIO_CHANNEL === 'whatsapp') return `whatsapp:${e164}`;
  return e164;
}

async function twilioSendMessage({ to, body }) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM) {
    throw new Error('Twilio not configured (missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM)');
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`;
  const params = new URLSearchParams();
  params.set('To', to);
  params.set('From', TWILIO_FROM);
  params.set('Body', body);

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const text = await resp.text().catch(() => '');
  if (!resp.ok) throw new Error(`Twilio send failed (${resp.status}): ${text}`);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function buildBookingConfirmationText(b) {
  const lines = [];
  lines.push('✅ Divya Darshan — Ticket Confirmed');
  lines.push(`Ticket ID: ${b.id}`);
  lines.push(`Temple: ${b.temple_name}`);
  if (b.visit_date) lines.push(`Date: ${b.visit_date}`);
  if (b.slot) lines.push(`Slot: ${b.slot}`);
  lines.push(`People: ${b.qty}`);
  if (b.ticket_type) lines.push(`Type: ${b.ticket_type}`);
  lines.push('');
  lines.push('Show this Ticket ID at the gate.');
  return lines.join('\n');
}

const ALLOWED_SCRAPE_HOSTS = new Set(['www.ttdsevaonline.net', 'ttdsevaonline.net']);

function isAllowedUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    return ALLOWED_SCRAPE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

async function scrapeTempleArticle(url) {
  const resp = await fetch(url, {
    headers: {
      'user-agent':
        'DivyaDarshanBot/1.0 (educational project; contact: local-dev) Node.js fetch',
      accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!resp.ok) throw new Error(`Fetch failed (${resp.status})`);
  const html = await resp.text();
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('title').first().text().trim() ||
    $('h1').first().text().trim();

  // Most WP pages: .entry-content contains the useful text
  const entry = $('.entry-content').first();
  const contentHtml = entry.length ? entry.html() : $('body').html();

  const textSample = (entry.length ? entry.text() : $('body').text())
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);

  return { title: title || 'Temple details', contentHtml: contentHtml || '', textSample };
}

async function geocodePlace(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({ q: query, format: 'json', limit: '1' }).toString();
  const resp = await fetch(url, {
    headers: { 'user-agent': 'DivyaDarshan/1.0 (local dev)' },
  });
  if (!resp.ok) throw new Error(`Geocoding failed (${resp.status})`);
  const data = await resp.json();
  if (!data || data.length === 0) return null;
  return { lat: Number(data[0].lat), lon: Number(data[0].lon), displayName: data[0].display_name };
}

async function googleGeocode(query) {
  if (!GOOGLE_API_KEY) throw new Error('Missing GOOGLE_API_KEY');
  const url =
    'https://maps.googleapis.com/maps/api/geocode/json?' +
    new URLSearchParams({ address: query, key: GOOGLE_API_KEY }).toString();
  const resp = await fetch(url);
  const json = await resp.json();
  if (json.status !== 'OK' || !json.results?.[0]) {
    const msg = json?.error_message ? ` (${json.error_message})` : '';
    throw new Error(`Google Geocode failed: ${json.status}${msg}`);
  }
  const r = json.results[0];
  return {
    lat: r.geometry.location.lat,
    lon: r.geometry.location.lng,
    displayName: r.formatted_address,
    placeId: r.place_id,
  };
}

async function googleNearby({ lat, lon, radius, type, keyword }) {
  if (!GOOGLE_API_KEY) throw new Error('Missing GOOGLE_API_KEY');
  const url =
    'https://maps.googleapis.com/maps/api/place/nearbysearch/json?' +
    new URLSearchParams({
      location: `${lat},${lon}`,
      radius: String(radius || 3000),
      type: type || '',
      keyword: keyword || '',
      key: GOOGLE_API_KEY,
    }).toString();
  const resp = await fetch(url);
  const json = await resp.json();
  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places Nearby failed: ${json.status}`);
  }
  return json.results || [];
}

async function googleDirections({ origin, destLat, destLon }) {
  if (!GOOGLE_API_KEY) throw new Error('Missing GOOGLE_API_KEY');
  const url =
    'https://maps.googleapis.com/maps/api/directions/json?' +
    new URLSearchParams({
      origin,
      destination: `${destLat},${destLon}`,
      mode: 'driving',
      departure_time: 'now',
      key: GOOGLE_API_KEY,
    }).toString();
  const resp = await fetch(url);
  const json = await resp.json();
  if (json.status !== 'OK' || !json.routes?.[0]?.legs?.[0]) throw new Error(`Google Directions failed: ${json.status}`);
  const leg = json.routes[0].legs[0];
  return {
    distance_text: leg.distance?.text || '',
    duration_text: leg.duration?.text || '',
    duration_in_traffic_text: leg.duration_in_traffic?.text || leg.duration?.text || '',
    googleMapsUrl:
      'https://www.google.com/maps/dir/?api=1&origin=' +
      encodeURIComponent(origin) +
      '&destination=' +
      encodeURIComponent(`${destLat},${destLon}`),
  };
}

async function osrmRoute(from, to) {
  // Public OSRM server (no traffic; shortest/fastest based on typical speeds)
  const url =
    'https://router.project-osrm.org/route/v1/driving/' +
    `${from.lon},${from.lat};${to.lon},${to.lat}` +
    '?' +
    new URLSearchParams({
      overview: 'full',
      geometries: 'geojson',
      steps: 'false',
    }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const resp = await fetch(url, { headers: { 'user-agent': 'DivyaDarshan/1.0 (local dev)' }, signal: controller.signal });
  clearTimeout(timeout);
  if (!resp.ok) throw new Error(`OSRM failed (${resp.status})`);
  const json = await resp.json();
  const route = json?.routes?.[0];
  if (!route) throw new Error('OSRM returned no route');
  return {
    distance_m: route.distance,
    duration_s: route.duration,
    geometry: route.geometry, // GeoJSON LineString
  };
}

const wikiCache = new Map(); // key -> { value, expiresAt }
function cacheGet(key) {
  const v = wikiCache.get(key);
  if (!v) return null;
  if (Date.now() > v.expiresAt) {
    wikiCache.delete(key);
    return null;
  }
  return v.value;
}
function cacheSet(key, value, ttlMs) {
  wikiCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function wikiThumbnailForName(name) {
  const key = `wikiThumb:${name}`;
  const cached = cacheGet(key);
  if (cached !== null) return cached;

  const q = String(name || '').trim();
  if (!q) return null;

  // 1) Search
  const searchUrl =
    'https://en.wikipedia.org/w/api.php?' +
    new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: q,
      format: 'json',
      origin: '*',
      srlimit: '1',
    }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  const resp = await fetch(searchUrl, { signal: controller.signal, headers: { 'user-agent': 'DivyaDarshan/1.0 (local dev)' } });
  clearTimeout(timeout);
  if (!resp.ok) {
    cacheSet(key, null, 10 * 60_000);
    return null;
  }
  const json = await resp.json();
  const title = json?.query?.search?.[0]?.title;
  if (!title) {
    cacheSet(key, null, 10 * 60_000);
    return null;
  }

  // 2) Get summary with thumbnail
  const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const resp2 = await fetch(sumUrl, { headers: { 'user-agent': 'DivyaDarshan/1.0 (local dev)' } });
  if (!resp2.ok) {
    cacheSet(key, null, 10 * 60_000);
    return null;
  }
  const sum = await resp2.json();
  const thumb = sum?.thumbnail?.source || null;
  cacheSet(key, thumb, 24 * 60 * 60_000);
  return thumb;
}

async function overpassNearby(lat, lon, radiusMeters) {
  const qForRadius = (r) => `
[out:json][timeout:25];
(
  node(around:${r},${lat},${lon})["amenity"~"hotel|guest_house|hostel|restaurant|cafe"];
  node(around:${r},${lat},${lon})["tourism"~"attraction|museum|viewpoint"];
);
out body 60;
`;

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter',
  ];

  const radii = [radiusMeters, Math.floor(radiusMeters * 0.6), Math.floor(radiusMeters * 0.4)];

  let lastErr = null;
  for (const r of radii) {
    const q = qForRadius(r);
    for (const ep of endpoints) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch(ep, {
          method: 'POST',
          headers: { 'content-type': 'text/plain', 'user-agent': 'DivyaDarshan/1.0 (local dev)' },
          body: q,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!resp.ok) {
          lastErr = new Error(`Overpass failed (${resp.status}) @ ${ep}`);
          continue;
        }
        const json = await resp.json();
        return json?.elements || [];
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr || new Error('Overpass failed');
}

function haversineKm(a, b) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function geminiGenerateJson(prompt) {
  if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
  // Pick an available model dynamically (different projects/regions expose different sets).
  async function listModels() {
    const resp = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(GEMINI_API_KEY),
      { headers: { 'user-agent': 'DivyaDarshan/1.0 (local dev)' } }
    );
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      throw new Error(`Gemini ListModels failed (${resp.status}): ${t}`);
    }
    const json = await resp.json();
    const models = (json?.models || []).filter(
      (m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent')
    );
    if (models.length === 0) throw new Error('No Gemini model supports generateContent for this key');
    return models.map((m) => m.name).filter(Boolean);
  }

  const modelNames = await listModels();
  // Prefer faster/cheaper "flash" models when available.
  modelNames.sort((a, b) => {
    const aFlash = /flash/i.test(a) ? 0 : 1;
    const bFlash = /flash/i.test(b) ? 0 : 1;
    if (aFlash !== bFlash) return aFlash - bFlash;
    return a.localeCompare(b);
  });

  const makeReq = async (modelName) => {
    const endpoint =
      'https://generativelanguage.googleapis.com/v1beta/' +
      modelName +
      ':generateContent?key=' +
      encodeURIComponent(GEMINI_API_KEY);
    return await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
      }),
    });
  };

  let lastErrText = '';
  for (const modelName of modelNames.slice(0, 5)) {
    // retry a couple times on transient 503/429
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await makeReq(modelName);
      if (resp.ok) {
        const out = await resp.json();
        const text = out?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error('Gemini returned no JSON');
        return JSON.parse(text.slice(start, end + 1));
      }
      const status = resp.status;
      lastErrText = await resp.text().catch(() => '');
      if (status === 503 || status === 429) {
        const delayMs = 800 * (attempt + 1);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      break; // try next model
    }
  }
  throw new Error(`Gemini failed: ${lastErrText || 'unavailable'}`);

}

async function geminiGenerateText(prompt) {
  if (!GEMINI_API_KEY) throw new Error('Missing GEMINI_API_KEY');
  const listResp = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(GEMINI_API_KEY)
  );
  if (!listResp.ok) throw new Error(`Gemini ListModels failed (${listResp.status})`);
  const listJson = await listResp.json();
  const names = (listJson?.models || [])
    .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => m.name)
    .filter(Boolean)
    .sort((a, b) => (/flash/i.test(a) ? -1 : 1) - (/flash/i.test(b) ? -1 : 1));
  if (!names.length) throw new Error('No Gemini models available for generateContent');

  let lastErr = '';
  for (const modelName of names.slice(0, 3)) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${encodeURIComponent(
          GEMINI_API_KEY
        )}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 900 },
          }),
        }
      );
      if (resp.ok) {
        const out = await resp.json();
        return out?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
      lastErr = await resp.text().catch(() => '');
      if (resp.status === 503 || resp.status === 429) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
  throw new Error(`Gemini unavailable: ${lastErr}`);
}

async function groqChat({ messages, model, temperature }) {
  if (!GROQ_API_KEY) throw new Error('Missing GROQ_API_KEY');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: model || 'llama-3.1-8b-instant',
      messages,
      temperature: typeof temperature === 'number' ? temperature : 0.7,
    }),
    signal: controller.signal,
  });
  clearTimeout(timeout);
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`Groq failed (${resp.status}): ${t}`);
  }
  return await resp.json();
}

async function groqGenerateText(prompt, opts) {
  const messages = [{ role: 'user', content: prompt }];
  // Try a couple fast models
  const models = ['llama-3.1-8b-instant', 'llama3-8b-8192'];
  let lastErr = null;
  for (const m of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await groqChat({ messages, model: m, temperature: opts?.temperature });
        const text = out?.choices?.[0]?.message?.content || '';
        if (text) return text;
        lastErr = new Error('Groq returned empty content');
      } catch (e) {
        lastErr = e;
        // brief retry on transient errors
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }
  throw lastErr || new Error('Groq unavailable');
}

async function groqGenerateFromMessages(messages, opts) {
  // Try a couple fast models
  const models = ['llama-3.1-8b-instant', 'llama3-8b-8192'];
  let lastErr = null;
  for (const m of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const out = await groqChat({ messages, model: m, temperature: opts?.temperature });
        const text = out?.choices?.[0]?.message?.content || '';
        if (text) return text;
        lastErr = new Error('Groq returned empty content');
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }
    }
  }
  throw lastErr || new Error('Groq unavailable');
}

async function groqGenerateJson(prompt) {
  const text = await groqGenerateText(
    prompt +
      '\n\nReturn STRICT JSON only (no markdown, no extra text).'
  );
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Groq returned no JSON');
  return JSON.parse(text.slice(start, end + 1));
}

function fallbackAssistantReply(message, context) {
  const m = String(message || '').toLowerCase();
  const temple = context?.temple ? String(context.temple) : 'the temple';
  const date = context?.date ? String(context.date) : '';
  const budget = context?.budget ? String(context.budget) : '';

  const lines = [];
  lines.push(`AI is temporarily busy. Here’s a practical plan using the info you provided.`);
  lines.push('');
  lines.push(`Temple: ${temple}${date ? ` · Date: ${date}` : ''}${budget ? ` · Budget: ${budget}` : ''}`);
  lines.push('');

  if (m.includes('hotel') || m.includes('stay')) {
    lines.push('- Stay tips');
    lines.push(`  - Prefer hotels/guest houses within 1–3 km of ${temple} for easier early-morning access.`);
    lines.push('  - Check: parking, cancellation, check-in time, and last-mile transport.');
    lines.push('  - Use the “Maps” button to compare options and reviews in real time.');
    lines.push('');
  }

  if (m.includes('route') || m.includes('reach') || m.includes('bus') || m.includes('train') || m.includes('car')) {
    lines.push('- Route tips');
    lines.push('  - Start early to avoid peak traffic and long queues.');
    lines.push('  - Keep 45–60 min buffer near the temple for parking + footwear counter.');
    lines.push('');
  }

  if (m.includes('timing') || m.includes('time') || m.includes('open') || m.includes('darshan')) {
    lines.push('- Timings');
    lines.push('  - Temple timings can change by day/festival.');
    lines.push('  - If you’ve scraped the temple source page in the backend, I can show source-based timing facts here.');
    lines.push('');
  }

  lines.push('- Checklist');
  lines.push('  - Carry ID, minimal cash, and water');
  lines.push('  - Follow dress code rules');
  lines.push('  - Keep power bank + network for maps/tickets');

  lines.push('');
  lines.push('Try again in a minute; Gemini demand spikes are usually temporary.');
  return lines.join('\n');
}

// ---------- API ----------

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/version', (req, res) => {
  res.json({ buildId: BUILD_ID });
});

app.get('/api/geo', async (req, res) => {
  const q = req.query?.q;
  if (!q) return res.status(400).json({ error: 'Missing q' });
  try {
    const geo = await geocodePlace(String(q));
    if (!geo) return res.status(404).json({ error: 'Not found' });
    res.json(geo);
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Geocode failed' });
  }
});

app.get('/api/route', async (req, res) => {
  const fromLat = Number(req.query?.fromLat);
  const fromLon = Number(req.query?.fromLon);
  const toLat = Number(req.query?.toLat);
  const toLon = Number(req.query?.toLon);
  if (![fromLat, fromLon, toLat, toLon].every((n) => Number.isFinite(n))) {
    return res.status(400).json({ error: 'Missing/invalid coordinates' });
  }
  try {
    const route = await osrmRoute({ lat: fromLat, lon: fromLon }, { lat: toLat, lon: toLon });
    res.json(route);
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Route failed' });
  }
});

app.get('/api/photo', async (req, res) => {
  const name = req.query?.name;
  if (!name) return res.status(400).json({ error: 'Missing name' });
  try {
    const url = await wikiThumbnailForName(String(name));
    res.json({ photoUrl: url });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Photo lookup failed' });
  }
});

// Google Places Photo proxy (keeps key off the client)
app.get('/api/google/photo', async (req, res) => {
  const ref = req.query?.ref;
  const maxwidth = req.query?.maxwidth || '600';
  if (!ref) return res.status(400).json({ error: 'Missing ref' });
  if (!GOOGLE_API_KEY) return res.status(500).json({ error: 'Missing GOOGLE_API_KEY' });
  const url =
    'https://maps.googleapis.com/maps/api/place/photo?' +
    new URLSearchParams({ maxwidth: String(maxwidth), photo_reference: String(ref), key: GOOGLE_API_KEY }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const resp = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  if (!resp.ok) return res.status(502).json({ error: `Google photo failed (${resp.status})` });
  res.setHeader('content-type', resp.headers.get('content-type') || 'image/jpeg');
  const buf = Buffer.from(await resp.arrayBuffer());
  res.send(buf);
});

app.post('/api/assistant', async (req, res) => {
  const { message, context, history } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'Missing message' });
  try {
    const safeHistory = Array.isArray(history)
      ? history
          .filter((x) => x && typeof x === 'object')
          .map((x) => ({
            role: x.role === 'assistant' ? 'assistant' : 'user',
            content: typeof x.content === 'string' ? x.content : '',
          }))
          .filter((x) => x.content.trim())
          .slice(-10)
      : [];

    const system = [
      `You are Divya Darshan AI — a helpful, natural, ChatGPT-like assistant for temple trips.`,
      `Be conversational and SPECIFIC to the user's latest message.`,
      `Do NOT repeat the same template every time.`,
      `Only include the sections the user asked for. If the user says "hello", reply briefly and ask one helpful question.`,
      `If you don't have verified facts (timings, prices, ratings), say "I don't have verified data" and give safe steps to check.`,
      `When listing hotels/places, prefer those in context.lastPlan if provided; otherwise give search steps and ask for city/date.`,
      ``,
      `Context JSON (may be empty):`,
      JSON.stringify(context || {}, null, 2),
    ].join('\n');

    const messages = [{ role: 'system', content: system }, ...safeHistory, { role: 'user', content: message }];

    // Groq first (faster), Gemini second (backup)
    let reply = '';
    try {
      reply = await groqGenerateFromMessages(messages, { temperature: 0.8 });
    } catch (e) {
      // Gemini wrapper is prompt-based; include a short transcript to reduce repetition.
      const transcript = messages
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n\n');
      reply = await geminiGenerateText(transcript);
    }
    res.json({ reply: reply || 'I could not generate a response right now.' });
  } catch (e) {
    // Graceful fallback when Gemini is overloaded/unavailable.
    res.json({ reply: fallbackAssistantReply(message, context), warning: e?.message || 'Assistant fallback used' });
  }
});

// Returns all app-configurable data blobs by temple slug.
// Table: temple_app_data(slug text pk, booking jsonb, parking jsonb, planner jsonb)
app.get('/api/bootstrap', async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const { data, error } = await supabase.from('temple_app_data').select('*');
  if (error) return res.status(500).json({ error: error.message });

  const bookingData = {};
  const parkingData = {};
  const plannerData = {};

  for (const row of data || []) {
    if (row.booking) bookingData[row.slug] = row.booking;
    if (row.parking) parkingData[row.slug] = row.parking;
    if (row.planner) plannerData[row.slug] = row.planner;
  }

  res.json({ bookingData, parkingData, plannerData });
});

// Scrape & cache a temple article page from allowed hosts.
// Table: temple_pages(slug text pk, source_url text, title text, content_html text, updated_at timestamptz)
app.post('/api/scrape', async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const { slug, url } = req.body || {};
  if (!slug || typeof slug !== 'string') return res.status(400).json({ error: 'Missing slug' });
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url' });
  if (!isAllowedUrl(url)) {
    return res.status(400).json({
      error: `URL not allowed. Allowed hosts: ${Array.from(ALLOWED_SCRAPE_HOSTS).join(', ')}`,
    });
  }

  try {
    const scraped = await scrapeTempleArticle(url);
    const upsertPayload = {
      slug,
      source_url: url,
      title: scraped.title,
      content_html: scraped.contentHtml,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('temple_pages').upsert(upsertPayload, { onConflict: 'slug' });
    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, slug, title: scraped.title, textSample: scraped.textSample });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Scrape failed' });
  }
});

app.get('/api/temple-page/:slug', async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const { slug } = req.params;
  const { data, error } = await supabase
    .from('temple_pages')
    .select('slug, source_url, title, content_html, updated_at')
    .eq('slug', slug)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// Table: bookings(
//   id text primary key,
//   temple_key text not null,
//   temple_name text not null,
//   visit_date text,
//   slot text,
//   qty int4 not null,
//   phone text,
//   ticket_type text,
//   source text,
//   status text,
//   created_at timestamptz default now()
// )
app.get('/api/bookings', async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const { temple_key } = req.query;
  let query = supabase.from('bookings').select('*').order('created_at', { ascending: false });
  if (temple_key) query = query.eq('temple_key', temple_key);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ bookings: data || [] });
});

app.post('/api/bookings', async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const {
    id,
    temple_key,
    temple_name,
    visit_date,
    slot,
    qty,
    phone,
    ticket_type,
    source,
    status,
  } = req.body || {};

  if (!id || !temple_key || !temple_name || !qty) {
    return res.status(400).json({ error: 'Missing required booking fields' });
  }

  const payload = {
    id,
    temple_key,
    temple_name,
    visit_date: visit_date || null,
    slot: slot || null,
    qty: Number(qty),
    phone: phone || null,
    ticket_type: ticket_type || null,
    source: source || 'Online',
    status: status || 'Pending',
  };

  const { data, error } = await supabase.from('bookings').insert(payload).select('*').single();
  if (error) return res.status(500).json({ error: error.message });

  // Best-effort WhatsApp/SMS confirmation (does not block booking success)
  if (payload.phone) {
    const to = normalizeTwilioTo(payload.phone);
    if (to) {
      const body = buildBookingConfirmationText(payload);
      twilioSendMessage({ to, body })
        .then(() => {})
        .catch((e) => console.warn('[divyadarshan] Twilio send failed:', e?.message || e));
    }
  }

  res.status(201).json(data);
});

app.patch('/api/bookings/:id', async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const { id } = req.params;
  const updates = {};
  for (const key of ['status', 'slot', 'visit_date', 'qty', 'phone']) {
    if (req.body && req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const { data, error } = await supabase
    .from('bookings')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/bookings/:id', async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const { id } = req.params;
  const { error } = await supabase.from('bookings').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.get('/api/admin/summary', async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const { temple_key } = req.query;
  let query = supabase.from('bookings').select('*');
  if (temple_key) query = query.eq('temple_key', temple_key);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const bookings = data || [];
  const summary = {
    totalBookings: bookings.length,
    confirmed: bookings.filter((b) => b.status === 'Confirmed').length,
    pending: bookings.filter((b) => b.status !== 'Confirmed').length,
    online: bookings.filter((b) => (b.source || '').toLowerCase() === 'online').length,
    offline: bookings.filter((b) => (b.source || '').toLowerCase() === 'offline').length,
  };
  res.json(summary);
});

// Real-data Travel Planner (OSM + scraped temple page + Gemini)
app.post('/api/travel/plan', async (req, res) => {
  if (!requireSupabase(req, res)) return;

  const {
    templeKey,
    templeName,
    date,
    timeOfDay,
    pilgrims,
    budget,
    nights,
    origin,
    extraStops,
    special,
  } = req.body || {};

  if (!templeKey || !templeName) return res.status(400).json({ error: 'Missing templeKey/templeName' });

  try {
    // 1) Get scraped temple info (if available)
    const { data: page } = await supabase
      .from('temple_pages')
      .select('source_url, title, content_html, updated_at')
      .eq('slug', templeKey)
      .maybeSingle();

    const templeText = page?.content_html
      ? cheerio.load(page.content_html).text().replace(/\s+/g, ' ').trim().slice(0, 4000)
      : '';

    // 2) Geocode & pull nearby POIs/hotels (prefer Google when configured, fallback to OSM on Google denial)
    let geo = null;
    let googleWarning = null;
    let routeInfo = null;
    let googleHotels = [];
    let googlePlaces = [];

    if (GOOGLE_API_KEY) {
      try {
        geo = await googleGeocode(`${templeName} temple`);
      } catch (e) {
        const msg = String(e?.message || '');
        // Common causes: API not enabled, billing disabled, key restrictions, wrong key.
        googleWarning =
          `Google Geocoding unavailable: ${msg}. ` +
          `Fix in Google Cloud: enable “Geocoding API”, enable billing, and ensure this key allows Geocoding + Places + Directions (and correct referrer/IP restrictions).`;
        geo = await geocodePlace(`${templeName} temple`);
      }
    } else {
      geo = await geocodePlace(`${templeName} temple`);
    }
    if (!geo) return res.status(404).json({ error: 'Could not locate temple on map' });

    let elements = [];
    let osmWarning = null;

    if (GOOGLE_API_KEY) {
      try {
        const [hotels, places] = await Promise.all([
          googleNearby({ lat: geo.lat, lon: geo.lon, radius: 3500, type: 'lodging', keyword: 'hotel' }),
          googleNearby({ lat: geo.lat, lon: geo.lon, radius: 3500, type: 'tourist_attraction', keyword: '' }),
        ]);
        googleHotels = hotels;
        googlePlaces = places;
      } catch (e) {
        googleWarning = (googleWarning ? googleWarning + ' | ' : '') + `Google Places unavailable: ${e?.message || 'unknown error'}`;
      }

      const originText = typeof origin === 'string' ? origin.trim() : '';
      if (originText) {
        try {
          routeInfo = await googleDirections({ origin: originText, destLat: geo.lat, destLon: geo.lon });
        } catch (e) {
          googleWarning = (googleWarning ? googleWarning + ' | ' : '') + `Google Directions unavailable: ${e?.message || 'unknown error'}`;
        }
      }
    } else {
    try {
      // Hard cap OSM lookup time so planner stays fast.
      elements = await Promise.race([
        overpassNearby(geo.lat, geo.lon, 3500),
        new Promise((_, rej) => setTimeout(() => rej(new Error('OSM lookup timeout')), 8000)),
      ]);
    } catch (e) {
      osmWarning = `OSM nearby lookup unavailable: ${e?.message || 'unknown error'}`;
      elements = [];
    }
    }

    const hotels = [];
    const pois = [];
    if (GOOGLE_API_KEY && (googleHotels.length || googlePlaces.length)) {
      for (const h of googleHotels) {
        hotels.push({
          name: h.name,
          lat: h.geometry?.location?.lat ?? null,
          lon: h.geometry?.location?.lng ?? null,
          type: 'hotel',
          address: h.vicinity || null,
          rating: h.rating ?? null,
          ratings_total: h.user_ratings_total ?? null,
          price_level: h.price_level ?? null,
          place_id: h.place_id ?? null,
          photo_ref: h.photos?.[0]?.photo_reference ?? null,
        });
      }
      for (const p of googlePlaces) {
        pois.push({
          name: p.name,
          lat: p.geometry?.location?.lat ?? null,
          lon: p.geometry?.location?.lng ?? null,
          type: (p.types && p.types[0]) ? p.types[0] : 'place',
          address: p.vicinity || null,
          rating: p.rating ?? null,
          ratings_total: p.user_ratings_total ?? null,
          place_id: p.place_id ?? null,
          photo_ref: p.photos?.[0]?.photo_reference ?? null,
        });
      }
    } else {
      for (const el of elements) {
        const tags = el.tags || {};
        const name = tags.name;
        if (!name) continue;
        const item = {
          name,
          lat: el.lat,
          lon: el.lon,
          type: tags.amenity || tags.tourism || 'place',
          address: [
            tags['addr:housenumber'],
            tags['addr:street'],
            tags['addr:suburb'],
            tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
            tags['addr:postcode'],
          ]
            .filter(Boolean)
            .join(', '),
          stars: tags.stars || null, // official star rating (not review rating)
          phone: tags.phone || tags['contact:phone'] || null,
          website: tags.website || tags['contact:website'] || null,
        };
        if (tags.amenity && ['hotel', 'guest_house', 'hostel'].includes(tags.amenity)) hotels.push(item);
        else pois.push(item);
      }
    }

    // 3) Ask Gemini to build a grounded itinerary (no hallucinated ratings/photos)
    const prompt = `
You are a travel planner. Use ONLY the provided real data. Do NOT invent hotel ratings, prices, or photos.

User inputs:
- Temple: ${templeName} (${templeKey})
- Date: ${date || 'not provided'}
- Time of day: ${timeOfDay || 'not provided'}
- Pilgrims: ${pilgrims || 'not provided'}
- Budget: ${budget || 'not provided'}
- Nights: ${nights || 'not provided'}
- Origin: ${origin || 'not provided'}
- Extra stops requested: ${Array.isArray(extraStops) ? extraStops.join(', ') : 'none'}
- Special needs: ${special ? JSON.stringify(special) : 'none'}

Temple info (scraped text, if available):
SOURCE: ${page?.source_url || 'none'}
TEXT: ${templeText || 'none'}

Nearby hotels from OpenStreetMap (no ratings/photos available):
${hotels.slice(0, 12).map((h, i) => `${i + 1}. ${h.name} (${h.type}) @ ${h.lat},${h.lon} ${h.address ? '- ' + h.address : ''}`).join('\n')}

Nearby places/POIs from OpenStreetMap:
${pois.slice(0, 12).map((p, i) => `${i + 1}. ${p.name} (${p.type}) @ ${p.lat},${p.lon} ${p.address ? '- ' + p.address : ''}`).join('\n')}

Return STRICT JSON only, with this shape:
{
  "summary": string,
  "templeFacts": string[],
  "recommendedHotels": [{ "name": string, "type": string, "lat": number, "lon": number, "mapsUrl": string }],
  "recommendedStops": [{ "name": string, "type": string, "lat": number, "lon": number, "mapsUrl": string }],
  "itinerary": [{ "time": string, "activity": string, "reason": string }]
}
Make the plan realistic with buffers. If you lack data, say so clearly.`;

    let plan = null;
    let aiWarning = null;
    try {
      // Groq first (fast), Gemini fallback
      try {
        plan = await groqGenerateJson(prompt);
      } catch (e) {
        plan = await geminiGenerateJson(prompt);
      }
    } catch (e) {
      aiWarning = `AI unavailable: ${e?.message || 'unknown error'}`;
      plan = null;
    }

    // Sanitize + add maps URL. (Prevents AI from inventing ratings/photos.)
    const addMapsUrl = (x) => {
      const name = x?.name ? String(x.name) : '';
      const type = x?.type ? String(x.type) : 'place';
      const lat = typeof x?.lat === 'number' ? x.lat : null;
      const lon = typeof x?.lon === 'number' ? x.lon : null;
      const mapsUrl =
        x?.mapsUrl ||
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${templeName}`)}`;
      const out = { name, type, lat, lon, mapsUrl };
      // carry through safe real fields if present
      for (const k of ['address','phone','website','stars','rating','ratings_total','price_level','place_id','photo_ref','distance_km']) {
        if (x && x[k] !== undefined) out[k] = x[k];
      }
      if (out.photo_ref && GOOGLE_API_KEY) {
        out.photoUrl = `/api/google/photo?ref=${encodeURIComponent(out.photo_ref)}&maxwidth=600`;
      }
      return out;
    };

    // Non-AI fallback: return real data we have, with a simple templated itinerary.
    if (!plan) {
      const templeFacts = [];
      if (templeText) {
        // Pull a few timing-like sentences (very conservative)
        const candidates = templeText
          .split(/(?<=[.?!])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
        for (const s of candidates) {
          if (/\b(AM|PM|a\.m\.|p\.m\.)\b/i.test(s) || /\b\d{1,2}:\d{2}\b/.test(s)) {
            templeFacts.push(s);
          }
          if (templeFacts.length >= 4) break;
        }
      }

      const t = timeOfDay || 'morning';
      const itinerary = [
        { time: 'T‑60 min', activity: `Arrive near ${templeName} and park/check-in`, reason: 'Buffer for traffic + queues' },
        { time: 'T‑45 min', activity: 'Freshen up, follow dress code, keep ID ready', reason: 'Smooth entry and fewer delays' },
        { time: t === 'morning' ? '06:00–09:00' : t === 'afternoon' ? '12:00–15:00' : '17:00–20:00', activity: 'Darshan window', reason: 'Based on selected time-of-day' },
        { time: 'After darshan', activity: 'Prasadam / Annadana (if available)', reason: 'Temple service (check source)' },
        { time: 'Later', activity: extraStops && extraStops.length ? `Optional stops: ${extraStops.join(', ')}` : 'Optional nearby sightseeing', reason: 'Only if time permits' },
      ];

      const recHotels = hotels.slice(0, 6).map((h) => {
        const base = addMapsUrl({ name: h.name, type: h.type, lat: h.lat, lon: h.lon });
        base.address = h.address || null;
        base.phone = h.phone || null;
        base.website = h.website || null;
        base.stars = h.stars || null;
        base.distance_km = (base.lat && base.lon) ? Number(haversineKm({ lat: geo.lat, lon: geo.lon }, { lat: base.lat, lon: base.lon }).toFixed(2)) : null;
        return base;
      });
      const recStops = pois.slice(0, 10).map((p) => {
        const base = addMapsUrl({ name: p.name, type: p.type, lat: p.lat, lon: p.lon });
        base.address = p.address || null;
        base.distance_km = (base.lat && base.lon) ? Number(haversineKm({ lat: geo.lat, lon: geo.lon }, { lat: base.lat, lon: base.lon }).toFixed(2)) : null;
        return base;
      });
      // Attach photos if available (real thumbnails, may be null)
      for (const h of recHotels) h.photoUrl = await wikiThumbnailForName(h.name);
      for (const s of recStops) s.photoUrl = await wikiThumbnailForName(s.name);

      return res.json({
        geo,
        sourceUrl: page?.source_url || null,
        osmWarning,
        aiWarning,
        summary: `Real-data plan for ${templeName}. (AI generation is currently unavailable.)`,
        templeFacts,
        recommendedHotels: recHotels,
        recommendedStops: recStops,
        itinerary,
      });
    }

    const respBody = {
      geo,
      sourceUrl: page?.source_url || null,
      osmWarning,
      googleWarning,
      routeInfo,
      aiWarning,
      ...plan,
      recommendedHotels: Array.isArray(plan.recommendedHotels) ? plan.recommendedHotels.map(addMapsUrl) : [],
      recommendedStops: Array.isArray(plan.recommendedStops) ? plan.recommendedStops.map(addMapsUrl) : [],
    };

    // Attach real photos if possible (no ratings)
    for (const h of respBody.recommendedHotels) h.photoUrl = await wikiThumbnailForName(h.name);
    for (const s of respBody.recommendedStops) s.photoUrl = await wikiThumbnailForName(s.name);

    // Enrich with OSM fields when we can match by name
    const byName = (arr) => {
      const map = new Map();
      for (const x of arr) {
        const k = String(x.name || '').trim().toLowerCase();
        if (k) map.set(k, x);
      }
      return map;
    };
    const hotelMap = byName(hotels);
    const poiMap = byName(pois);
    for (const h of respBody.recommendedHotels) {
      const m = hotelMap.get(String(h.name || '').trim().toLowerCase());
      if (m) {
        h.address = m.address || null;
        h.phone = m.phone || null;
        h.website = m.website || null;
        h.stars = m.stars || null;
        h.distance_km = (h.lat && h.lon) ? Number(haversineKm({ lat: geo.lat, lon: geo.lon }, { lat: h.lat, lon: h.lon }).toFixed(2)) : null;
      }
    }
    for (const s of respBody.recommendedStops) {
      const m = poiMap.get(String(s.name || '').trim().toLowerCase());
      if (m) {
        s.address = m.address || null;
        s.distance_km = (s.lat && s.lon) ? Number(haversineKm({ lat: geo.lat, lon: geo.lon }, { lat: s.lat, lon: s.lon }).toFixed(2)) : null;
      }
    }

    res.json(respBody);
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Travel plan failed' });
  }
});

app.listen(PORT, () => {
  console.log(`[divyadarshan] running on http://127.0.0.1:${PORT}`);
  console.log(
    `[divyadarshan] UI: http://127.0.0.1:${PORT}/updated_dashboard_with_expanded_temples_and_feedback/code.html`
  );
});

