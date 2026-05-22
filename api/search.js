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

function makePricePoints(price) {
  const pts = Array.from({length: 30}, (_,j) => {
    const wave = Math.sin(j/4) * 0.04;
    const noise = (Math.sin(j*7.3+price) - 0.5) * 0.03;
    return Math.round(price * (1 + wave + noise));
  });
  pts[29] = price;
  return pts;
}

async function serpSearch(query, serpKey, timeoutMs = 7000, numResults = 30) {
  const params = new URLSearchParams({
    api_key: serpKey, engine: 'google_shopping', q: query, num: String(numResults), gl: 'us', hl: 'en'
  });
  const data = await httpsGet('https://serpapi.com/search?' + params.toString(), timeoutMs);
  return (data.shopping_results || []).slice(0, numResults).map(item => {
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

async function walmartSearch(query, serpKey) {
  const params = new URLSearchParams({
    api_key: serpKey, engine: 'walmart', query: query, ps: '15'
  });
  const data = await httpsGet('https://serpapi.com/search?' + params.toString());
  return (data.organic_results || []).slice(0, 15).map(item => {
    const raw = item.primary_offer ? item.primary_offer.offer_price : (item.price || 0);
    const price = typeof raw === 'string'
      ? parseFloat(raw.replace(/[^0-9.]/g, '')) || 0
      : parseFloat(raw) || 0;
    return {
      name: item.title || '',
      source: 'Walmart',
      brand: item.brand || '',
      price,
      rating: item.rating || 4.0,
      reviews: item.reviews || 0,
      img: item.thumbnail || '',
      link: item.product_page_url || item.item_link || 'https://walmart.com',
      delivery: stripHtml(item.delivery || 'Free shipping on orders $35+'),
      prices: makePricePoints(price),
      snippet: item.title || '',
      summary: '',
      insight: item.title || ''
    };
  }).filter(p => p.price > 0);
}

async function rainforestSearch(query, rfKey) {
  const params = new URLSearchParams({
    api_key: rfKey, type: 'search', amazon_domain: 'amazon.com', search_term: query
  });
  const data = await httpsGet('https://api.rainforestapi.com/request?' + params.toString());
  return (data.search_results || [])
    .filter(item => item.price !== undefined)
    .slice(0, 20)
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

function extractBudget(userQuery) {
  const q = (userQuery || '').toLowerCase();
  if (/budget|cheap|affordable|inexpensive/.test(q)) return { min: 0, max: Infinity };
  const m = q.match(/under\s*\$?(\d+)/);
  if (m) {
    const max = parseInt(m[1]);
    const min = Math.round(max * 0.50);
    return { min, max };
  }
  const m2 = q.match(/\$(\d+)\s*[-–]\s*\$?(\d+)/);
  if (m2) return { min: parseInt(m2[1]), max: parseInt(m2[2]) };
  const m3 = q.match(/(\d+)\s*[-–]\s*(\d+)\s*dollar/);
  if (m3) return { min: parseInt(m3[1]), max: parseInt(m3[2]) };
  return null;
}

function extractCategory(userQuery) {
  const q = (userQuery || '').toLowerCase();
  if (/\brunning\b|\bjogging\b|\bmarathon\b|\brun\b/.test(q)) return 'running';
  if (/\bhiking\b|\btrail\b|\btrekking\b/.test(q)) return 'hiking';
  if (/\bbasketball\b/.test(q)) return 'basketball';
  if (/\btennis\b|\bpickleball\b/.test(q)) return 'tennis';
  if (/\bcasual\b|\bsneaker\b|\blifestyle\b|\bwalking\b/.test(q)) return 'casual';
  return null;
}

const CATEGORY_TERMS = {
  running:    [/running/i, /trainer/i, /athletic/i, /marathon/i, /jogging/i],
  hiking:     [/hiking/i, /trail/i, /boot/i, /trekking/i, /outdoor/i],
  basketball: [/basketball/i, /court/i],
  tennis:     [/tennis/i, /court/i, /pickleball/i],
  casual:     [/sneaker/i, /casual/i, /lifestyle/i, /walking/i, /canvas/i, /slip.on/i]
};

function matchesCategory(productName, category) {
  const terms = CATEGORY_TERMS[category];
  if (!terms) return true;
  return terms.some(re => re.test(productName));
}

function dedupeByModel(products) {
  const groups = new Map();
  products.forEach(p => {
    const words = p.name.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).slice(0, 5).join(' ');
    if (!groups.has(words) || p.price > (groups.get(words).price || 0)) {
      groups.set(words, p);
    }
  });
  return Array.from(groups.values());
}

const BRAND_BLOCKLIST = ['ALO', 'Fashion Nova', 'Steve Madden', 'H&M', 'Zara', 'Forever 21'];

function applyQualityFilters(products, category) {
  return products.filter(p => {
    const nameLower = (p.name || '').toLowerCase();
    const brandLower = (p.brand || '').toLowerCase();
    if (BRAND_BLOCKLIST.some(b => nameLower.includes(b.toLowerCase()) || brandLower.includes(b.toLowerCase()))) return false;
    if (p.source === 'Walmart' && category === 'running' && p.price > 0 && p.price < 80) return false;
    return true;
  });
}

async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });
    const r = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(payload)
      }
    }, apiRes => {
      let d = '';
      apiRes.on('data', c => d += c);
      apiRes.on('end', () => { try { resolve(JSON.parse(d).content[0].text); } catch(e) { reject(e); } });
    });
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    r.on('error', reject);
    r.write(payload); r.end();
  });
}

async function doRerank(products, userProfile, userQuery) {
  const prompt = `You are an expert personal shopping advisor. Re-rank these shoes for this specific user.

USER PROFILE: ${JSON.stringify(userProfile)}
USER QUERY: ${userQuery}

PRODUCTS TO RANK:
${products.map((p,i) => `${i}. ${p.name} - $${p.price} - ${p.source} - Rating: ${p.rating} (${p.reviews} reviews)`).join('\n')}

RANKING PRIORITIES (in order of importance):
1. FUNCTION first — if user says running shoes, only include actual running shoes. Eliminate anything that is not the right category. Score wrong-category items 1-2.
2. BUDGET interpretation — "under $X" means the user wants options CLOSE to $X, not far below it. If user says under $200, prioritize shoes between $120-200. Shoes under $80 should score 3 or lower unless user specifically said budget or cheap.
3. FIT — foot type, size, use case (street vs trail vs casual)
4. STYLE — color, brand preference, aesthetics come LAST

For EACH product write a unique reason that references the USER'S SPECIFIC inputs (their foot type, budget, use case). Example: "Matches your street running needs with bold colorway, priced at $165 within your $200 budget."

Return ONLY valid JSON array: [{"index": 0, "score": 9, "reason": "...specific to this user..."}, ...]
Maximum 6 products. Every reason must be unique and reference the user's query.`;

  const response = await callClaude(prompt);
  const clean = response.replace(/```json|```/g, '').trim();
  const ranked = JSON.parse(clean);
  return ranked
    .filter(r => r.index >= 0 && r.index < products.length && r.score >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(r => ({ ...products[r.index], aiScore: r.score, aiReason: r.reason }));
}

async function rerankProducts(products, userProfile, userQuery) {
  const fallback = products.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6);
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('rerank timeout')), 4500));
    const result = await Promise.race([doRerank(products, userProfile, userQuery), timeout]);
    return result.length >= 3 ? result : fallback;
  } catch(e) {
    console.log('[search] Re-rank skipped:', e.message, '— using rating sort');
    return fallback;
  }
}

async function getExpertRecommendations(userQuery, userProfile) {
  const prompt = `You are a world-class footwear expert with deep knowledge of every shoe brand and model.

USER NEEDS: ${userQuery}
USER PROFILE: ${JSON.stringify(userProfile || {})}

Name exactly 6 specific shoe models that best fit this user. Think like a personal shopping expert.

Rules:
- For budget "under $X": recommend shoes in the range of 50%-100% of that budget (not cheap shoes unless user said budget/cheap)
- Be specific with model names and version numbers (e.g. "Nike Pegasus 41" not "Nike running shoe")
- Include a mix: best overall, best value, best for their specific use case
- Match category to what the user asked (running, hiking, casual, basketball, tennis)

Return ONLY a valid JSON array with exactly 6 objects, no other text:
[{"brand":"Nike","model":"Pegasus 41","searchQuery":"Nike Pegasus 41 mens running shoe","whyThisUser":"One sentence why this model fits this user's stated needs","priceRange":"$130-$160","category":"running","technology":"One sentence about the key cushioning or performance technology"}]

category must be exactly one of: running, hiking, basketball, tennis, casual`;

  const text = await callClaude(prompt);
  const clean = text.replace(/```json|```/g, '').trim();
  const picks = JSON.parse(clean);
  if (!Array.isArray(picks) || picks.length < 4) throw new Error('invalid expert picks response');
  picks.forEach(p => {
    if (!p.brand || !p.model || !p.searchQuery || !p.whyThisUser || !p.category) throw new Error('missing required fields');
  });
  return picks;
}

function matchExpertPicks(expertPicks, targetedResults, broadPool) {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const pickKey = p => norm(p.name || '').substring(0, 50);
  const usedKeys = new Set();
  let broadIdx = 0;

  return expertPicks.map((pick, i) => {
    const brandNorm = norm(pick.brand);
    const modelWords = norm(pick.model).split(/\s+/).filter(w => w.length > 1).slice(0, 2).join(' ');
    const candidates = targetedResults[i] && targetedResults[i].status === 'fulfilled'
      ? targetedResults[i].value : [];

    // Tier 1: name contains brand AND first 2 model words
    let match = candidates.find(c => {
      const n = norm(c.name);
      return n.includes(brandNorm) && modelWords && n.includes(modelWords);
    });

    // Tier 2: token overlap score >= 2
    if (!match) {
      const tokens = norm(pick.brand + ' ' + pick.model).split(/\s+/).filter(t => t.length > 2);
      let best = null, bestScore = 0;
      for (const c of candidates) {
        const n = norm(c.name);
        const score = tokens.filter(t => n.includes(t)).length;
        if (score > bestScore) { bestScore = score; best = c; }
      }
      if (bestScore >= 2) match = best;
    }

    if (match) {
      const key = pickKey(match);
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        return { ...match, whyThisUser: pick.whyThisUser, category: pick.category, technology: pick.technology, expertMatched: true };
      }
    }

    // Tier 3: broad pool fallback
    while (broadIdx < broadPool.length) {
      const p = broadPool[broadIdx++];
      const key = pickKey(p);
      if (!usedKeys.has(key)) {
        usedKeys.add(key);
        return { ...p, _fallbackSlot: true };
      }
    }
    return null;
  }).filter(Boolean);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { query, userProfile, userQuery } = req.body;
  const serpKey = process.env.SERPAPI_KEY;
  const rfKey = process.env.RAINFOREST_API_KEY;
  const effectiveQuery = userQuery || query;

  // T=0: fire broad safety-net search unconditionally
  const broadSearchPromise = Promise.allSettled([
    serpSearch(query, serpKey),
    rfKey ? rainforestSearch(query, rfKey) : Promise.resolve([]),
    walmartSearch(query, serpKey)
  ]);

  // T=0: fire Claude expert curation with 3.5s hard abort
  const expertPicksPromise = Promise.race([
    getExpertRecommendations(effectiveQuery, userProfile || {}),
    new Promise((_, rej) => setTimeout(() => rej(new Error('expert timeout')), 8000))
  ]).catch(err => { console.log('[search] Expert picks skipped:', err.message); return null; });

  const expertPicks = await expertPicksPromise;

  if (!expertPicks) {
    // Fallback path: broad search + existing filter pipeline
    const [serpResult, rfResult, wmtResult] = await broadSearchPromise;
    const serpProducts = serpResult.status === 'fulfilled' ? serpResult.value : [];
    const rfProducts   = rfResult.status === 'fulfilled'   ? rfResult.value   : [];
    const wmtProducts  = wmtResult.status === 'fulfilled'  ? wmtResult.value  : [];
    if (serpResult.status === 'rejected') console.log('[search] SerpAPI error:', serpResult.reason?.message);
    if (rfResult.status === 'rejected')   console.log('[search] Rainforest error:', rfResult.reason?.message);
    if (wmtResult.status === 'rejected')  console.log('[search] Walmart error:', wmtResult.reason?.message);
    const raw = dedupe([...rfProducts, ...wmtProducts, ...serpProducts]).slice(0, 45);
    console.log('[search] Fallback — before filter:', raw.length);
    const budget = extractBudget(effectiveQuery);
    const category = extractCategory(effectiveQuery);
    let filtered = raw;
    if (budget) {
      const withMin = filtered.filter(p => p.price > 0 && p.price <= budget.max && p.price >= budget.min);
      const withoutMin = filtered.filter(p => p.price > 0 && p.price <= budget.max);
      filtered = withMin.length >= 5 ? withMin : withoutMin;
    }
    if (category) {
      const catFiltered = filtered.filter(p => matchesCategory(p.name, category));
      if (catFiltered.length >= 3) filtered = catFiltered;
    }
    filtered = applyQualityFilters(dedupeByModel(filtered), category);
    const final = filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 8).map((p, i) => ({ ...p, id: i + 1 }));
    console.log('[expert] path: FALLBACK');
    console.log(`[search] Fallback → ${final.length} results`);
    return res.status(200).json(final);
  }

  // Expert path: run one targeted search per pick (5s cap, 5 results each)
  console.log('[search] Expert picks:', expertPicks.map(p => p.brand + ' ' + p.model).join(' | '));
  const targetedResults = await Promise.allSettled(
    expertPicks.map(pick => serpSearch(pick.searchQuery, serpKey, 5000, 5))
  );
  console.log('[search] Targeted hits:', targetedResults.map(r => r.status === 'fulfilled' ? r.value.length : 0).join(','));

  // Broad pool for Tier 3 fallback slots (may already be resolved)
  const [serpResult, rfResult, wmtResult] = await broadSearchPromise;
  const broadPool = dedupe([
    ...(serpResult.status === 'fulfilled' ? serpResult.value : []),
    ...(rfResult.status === 'fulfilled'   ? rfResult.value   : []),
    ...(wmtResult.status === 'fulfilled'  ? wmtResult.value  : [])
  ]);

  const expertCategory = extractCategory(effectiveQuery) || (expertPicks[0] && expertPicks[0].category) || null;
  const matched = applyQualityFilters(matchExpertPicks(expertPicks, targetedResults, broadPool), expertCategory);
  const final = dedupeByModel(matched).slice(0, 6).map((p, i) => ({ ...p, id: i + 1 }));
  console.log('[expert] path: SUCCESS');
  console.log(`[search] Expert → ${final.length} results`);
  return res.status(200).json(final);
}
