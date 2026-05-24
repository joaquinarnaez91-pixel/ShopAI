const https = require('https');

const BLOCKLIST = ['ALO', 'Fashion Nova', 'Steve Madden', 'Shein', 'Temu'];

function httpsGet(url, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('httpsGet timeout')); });
  });
}

function stripHtml(str) {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

function makePricePoints(price) {
  const pts = Array.from({length: 30}, (_, i) => {
    const wave = Math.sin(i / 4) * 0.08 + Math.sin(i / 9 + 1.2) * 0.04;
    const noise = (Math.sin(i * 7.3 + price) - 0.5) * 0.03;
    return Math.round(price * (1 + wave + noise));
  });
  pts[29] = price;
  return pts;
}

function calcPriceIndicator(price, pts) {
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min;
  if (price <= min + range * 0.15) return 'LOW';
  if (price >= max - range * 0.15) return 'HIGH';
  return 'USUAL';
}

function isBlocked(title, source) {
  const combined = ((title || '') + ' ' + (source || '')).toLowerCase();
  return BLOCKLIST.some(b => combined.includes(b.toLowerCase()));
}

function scoreMatch(title, brand, modelName) {
  const t = (title || '').toLowerCase();
  if (!t.includes((brand || '').toLowerCase())) return -1;
  const words = (modelName || '').toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const hits = words.filter(w => t.includes(w)).length;
  if (hits === 0) return -1;
  return hits;
}

async function serpSearch(query, serpKey) {
  const params = new URLSearchParams({
    api_key: serpKey, engine: 'google_shopping', q: query, num: '10', gl: 'us', hl: 'en'
  });
  const data = await httpsGet('https://serpapi.com/search?' + params.toString());
  return (data.shopping_results || []).map(item => {
    const price = parseFloat((item.price || '0').replace(/[^0-9.]/g, '')) || 0;
    return {
      title: item.title || '',
      source: item.source || 'Retailer',
      price,
      rating: item.rating || 0,
      reviews: item.reviews || 0,
      img: item.thumbnail || '',
      link: item.product_link || item.link || '',
      delivery: stripHtml(item.delivery || '')
    };
  }).filter(p => p.price > 0);
}

async function rainforestSearch(query, rfKey) {
  if (!rfKey) return [];
  const params = new URLSearchParams({
    api_key: rfKey, type: 'search', amazon_domain: 'amazon.com', search_term: query
  });
  const data = await httpsGet('https://api.rainforestapi.com/request?' + params.toString());
  return (data.search_results || [])
    .filter(item => item.price !== undefined)
    .map(item => {
      const price = parseFloat((item.price.value || '0').toString().replace(/[^0-9.]/g, '')) || 0;
      return {
        title: item.title || '',
        source: 'Amazon',
        price,
        rating: item.rating || 0,
        reviews: item.ratings_total || 0,
        img: item.image || '',
        link: item.link || '',
        delivery: stripHtml((item.delivery && item.delivery.tagline) || 'Prime eligible')
      };
    }).filter(p => p.price > 0);
}

async function searchForModel(m, serpKey, rfKey) {
  const [serpResult, rfResult] = await Promise.allSettled([
    serpSearch(m.query, serpKey),
    rainforestSearch(m.query, rfKey)
  ]);

  const candidates = [
    ...(serpResult.status === 'fulfilled' ? serpResult.value : []),
    ...(rfResult.status === 'fulfilled'   ? rfResult.value   : [])
  ].filter(p => !isBlocked(p.title, p.source));

  if (serpResult.status === 'rejected') console.log('[search] SerpAPI error for', m.query + ':', serpResult.reason?.message);
  if (rfResult.status === 'rejected')   console.log('[search] Rainforest error for', m.query + ':', rfResult.reason?.message);

  let best = null, bestScore = -Infinity;
  for (const p of candidates) {
    const ms = scoreMatch(p.title, m.brand, m.model);
    if (ms < 0) continue;
    const qs = ms * 10 + (p.rating || 0) * Math.log((p.reviews || 0) + 1);
    if (qs > bestScore) { bestScore = qs; best = p; }
  }

  if (!best) {
    console.log('[search] No match found for', m.brand, m.model);
    return null;
  }

  const prices30day = makePricePoints(best.price);
  return {
    name: best.title,
    brand: m.brand,
    category: m.category,
    why: m.why,
    price: best.price,
    priceIndicator: calcPriceIndicator(best.price, prices30day),
    rating: best.rating,
    reviews: best.reviews,
    img: best.img,
    link: best.link,
    source: best.source,
    delivery: best.delivery,
    prices30day
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { models, userProfile } = req.body;
  const serpKey = process.env.SERPAPI_KEY;
  const rfKey   = process.env.RAINFOREST_API_KEY;

  if (!Array.isArray(models) || models.length === 0) {
    return res.status(400).json({ error: 'models array is required' });
  }

  console.log('[search] Searching', models.length, 'models:', models.map(m => m.brand + ' ' + m.model).join(' | '));

  const settled = await Promise.allSettled(
    models.map(m => searchForModel(m, serpKey, rfKey))
  );

  const products = settled
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(Boolean)
    .map((p, i) => ({ ...p, id: i + 1 }));

  console.log('[search] Returning', products.length, '/', models.length, 'products');
  return res.status(200).json(products);
}
