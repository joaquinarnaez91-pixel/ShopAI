export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end(); return;
  }

  const { action, email, password } = req.body;
  const { supabaseAdmin } = await import('./_lib/supabase.js');

  if (action === 'verify') {
    const { verifyUser } = await import('./_lib/getLumenContext.js');
    const { user, error } = await verifyUser(req);
    if (error) return res.status(401).json({ error });
    return res.status(200).json({ user });
  }

  if (action === 'signup') {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ user: data.user });
  }

  if (action === 'login') {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({
      session: data.session,
      user: data.user
    });
  }

  return res.status(400).json({ error: 'Invalid action' });
}
