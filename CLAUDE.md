# Lumen — Project Constitution

## Product
Lumen is an AI personal style companion. Vision: visual-first AI stylist. The taste graph is the moat; shopping is a feature. Current goal: shareable MVP for friends/family beta.

## Stack

- **Frontend:** prototype/index.html (single-file SPA)
- **Backend:** Vercel serverless in /api/
- **DB/auth/storage:** Supabase
- **Intelligence:** Claude API (claude-sonnet-4-6) — emits SEARCH_MODELS JSON token, frontend parses → /api/search → SerpAPI
- **Prettify:** Gemini image editing (gemini-2.5-flash-image) in api/prettify.js
- **Keys** in Vercel env + .env (never commit)

## Environment rules (Windows)

- Git only via: `& "C:\Program Files\Git\bin\git.exe" -C "C:\Users\joaqu\Desktop\ShopSense"`
- File writes: Node fs.writeFileSync with utf8. NEVER PowerShell Set-Content (emoji corruption)

## Working style

- One ROADMAP.md task per session unless told otherwise. Small commits, push after each task.
- STOP and ask Joaquin (product owner) for: any product/UX decision, anything ambiguous, anything requiring spend.
- Never mark a visual feature done — end the session listing exactly what Joaquin must test on his phone.
- prototype/index.html is very large: NEVER read it in full. Always use targeted pattern search (Grep) to locate sections.
