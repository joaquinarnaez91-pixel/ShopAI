const https = require('https');

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { query } = req.body;
  const serpKey = process.env.SERPAPI_KEY;
  const rfKey = process.env.RAINFOREST_API_KEY;

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
}
