import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'id is required' });

  try {
    const prediction = await replicate.predictions.get(id);

    if (prediction.status === 'succeeded') {
      const out = prediction.output;
      const resultUrl = Array.isArray(out) ? String(out[0]) : String(out);
      return res.status(200).json({ success: true, status: 'succeeded', resultUrl });
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      return res.status(500).json({ success: false, status: prediction.status, error: prediction.error });
    }

    // still processing: starting | processing
    res.status(200).json({ success: false, status: prediction.status });
  } catch (error) {
    console.error('[warp-poll] error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
