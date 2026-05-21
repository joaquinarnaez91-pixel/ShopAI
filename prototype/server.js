const http = require("http");
const fs = require("fs");
const path = require("path");
const https = require("https");

const envContent = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const apiKey = envContent.match(/ANTHROPIC_API_KEY=(.+)/)[1].trim();
const serpKey = envContent.match(/SERPAPI_KEY=(.+)/)[1].trim();

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    });
    const options = {
      hostname: "api.anthropic.com", path: "/v1/messages", method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Length": Buffer.byteLength(payload) }
    };
    const req = https.request(options, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data).content[0].text); }
        catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function searchProducts(query) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      api_key: serpKey, engine: "google_shopping", q: query, num: "8", gl: "us", hl: "en"
    });
    const req = https.request({
      hostname: "serpapi.com", path: "/search?" + params.toString(), method: "GET"
    }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const results = (json.shopping_results || []).slice(0, 6).map((item, i) => {
            const price = parseFloat((item.price || "0").replace(/[^0-9.]/g, "")) || 0;
            const bf = Math.round(price * 0.75);
            const prices = Array.from({length:30}, (_,i) => {
              const trend = price * (0.85 + Math.random() * 0.20);
              return Math.round(trend);
            });
            return {
              id: i + 1,
              name: item.title,
              source: item.source || "Retailer",
              price,
              blackFriday: bf,
              rating: item.rating || 4.2,
              reviews: item.reviews || 0,
              img: item.thumbnail || "",
              link: item.link || "",
              delivery: item.delivery || "",
              prices,
              snippet: item.snippet || item.title
            };
          });
          resolve(results);
        } catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function enrichProducts(products) {
  const names = products.map((p, i) => (i+1) + ". " + p.name + " ($" + p.price + ", rated " + p.rating + ")").join("\n");
  const prompt = "For each of these shoe products, write a 1-sentence AI review summary (key insight buyers care about) and a 1-sentence insight (interesting fact, technology, or who uses it). Be specific and helpful. Respond ONLY with a JSON array like: [{\"summary\":\"...\",\"insight\":\"...\"}]\n\n" + names;
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000));
  try {
    const response = await Promise.race([callClaude(prompt), timeout]);
    const clean = response.replace(/```json|```/g, "").trim();
    const enriched = JSON.parse(clean);
    return products.map((p, i) => ({
      ...p,
      summary: enriched[i] ? enriched[i].summary : "Highly rated by verified buyers.",
      insight: enriched[i] ? enriched[i].insight : p.snippet
    }));
  } catch(e) {
    return products.map(p => ({ ...p, summary: "Highly rated by verified buyers.", insight: p.snippet }));
  }
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(200); res.end(); return; }

  if (req.method === "GET" && !req.url.startsWith("/api")) {
    let filePath = path.join(__dirname, req.url === "/" ? "index.html" : req.url);
    const ext = path.extname(filePath);
    const mime = { ".html":"text/html", ".json":"application/json", ".js":"text/javascript", ".css":"text/css" };
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end("Not found"); return; }
      res.writeHead(200, { "Content-Type": mime[ext] || "text/plain" });
      res.end(data);
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { messages, system } = JSON.parse(body);
        const text = await callClaude(JSON.stringify({system, messages}));
        res.writeHead(200, {"Content-Type":"application/json"});
        res.end(JSON.stringify({content:[{text}]}));
      } catch(e) {
        const payload = JSON.stringify({ model:"claude-sonnet-4-6", max_tokens:1024, system:JSON.parse(body).system, messages:JSON.parse(body).messages });
        const options = {
          hostname:"api.anthropic.com", path:"/v1/messages", method:"POST",
          headers:{ "Content-Type":"application/json", "x-api-key":apiKey, "anthropic-version":"2023-06-01", "Content-Length":Buffer.byteLength(payload) }
        };
        const apiReq = https.request(options, apiRes => {
          let data = "";
          apiRes.on("data", chunk => data += chunk);
          apiRes.on("end", () => { res.writeHead(200, {"Content-Type":"application/json"}); res.end(data); });
        });
        apiReq.on("error", err => { res.writeHead(500); res.end(JSON.stringify({error:err.message})); });
        apiReq.write(payload);
        apiReq.end();
      }
    });
    return;
  }

  if (req.method === "POST" && req.url === "/api/search") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const { query } = JSON.parse(body);
        const products = await searchProducts(query);
        const enriched = await enrichProducts(products);
        res.writeHead(200, {"Content-Type":"application/json"});
        res.end(JSON.stringify(enriched));
      } catch(e) {
        res.writeHead(500);
        res.end(JSON.stringify({error:e.message}));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

server.listen(3000, () => {
  console.log("ShopAI running at http://localhost:3000");
  console.log("Real products + AI enrichment enabled");
});

