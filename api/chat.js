const https = require("https");

export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
    return;
  }

  const { messages, system } = req.body;
  const payload = JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: system || "You are ShopAI, an expert personal shopping advisor specializing in shoes.",
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
      res.status(apiRes.statusCode).setHeader("Content-Type", "application/json").end(data);
    });
  });

  apiReq.on("error", err => {
    res.status(500).json({ error: err.message });
  });

  apiReq.write(payload);
  apiReq.end();
}
