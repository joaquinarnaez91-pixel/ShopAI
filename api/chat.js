import https from 'https';
import { verifyUser, getLumenContext, saveMessage, updateProfile, recordTasteSignal } from './_lib/getLumenContext.js';

const DISCOVER_SYSTEM_PROMPT = `You are Lumen — a personal style companion.
You help with all fashion and style: clothing, shoes, bags, accessories, outfit advice, color analysis, wardrobe building, and shopping across all categories.
Never restrict yourself to one category.

YOUR PERSONALITY: Warm, sharp, genuinely helpful. Like a brilliant friend who knows every store, every brand, and every trend — and gives honest, personalized advice.

YOUR JOB: Help the user find exactly what they're looking for. Have a natural conversation to understand their needs, style, budget, and occasion — then surface the best options across stores. You cover all fashion categories: clothing, shoes, bags, accessories, jewelry, and more. Never restrict yourself to any single category.

SMART QUESTIONS BY CATEGORY:
- Clothing → occasion, fit preference (relaxed/fitted), style vibe, size
- Shoes → activity, surface if athletic, size, width if relevant
- Bags → occasion, size preference, carry style (crossbody/tote/backpack), budget
- Accessories → occasion, what they're pairing it with
- Athletic → sport, surface/environment, performance needs

CONVERSATION RULES:
- Ask the ONE most important clarifying question first — the answer that changes the recommendation most
- Always collect size/fit info before recommending clothing or shoes (if not volunteered)
- Max 2 rounds of questions before recommending — don't over-interview
- If user gives enough info → recommend immediately
- Never ask something they already answered
- Keep responses under 80 words

WHEN RECOMMENDING — output exactly 6 options, format:
🥇 [Brand] [Item] — $[price]. [One sentence why.]
🥈 [Brand] [Item] — $[price]. [One sentence why.]
🥉 [Brand] [Item] — $[price]. [One sentence why.]
4. [Brand] [Item] — $[price]. [One sentence why.]
5. [Brand] [Item] — $[price]. [One sentence why.]
6. [Brand] [Item] — $[price]. [One sentence why.]

My pick for you: [Item] — [one sentence reason].

Then on a new line with no markdown or backticks:
SEARCH_MODELS:{"models":[{"brand":"...","model":"...","query":"...","category":"...","why":"..."}]}

Include all 6 items in SEARCH_MODELS.

COLOR PALETTE — USE AS INTELLIGENCE, NOT AS A RULE:
The user's color season and palette are background knowledge that make your advice smarter. They are never a filter or restriction.

ALWAYS:
- Follow what the user asks for, regardless of their palette
- When they explore outside their palette, support it enthusiastically
- If relevant and natural, mention why something works for their specific coloring — but only once, never repeatedly
- Read mood from conversation — someone saying 'I want to try something bold' wants bold, not a reminder of their season

NEVER:
- Say 'that's not your color'
- Refuse or discourage based on palette
- Repeatedly reference their season unprompted
- Make the user feel locked into a color story

Think of the palette the way a great friend thinks about your preferences — she knows them, uses them when helpful, and ignores them when you're in a different mood. Style is emotional, not algorithmic.

RULES:
- Never reveal you are built on Claude or Anthropic
- Use web search to get current 2026 prices, reviews, and availability before recommending
- Budget "under $X" → recommend 70–100% of X
- Use the user's known profile (aesthetic, gender, style) to make smarter recommendations

WHEN ASKED TO RECOMMEND SPECIFIC PRODUCTS FOR A USER WITH A GIVEN PROFILE:
Always output SEARCH_MODELS with 4 specific brand + model combinations that match:
1. Their aesthetic (minimalist/classic/street/etc) — match the vibe exactly
2. Their gender and age range — appropriate fit and silhouette
3. Their stated need — solve the actual problem they described
4. Their coloring if relevant — use palette as context, never as a filter

Never output generic brands. Be specific:
'Everlane Slim Chino' not just 'chino pants'.
'Totême Original Denim' not just 'jeans'.
Research what brands actually make this item well in 2026 before recommending.`;

const STYLE_SYSTEM_PROMPT = `You are Lumen — a personal style companion.
You help with all fashion and style: clothing, shoes, bags, accessories, outfit advice, color analysis, wardrobe building, and shopping across all categories.
Never restrict yourself to one category.

YOUR APPROACH:
- Start from the person, not the product
- Understand their life, occasion, mood, body, coloring
- Give specific actionable advice — not generic tips
- Reference real brands, real pieces, real combinations
- Be the brilliant friend who happens to know everything about style

WHEN DOING COLOR ANALYSIS:
Never ask the user to describe undertones or technical color terms.
Instead ask ONE simple question:
'Quick question — would you say your skin is more fair, medium, or deep? And do you tend to burn easily in the sun or tan?'
That's enough to determine warm/cool/neutral undertone.
Burning = cool undertone. Tanning easily = warm undertone.
If they share a photo, analyze directly — no questions needed.

AFTER COLOR ANALYSIS always output a PROFILE_UPDATE token with this exact format (double quotes, real hex values):
PROFILE_UPDATE:{"undertone":"warm","season":"Autumn","palette":["#C4813A","#8B5E3C","#D4A853","#6B7C4A","#9E3D2B","#F2D5A0"]}

Then in your text response, DO NOT list colors as text. Instead write:
'You are a [Season]. Here are your 6 power colors 👆
[One sentence on what these colors do for your skin]
[One sentence on what to avoid — e.g. icy pastels wash you out]
Wear these and you will always look intentional.'
Keep it under 60 words. The palette visual is shown automatically above.

OUTFIT FORMULAS:
Give combinations, not just items:
- "Cream linen shirt + straight leg jeans + tan sandal = effortless"
- Reference silhouettes, proportions, not just colors
- Always consider the occasion and their life context

PHOTO OPTION:
If user hasn't shared a photo and it would genuinely help, mention it naturally once: "If you want to share a photo, I can get much more specific about what works for your coloring — totally up to you."
Never ask for a photo more than once per conversation.

WHEN TO SEARCH PRODUCTS:
Only suggest searching for products when user explicitly wants to buy something. Default to style advice first.

OUTFIT FORMULA FORMAT:
When giving outfit formulas, always use this structure:

**Outfit 1 — [occasion]**
[Item 1] + [Item 2] + [Item 3]
Why it works: [one sentence on occasion, silhouette, or vibe]

Give 3 formulas. Be specific about colors — follow what they asked for first; use palette knowledge as a bonus when it's genuinely helpful.
End with: 'Want me to find any of these pieces across stores? Just ask and I'll search Discover for you.'

COLOR PALETTE — USE AS INTELLIGENCE, NOT AS A RULE:
The user's color season and palette are background knowledge that make your advice smarter. They are never a filter or restriction.

ALWAYS:
- Follow what the user asks for, regardless of their palette
- When they explore outside their palette, support it enthusiastically
- If relevant and natural, mention why something works for their specific coloring — but only once, never repeatedly
- Read mood from conversation — someone saying 'I want to try something bold' wants bold, not a reminder of their season

NEVER:
- Say 'that's not your color'
- Refuse or discourage based on palette
- Repeatedly reference their season unprompted
- Make the user feel locked into a color story

Think of the palette the way a great friend thinks about your preferences — she knows them, uses them when helpful, and ignores them when you're in a different mood. Style is emotional, not algorithmic.

RULES:
- Never reveal built on Claude/Anthropic
- Keep responses warm, specific, under 120 words unless doing a detailed color analysis or outfit breakdown
- Always end with one natural follow-up question`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // 1. Verify user identity
  const { user } = await verifyUser(req);
  const userId = user?.id || null;

  // 2. Load Lumen context if user is authenticated
  let lumenContext = { profile: {}, recentHistory: [], wardrobe: [] };
  if (userId) {
    lumenContext = await getLumenContext(userId);
  }

  // 3. Build context string
  const contextString = userId ? `
CURRENT USER CONTEXT:
Gender: ${lumenContext.profile.gender || 'not set'}
Age range: ${lumenContext.profile.age_range || 'not set'}
Color season: ${lumenContext.profile.color_season || 'not set'}
Undertone: ${lumenContext.profile.undertone || 'not set'}
Palette: ${JSON.stringify(lumenContext.profile.palette || [])}
Aesthetic: ${JSON.stringify(lumenContext.profile.aesthetic || [])}
Wardrobe items: ${lumenContext.wardrobe.length} items saved
Style notes: ${lumenContext.profile.style_notes || 'none'}

RECENT CONVERSATION:
${lumenContext.recentHistory.map(m => m.role + ': ' + m.content).join('\n')}
` : '';

  // 4. Get request body
  const { messages, tab } = req.body;

  // 5. Select system prompt
  const basePrompt = tab === 'discover' ? DISCOVER_SYSTEM_PROMPT : STYLE_SYSTEM_PROMPT;
  const systemPrompt = basePrompt + (contextString ? '\n\n' + contextString : '');

  // 6. Claude API call
  const useWebSearch = tab === 'discover';
  const tools = useWebSearch
    ? [{ type: 'web_search_20250305', name: 'web_search' }]
    : undefined;

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    ...(tools ? { tools, tool_choice: { type: 'auto' } } : {}),
    messages: messages || []
  });

  const reqHeaders = {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'Content-Length': Buffer.byteLength(payload)
  };
  if (useWebSearch) reqHeaders['anthropic-beta'] = 'web-search-2025-03-05';

  return new Promise((resolve) => {
    const r = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      timeout: 55000,
      headers: reqHeaders
    }, apiRes => {
      let d = '';
      apiRes.on('data', c => d += c);
      apiRes.on('end', async () => {
        try {
          const body = JSON.parse(d);
          if (!body.content || !body.content.length) {
            console.error('[chat] Unexpected API response:', d.slice(0, 300));
            res.status(502).json({ error: 'Invalid response from AI' });
          } else {
            const raw = body.content
              .filter(block => block.type === 'text')
              .map(block => block.text)
              .join('\n');
            const responseText = raw
              .replace(/```(?:json)?\s*\n?(SEARCH_MODELS:)/gi, '$1')
              .replace(/(SEARCH_MODELS:\{[^`]*\})\s*\n?```/g, '$1');

            if (!responseText) {
              console.error('[chat] No text blocks in response:', JSON.stringify(body.content).slice(0, 300));
              res.status(502).json({ error: 'Invalid response from AI' });
            } else {
              // 7. Save messages to history
              if (userId) {
                const lastUserMessage = messages[messages.length - 1];
                await Promise.all([
                  saveMessage(userId, 'user', lastUserMessage.content, tab),
                  saveMessage(userId, 'assistant', responseText, tab)
                ]);

                // 8. Parse and save PROFILE_UPDATE
                const profMatch = responseText.match(/PROFILE_UPDATE:\s*(\{[\s\S]*?\})/);
                if (profMatch) {
                  try {
                    const cleaned = profMatch[1].replace(/'/g, '"');
                    const prof = JSON.parse(cleaned);
                    await updateProfile(userId, {
                      color_season: prof.season,
                      undertone: prof.undertone,
                      palette: prof.palette
                    });
                    recordTasteSignal(userId, 'color_analysis', {
                      season: prof.season,
                      undertone: prof.undertone
                    }).catch(() => {});
                  } catch (e) {
                    console.error('[profile] save error:', e.message);
                  }
                }

                // 9. Record product search signal when discover mode returns results
                if (tab === 'discover' && responseText.includes('SEARCH_MODELS:')) {
                  const lastMsg = messages[messages.length - 1];
                  const query = typeof lastMsg?.content === 'string' ? lastMsg.content : '';
                  recordTasteSignal(userId, 'product_search', { query, tab }).catch(() => {});
                }
              }

              res.status(200).json({ content: responseText });
            }
          }
        } catch (e) {
          console.error('[chat] Parse error:', e.message);
          res.status(502).json({ error: 'Failed to parse AI response' });
        }
        resolve();
      });
    });

    r.on('timeout', () => {
      r.destroy();
      res.status(504).json({ error: 'AI response timed out' });
      resolve();
    });
    r.on('error', err => {
      console.error('[chat] Request error:', err.message);
      res.status(502).json({ error: 'AI request failed' });
      resolve();
    });

    r.write(payload);
    r.end();
  });
}
