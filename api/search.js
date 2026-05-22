const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

function stripHtml(str) {
  if (!str) return '';
  const plain = str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= 80) return plain;
  const dotIdx = plain.indexOf('.');
  if (dotIdx > 0 && dotIdx <= 80) return plain.slice(0, dotIdx + 1);
  const delIdx = plain.toLowerCase().indexOf('delivery');
  if (delIdx > 0 && delIdx + 8 <= 80) return plain.slice(0, delIdx + 8);
  return plain.slice(0, 80);
}

function getCacheKey(query) {
  return '/tmp/enrich_' + crypto.createHash('md5').update(query).digest('hex') + '.json';
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

function makePricePoints(price) {
  const pts = Array.from({length: 30}, (_,j) => {
    const wave = Math.sin(j/4) * 0.04;
    const noise = (Math.sin(j*7.3+price) - 0.5) * 0.03;
    return Math.round(price * (1 + wave + noise));
  });
  pts[29] = price;
  return pts;
}

async function serpSearch(query, serpKey) {
  const params = new URLSearchParams({
    api_key: serpKey, engine: 'google_shopping', q: query, num: '8', gl: 'us', hl: 'en'
  });
  const data = await httpsGet('https://serpapi.com/search?' + params.toString());
  return (data.shopping_results || []).slice(0, 6).map(item => {
    const price = parseFloat((item.price || '0').replace(/[^0-9.]/g, '')) || 0;
    return {
      name: item.title, source: item.source || 'Retailer',
      price, rating: item.rating || 4.2, reviews: item.reviews || 0,
      img: item.thumbnail || '', link: item.product_link || item.link || '',
      delivery: stripHtml(item.delivery || ''), prices: makePricePoints(price),
      snippet: item.snippet || item.title,
      summary: '', insight: item.snippet || item.title
    };
  });
}

async function rainforestSearch(query, rfKey) {
  const params = new URLSearchParams({
    api_key: rfKey, type: 'search', amazon_domain: 'amazon.com', search_term: query
  });
  const data = await httpsGet('https://api.rainforestapi.com/request?' + params.toString());
  return (data.search_results || [])
    .filter(item => item.price !== undefined)
    .slice(0, 6)
    .map(item => {
      const price = parseFloat((item.price.value || '0').toString().replace(/[^0-9.]/g, '')) || 0;
      const brand = item.brand ? item.brand + ' — ' : '';
      return {
        name: item.title || '', source: 'Amazon', brand: item.brand || '',
        price, rating: item.rating || 4.2, reviews: item.ratings_total || 0,
        img: item.image || '', link: item.link || '',
        delivery: stripHtml((item.delivery && item.delivery.tagline) || 'Prime eligible'),
        prices: makePricePoints(price),
        snippet: brand + (item.title || ''),
        summary: '', insight: brand + (item.title || '')
      };
    });
}

function dedupe(products) {
  const seen = new Set();
  return products.filter(p => {
    const key = p.name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function enrichInBackground(query, products, apiKey) {
  const cacheKey = getCacheKey(query);
  try {
    fs.writeFileSync(cacheKey, JSON.stringify({status: 'pending'}), 'utf8');

    const names = products.map((p, i) =>
      (i+1) + '. ' + p.name + (p.brand ? ' by ' + p.brand : '') + ' — $' + p.price + ', rated ' + p.rating
    ).join('\n');
    const prompt = 'You are reviewing ' + products.length + ' DIFFERENT shoe products. Each entry in your response must be UNIQUE — do not repeat the same pros, cons, or fun fact across entries. Tailor every response to that specific shoe model and brand.\n\nFor each shoe provide:\n1. A summary: pros starting with ✅ then cons starting with ❌ (e.g. "✅ Excellent arch support, durable outsole. ❌ Runs narrow, limited colors."). Make the pros and cons specific to THIS shoe.\n2. A funFact: one sentence about this specific shoe model, its brand history, a famous athlete who wears it, or its technology. If unsure of a specific fact, use a real fact about the brand. Never leave empty.\n\nReturn ONLY a valid JSON array with exactly ' + products.length + ' entries: [{"summary":"✅ ... ❌ ...","funFact":"..."}]\n\n' + names;

    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json', 'x-api-key': apiKey,
          'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(payload)
        }
      }, apiRes => {
        let d = '';
        apiRes.on('data', c => d += c);
        apiRes.on('end', () => {
          try { resolve(JSON.parse(d).content[0].text); } catch(e) { reject(e); }
        });
      });
      r.on('timeout', () => r.destroy());
      r.on('error', reject);
      r.write(payload);
      r.end();
    });

    const enriched = JSON.parse(text.replace(/```json|```/g, '').trim());
    console.log('[enrich-bg] result:', JSON.stringify(enriched[0]));

    const summaries = enriched.map(e => e && e.summary);
    if (new Set(summaries).size < summaries.filter(Boolean).length) {
      console.warn('[enrich-bg] duplicate summaries detected');
    }

    const enrichedProducts = products.map((p, i) => ({
      ...p,
      summary: enriched[i] ? enriched[i].summary : '✅ Highly rated by verified buyers. ❌ Individual fit may vary.',
      insight: enriched[i] ? enriched[i].insight || p.snippet : p.snippet,
      funFact: enriched[i] ? (enriched[i].funFact || (p.brand ? p.brand + ' is a trusted footwear brand known for quality and performance.' : 'Running shoes are engineered to absorb up to 3x your body weight with every stride.')) : ''
    }));

    fs.writeFileSync(cacheKey, JSON.stringify({status: 'ready', data: enrichedProducts}), 'utf8');
    console.log('[enrich-bg] cache written for query:', query);
  } catch(e) {
    console.error('[enrich-bg] error:', e.message);
    try { fs.writeFileSync(cacheKey, JSON.stringify({status: 'error'}), 'utf8'); } catch(_) {}
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { query } = req.body;
  const serpKey = process.env.SERPAPI_KEY;
  const rfKey = process.env.RAINFOREST_API_KEY;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const [serpResult, rfResult] = await Promise.allSettled([
    serpSearch(query, serpKey),
    rfKey ? rainforestSearch(query, rfKey) : Promise.resolve([])
  ]);

  const serpProducts = serpResult.status === 'fulfilled' ? serpResult.value : [];
  const rfProducts   = rfResult.status === 'fulfilled'   ? rfResult.value   : [];

  if (serpResult.status === 'rejected') console.log('[search] SerpAPI error:', serpResult.reason?.message);
  if (rfResult.status === 'rejected')   console.log('[search] Rainforest error:', rfResult.reason?.message);

  const merged = dedupe([...rfProducts, ...serpProducts])
    .slice(0, 8)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .map((p, i) => ({ ...p, id: i + 1 }));

  console.log(`[search] ${rfProducts.length} Amazon + ${serpProducts.length} SerpAPI → ${merged.length} merged`);

  res.status(200).json(merged);

  // Background enrichment — Vercel keeps the function alive after res.json()
  // until the event loop drains, so this runs without blocking the response.
  if (apiKey && merged.length && query) {
    enrichInBackground(query, merged, apiKey).catch(() => {});
  }
}
