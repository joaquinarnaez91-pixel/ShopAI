import { verifyUser, getLumenContext } from './_lib/getLumenContext.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end(); return;
  }

  const { user, error } = await verifyUser(req);
  if (error) return res.status(401).json({ error });

  const context = await getLumenContext(user.id);
  return res.status(200).json(context);
}
