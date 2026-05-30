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
  const [profileRes, historyRes, wardrobeRes, signalsRes] =
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
        .limit(20),
      supabaseAdmin
        .from('taste_signals')
        .select('signal_type, content')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
    ]);

  const signals  = signalsRes.data || [];
  const likes    = signals.filter(s => s.signal_type === 'positive');
  const dislikes = signals.filter(s => s.signal_type === 'negative');

  let tasteSummary = '';
  if (signals.length > 0) {
    const likedVibes    = [...new Set(likes.flatMap(s => s.content?.outfit_label ? [s.content.outfit_label] : []).slice(0, 5))];
    const likedColors   = [...new Set(likes.flatMap(s => s.content?.colors || []).slice(0, 10))];
    const dislikedVibes = [...new Set(dislikes.flatMap(s => s.content?.outfit_label ? [s.content.outfit_label] : []).slice(0, 5))];
    tasteSummary =
      '\n\nUSER TASTE PROFILE (from interactions):\n' +
      (likedVibes.length    ? 'Likes: '           + likedVibes.join(', ')    + '\n' : '') +
      (likedColors.length   ? 'Favorite colors: ' + likedColors.join(', ')   + '\n' : '') +
      (dislikedVibes.length ? 'Dislikes: '        + dislikedVibes.join(', ') + '\n' : '') +
      'Use this to personalize ALL recommendations.';
  }

  return {
    profile: profileRes.data || {},
    recentHistory: (historyRes.data || []).reverse(),
    wardrobe: wardrobeRes.data || [],
    tasteSummary
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
