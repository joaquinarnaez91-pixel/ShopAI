import { verifyUser, getLumenContext, updateProfile } from './_lib/getLumenContext.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end(); return;
  }

  const { user, error } = await verifyUser(req);
  if (error) return res.status(401).json({ error });

  if (req.method === 'PATCH') {
    const { updates } = req.body || {};
    if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'updates required' });
    await updateProfile(user.id, updates);
    return res.status(200).json({ ok: true });
  }

  const context = await getLumenContext(user.id);
  return res.status(200).json(context);
}
