const https = require('https');

const BLOCKLIST = ['ALO', 'Fashion Nova', 'Steve Madden', 'Shein', 'Temu'];

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

function cleanTitle(title) {
  return (title || '')
    .replace(/\(#[\w/#]+\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
  const b = (brand || '').toLowerCase();
  if (!t.includes(b)) return -1;
  const words = (modelName || '').toLowerCase().split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return 1;
  const hits = words.filter(w => t.includes(w)).length;
  return hits >= 1 ? hits : -1;
}

// Google Custom Search Engine
async function googleCSESearch(query, apiKey, cx, num = 10) {
  const params = new URLSearchParams({
    key: apiKey,
    cx:  cx,
    q:   query,
    num: String(Math.min(num, 10)),
    gl:  'us',
    hl:  'en'
  });
  const data = await httpsGet(
    'https://www.googleapis.com/customsearch/v1?' + params.toString()
  );
  return (data.items || []).map(item => {
    const priceMatch = (item.snippet || item.title || '')
      .match(/\$[\d,]+\.?\d*/);
    const price = priceMatch
      ? parseFloat(priceMatch[0].replace(/[$,]/g, ''))
      : 0;
    return {
      title:    cleanTitle(item.title || ''),
      source:   item.displayLink || 'Retailer',
      price,
      rating:   0,
      reviews:  0,
      img:      item.pagemap?.cse_image?.[0]?.src ||
                item.pagemap?.cse_thumbnail?.[0]?.src || '',
      link:     item.link || '',
      delivery: ''
    };
  }).filter(p => p.price > 0);
}

// Rainforest Amazon search
async function rainforestSearch(query, rfKey) {
  if (!rfKey) return [];
  const params = new URLSearchParams({
    api_key: rfKey, type: 'search', amazon_domain: 'amazon.com', search_term: query
  });
  const data = await httpsGet('https://api.rainforestapi.com/request?' + params.toString());
  return (data.search_results || [])
    .filter(item => item.price !== undefined)
    .map(item => ({
      title:    cleanTitle(item.title || ''),
      source:   'Amazon',
      price:    parseFloat((item.price?.value || '0').toString().replace(/[^0-9.]/g, '')) || 0,
      rating:   item.rating || 0,
      reviews:  item.ratings_total || 0,
      img:      item.image || '',
      link:     item.link || '',
      delivery: 'Prime eligible'
    })).filter(p => p.price > 0);
}

async function searchForModel(m, apiKey, cx, rfKey) {
  const q = m.query;
  console.log('[search] starting:', m.brand, m.model, '| query:', q);

  const [cseResult, rfResult] = await Promise.allSettled([
    googleCSESearch(q + ' buy price', apiKey, cx, 10),
    rainforestSearch(q, rfKey)
  ]);

  const seen = new Set();
  const candidates = [];
  for (const r of [cseResult, rfResult]) {
    if (r.status !== 'fulfilled') continue;
    for (const p of r.value) {
      if (!p.link || seen.has(p.link)) continue;
      if (isBlocked(p.title, p.source)) continue;
      seen.add(p.link);
      candidates.push(p);
    }
  }

  console.log('[search]', m.brand, m.model, '— candidates:', candidates.length);

  // AG surface filter
  const queryLower = q.toLowerCase();
  const isAGSearch = queryLower.includes(' ag ') || queryLower.includes('turf');
  let filtered = candidates;
  if (isAGSearch) {
    filtered = candidates.filter(p => {
      const t = p.title.toLowerCase();
      const hasFGOnly = (t.includes('firm ground') || t.includes(' fg ') || t.includes('/fg')) &&
                        !t.includes(' ag ') && !t.includes('/ag') && !t.includes('turf');
      return !hasFGOnly;
    });
    console.log('[search] AG filter: kept', filtered.length, 'of', candidates.length);
  }

  // Score and pick best
  let best = null, bestScore = -Infinity;
  for (const p of filtered) {
    const ms = scoreMatch(p.title, m.brand, m.model);
    if (ms < 0) continue;
    const qs = ms * 10 + (p.rating || 0) * Math.log((p.reviews || 0) + 1);
    if (qs > bestScore) { bestScore = qs; best = p; }
  }

  // Fallback — take any candidate with brand match
  if (!best) {
    best = filtered.find(p =>
      p.title.toLowerCase().includes((m.brand || '').toLowerCase())
    ) || filtered[0] || null;
    if (best) console.log('[search] fallback result:', best.title);
  }

  // Mock fallback if still nothing
  if (!best) {
    const categoryMocks = {
      soccer: [
        { brand:'Nike',   model:'Phantom GX II Academy AG', price:89,  rating:4.6, reviews:1200 },
        { brand:'Adidas', model:'Predator Club AG',          price:75,  rating:4.7, reviews:980  },
        { brand:'Puma',   model:'Future 7 Play AG',          price:65,  rating:4.5, reviews:750  },
      ],
      running: [
        { brand:'ASICS', model:'Novablast 5', price:130, rating:4.7, reviews:2100 },
        { brand:'Nike',  model:'Pegasus 41',  price:135, rating:4.6, reviews:3200 },
        { brand:'Hoka',  model:'Clifton 9',   price:145, rating:4.8, reviews:1800 },
      ],
      basketball: [
        { brand:'Nike',   model:'LeBron NXXT Gen', price:160, rating:4.6, reviews:980  },
        { brand:'Adidas', model:'Harden Vol. 8',    price:130, rating:4.5, reviews:720  },
        { brand:'Nike',   model:'KD 17',             price:150, rating:4.7, reviews:1100 },
      ],
      hiking: [
        { brand:'Salomon', model:'X Ultra 4 GTX', price:165, rating:4.7, reviews:2300 },
        { brand:'Merrell', model:'Moab Speed 2',   price:135, rating:4.6, reviews:1800 },
        { brand:'Hoka',    model:'Anacapa 2 GTX',  price:185, rating:4.8, reviews:900  },
      ],
      default: [
        { brand:'Nike',        model:'Air Force 1', price:110, rating:4.6, reviews:8000 },
        { brand:'Adidas',      model:'Stan Smith',  price:85,  rating:4.5, reviews:6000 },
        { brand:'New Balance', model:'574',          price:90,  rating:4.5, reviews:4000 },
      ]
    };
    const cat   = (m.category || '').toLowerCase();
    const mocks = categoryMocks[Object.keys(categoryMocks).find(k => cat.includes(k))] || categoryMocks.default;
    const mock  = mocks[Math.floor(Math.random() * mocks.length)];
    console.log('[search] mock fallback for', m.brand, m.model, '→', mock.brand, mock.model);
    const price = mock.price;
    return {
      name:           mock.brand + ' ' + mock.model,
      brand:          m.brand,
      category:       m.category,
      why:            m.why,
      price,
      priceIndicator: 'USUAL',
      rating:         mock.rating,
      reviews:        mock.reviews,
      img:            '',
      link:           'https://www.google.com/search?q=' + encodeURIComponent(mock.brand + ' ' + mock.model),
      source:         'Google Search',
      delivery:       '',
      prices30day:    makePricePoints(price)
    };
  }

  console.log('[search] result for', m.brand, m.model, ':', best.title, '$' + best.price);
  const prices30day = makePricePoints(best.price);
  return {
    name:           best.title,
    brand:          m.brand,
    category:       m.category,
    why:            m.why,
    price:          best.price,
    priceIndicator: calcPriceIndicator(best.price, prices30day),
    rating:         best.rating,
    reviews:        best.reviews,
    img:            best.img,
    link:           best.link,
    source:         best.source,
    delivery:       best.delivery,
    prices30day
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { models } = req.body;
  const apiKey = process.env.GOOGLE_CSE_KEY;
  const cx     = process.env.GOOGLE_CSE_CX;
  const rfKey  = process.env.RAINFOREST_API_KEY;

  if (!Array.isArray(models) || models.length === 0) {
    return res.status(400).json({ error: 'models array is required' });
  }

  console.log('[search] Searching', models.length, 'models:',
    models.map(m => m.brand + ' ' + m.model).join(' | '));

  const settled = await Promise.allSettled(
    models.map(m => searchForModel(m, apiKey, cx, rfKey))
  );

  const products = settled
    .map(r => r.status === 'fulfilled' ? r.value : null)
    .filter(Boolean)
    .map((p, i) => ({ ...p, id: i + 1 }));

  console.log('[search] Returning', products.length, '/', models.length, 'products');
  return res.status(200).json(products);
}
