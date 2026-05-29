import { verifyUser } from './_lib/getLumenContext.js';
import { supabaseAdmin } from './_lib/supabase.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { user } = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { signal_type, content } = req.body;
  if (!signal_type) return res.status(400).json({ error: 'signal_type required' });

  await supabaseAdmin
    .from('taste_signals')
    .insert({ user_id: user.id, signal_type, content });

  return res.status(200).json({ ok: true });
}
