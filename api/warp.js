import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // GET ?id=<predictionId> → poll status (absorbed from warp-poll.js)
  if (req.method === 'GET') {
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

      return res.status(200).json({ success: false, status: prediction.status });
    } catch (error) {
      console.error('[warp] poll error:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  // POST → start new try-on prediction
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { personUrl, productUrl, part = 'upper_body' } = req.body;
  if (!personUrl || !productUrl) {
    return res.status(400).json({ error: 'personUrl and productUrl are required' });
  }
  const validParts = ['upper_body', 'lower_body', 'lower_half', 'dresses'];
  if (!validParts.includes(part)) {
    return res.status(400).json({ error: 'part must be one of: ' + validParts.join(', ') });
  }

  try {
    const prediction = await replicate.predictions.create({
      version: "a02643ce418c0e12bad371c4adbfaec0dd1cb34b034ef37650ef205f92ad6199",
      input: { image: personUrl, garment: productUrl, part }
    });
    res.status(202).json({ success: true, predictionId: prediction.id, status: prediction.status });
  } catch (error) {
    console.error('[warp] error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
