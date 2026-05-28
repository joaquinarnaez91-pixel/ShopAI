import { supabaseAdmin } from './supabase.js';

export async function verifyUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'No token provided' };
  }

  const token = authHeader.replace('Bearer ', '');

  const { data: { user }, error } = await supabaseAdmin
    .auth.getUser(token);

  if (error || !user) {
    return { user: null, error: 'Invalid token' };
  }

  return { user, error: null };
}

export async function getLumenContext(userId) {
  const [profileRes, historyRes, wardrobeRes] =
    await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single(),
      supabaseAdmin
        .from('chat_history')
        .select('role, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabaseAdmin
        .from('wardrobe_items')
        .select('*')
        .eq('user_id', userId)
        .limit(20)
    ]);

  return {
    profile: profileRes.data || {},
    recentHistory: (historyRes.data || []).reverse(),
    wardrobe: wardrobeRes.data || []
  };
}

export async function saveMessage(userId, role, content,
  tab = 'style_guide', metadata = {}) {
  await supabaseAdmin
    .from('chat_history')
    .insert({ user_id: userId, role, content, tab, metadata });
}

export async function updateProfile(userId, updates) {
  await supabaseAdmin
    .from('profiles')
    .upsert({
      user_id: userId,
      ...updates,
      updated_at: new Date().toISOString()
    });
}

export async function recordTasteSignal(userId, signalType, content = {}) {
  await supabaseAdmin
    .from('taste_signals')
    .insert({ user_id: userId, signal_type: signalType, content });
}
