const http = require("http");
const fs = require("fs");
const path = require("path");
const https = require("https");

// Load API key from .env
const envPath = path.join(__dirname, "..", ".env");
const envContent = fs.readFileSync(envPath, "utf8");
const apiKey = envContent.match(/ANTHROPIC_API_KEY=(.+)/)[1].trim();

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  // Serve static files
  if (req.method === "GET") {
    let filePath = path.join(__dirname, req.url === "/" ? "ShopAI.html" : req.url);
    const ext = path.extname(filePath);
    const mime = { ".html": "text/html", ".json": "application/json", ".js": "text/javascript", ".css": "text/css" };
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
      res.end(data);
    });
    return;
  }

  // Claude API proxy
  if (req.method === "POST" && req.url === "/api/chat") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      const { messages, system } = JSON.parse(body);
      const payload = JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: system || "You are ShopAI, an expert personal shopping advisor specializing in shoes. You ask smart clarifying questions to understand the customer needs, then provide personalized recommendations with context about why each shoe is great. Keep responses concise, warm, and helpful. Use emojis sparingly.",
        messages
      });

      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(payload)
        }
      };

      const apiReq = https.request(options, apiRes => {
        let data = "";
        apiRes.on("data", chunk => data += chunk);
        apiRes.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(data);
        });
      });

      apiReq.on("error", err => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      });

      apiReq.write(payload);
      apiReq.end();
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(3000, () => {
  console.log("ShopAI running at http://localhost:3000");
  console.log("API key loaded successfully");
});
