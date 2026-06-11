import https from 'https';
import { verifyUser } from './_lib/getLumenContext.js';
import { supabaseAdmin } from './_lib/supabase.js';
import { prettifyImage } from './_lib/prettifyImage.js';

export const config = { maxDuration: 60 };

// ── GET: list wardrobe items ──────────────────────────────────────────────
async function handleGet(req, res, user) {
  const { data, error } = await supabaseAdmin
    .from('wardrobe_items')
    .select('id, name, category, colors, image_url, tags')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ items: data || [] });
}

// ── DELETE: remove wardrobe item ──────────────────────────────────────────
async function handleDelete(req, res, user) {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });

  const { error } = await supabaseAdmin
    .from('wardrobe_items')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

// ── POST: prettify image + save to wardrobe ───────────────────────────────
async function analyzeGarment(imageBase64, mimeType) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          {
            type: 'text',
            text: 'Analyze this clothing item. ' +
              'Return ONLY valid JSON, no other text:\n' +
              '{"name":"Light Blue Crew Neck T-Shirt","category":"tops","color":"light blue","brand":null,"description":"casual crew neck tee"}\n\n' +
              'Category must be exactly one of: tops, bottoms, dresses, shoes, accessories, outerwear\n' +
              'Name: specific and descriptive.\n' +
              'Brand: only if logo clearly visible, otherwise null.'
          }
        ]
      }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const body = JSON.parse(d);
          const text = body.content.filter(b => b.type === 'text').map(b => b.text).join('');
          resolve(JSON.parse(text.replace(/```json|```/g, '').trim()));
        } catch(e) {
          resolve({ name: 'Clothing Item', category: 'tops', color: 'unknown', brand: null, description: '' });
        }
      });
    });
    req.on('error', () => resolve({ name: 'Clothing Item', category: 'tops', color: 'unknown', brand: null, description: '' }));
    req.write(payload);
    req.end();
  });
}

async function handlePost(req, res, user) {
  // Phase 2: save composited editorial card and create DB record
  if (req.body.action === 'finalize') {
    return handleFinalize(req, res, user);
  }

  // Phase 1: remove background + analyze, return to client for compositing
  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'Image required' });

  console.log('[closet] prettify starting for user:', user.id);

  const [garmentData, cleanBase64] = await Promise.all([
    analyzeGarment(imageBase64, mimeType || 'image/jpeg'),
    prettifyImage(imageBase64, mimeType || 'image/jpeg')
  ]);

  console.log('[closet] identified:', garmentData.name, garmentData.category);
  return res.status(200).json({ cleanBase64, garmentData });
}

async function handleFinalize(req, res, user) {
  const { compositeBase64, name, category, color, brand } = req.body;
  if (!compositeBase64) return res.status(400).json({ error: 'compositeBase64 required' });

  const fileName = 'closet/' + user.id + '/' + Date.now() + '.png';
  const buffer = Buffer.from(compositeBase64, 'base64');

  await supabaseAdmin.storage.createBucket('lumen-closet', { public: true }).catch(() => {});

  const { error: uploadError } = await supabaseAdmin
    .storage.from('lumen-closet')
    .upload(fileName, buffer, { contentType: 'image/png', upsert: false });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabaseAdmin.storage.from('lumen-closet').getPublicUrl(fileName);
  const imageUrl = urlData.publicUrl;

  const { data: item, error: dbError } = await supabaseAdmin
    .from('wardrobe_items')
    .insert({
      user_id: user.id,
      name: name || 'Clothing Item',
      category: category || 'tops',
      colors: [color].filter(Boolean),
      image_url: imageUrl,
      tags: [color, category, brand].filter(Boolean)
    })
    .select()
    .single();

  if (dbError) throw dbError;

  console.log('[closet] saved item:', item.id);
  return res.status(200).json({
    item: {
      id: item.id,
      name: item.name,
      category: item.category,
      color,
      brand: brand || null,
      imageUrl
    }
  });
}

// ── PATCH: add brand to item tags ─────────────────────────────────────────
async function handlePatch(req, res, user) {
  const { id, brand, name } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });

  const updates = {};
  if (name) updates.name = name;

  if (brand !== undefined) {
    const { data: existing } = await supabaseAdmin
      .from('wardrobe_items')
      .select('tags')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();
    updates.tags = [...(existing?.tags || []), brand].filter(Boolean);
  }

  const { error } = await supabaseAdmin
    .from('wardrobe_items')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}

// ── Router ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { user } = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET')    return await handleGet(req, res, user);
    if (req.method === 'POST')   return await handlePost(req, res, user);
    if (req.method === 'PATCH')  return await handlePatch(req, res, user);
    if (req.method === 'DELETE') return await handleDelete(req, res, user);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch(e) {
    console.error('[closet] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
