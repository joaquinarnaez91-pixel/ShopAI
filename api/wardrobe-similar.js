import https from 'https';

function httpsGet(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpsPost(hostname, path, headers, body, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'POST', headers, timeout: timeoutMs }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
    req.write(body);
    req.end();
  });
}

function cleanTitle(title) {
  return (title || '').replace(/\(#[\w/#]+\)/g, '').replace(/\s{2,}/g, ' ').trim();
}

const BLOCKLIST = ['Fashion Nova', 'Shein', 'Temu'];

function isBlocked(title, source) {
  const combined = ((title || '') + ' ' + (source || '')).toLowerCase();
  return BLOCKLIST.some(b => combined.includes(b.toLowerCase()));
}

async function serpSearch(query, serpKey, num = 10) {
  const params = new URLSearchParams({
    api_key: serpKey,
    engine: 'google_shopping',
    q: query,
    num: String(num),
    gl: 'us',
    hl: 'en'
  });
  const data = await httpsGet('https://serpapi.com/search?' + params.toString());
  return (data.shopping_results || []).map(item => ({
    title:   cleanTitle(item.title || ''),
    source:  item.source || 'Retailer',
    price:   parseFloat((item.price || '0').replace(/[^0-9.]/g, '')) || 0,
    img:     item.thumbnail || '',
    link:    item.product_link || item.link || ''
  })).filter(p => p.price > 0 && p.link && !isBlocked(p.title, p.source));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { name, brand, category, colors } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });

  const serpKey     = process.env.SERPAPI_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  const garmentDesc = [name, brand && `by ${brand}`, category, colors && `colors: ${colors}`]
    .filter(Boolean).join(', ');

  const claudePayload = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `You are a fashion shopping expert. Given this owned garment, write 1 concise Google Shopping search query to find visually similar items, plus 2 alternates at different price points. Return JSON only: {"queries":["...","...","..."]}\n\nGarment: ${garmentDesc}`
    }]
  });

  let queries = [];
  try {
    const claudeRes = await httpsPost('api.anthropic.com', '/v1/messages', {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'Content-Length': Buffer.byteLength(claudePayload)
    }, claudePayload, 15000);

    const raw = claudeRes.content?.[0]?.text || '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) queries = JSON.parse(m[0]).queries || [];
  } catch(e) {
    console.error('[wardrobe-similar] Claude error:', e.message);
  }

  if (!queries.length) {
    queries = [
      `${brand ? brand + ' ' : ''}${name}`.trim(),
      `similar ${category || 'clothing'} like ${name}`,
      `affordable ${name} ${category || ''}`.trim()
    ];
  }

  const seen = new Set();
  const results = [];

  for (const q of queries) {
    if (results.length >= 4) break;
    try {
      const r = await serpSearch(q, serpKey, 10);
      for (const p of r) {
        if (seen.has(p.link)) continue;
        seen.add(p.link);
        results.push(p);
      }
    } catch(e) {
      console.error('[wardrobe-similar] serp error:', e.message);
    }
  }

  const products = results.slice(0, 8).map(p => ({
    image:    p.img,
    title:    p.title,
    price:    p.price,
    merchant: p.source,
    link:     p.link
  }));

  return res.status(200).json({ products });
}
