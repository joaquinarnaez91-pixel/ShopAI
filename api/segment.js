import Replicate from "replicate";

export default async function handler(req, res) {
  // 1. Verificación de entorno (Debug rápido)
  if (!process.env.REPLICATE_API_TOKEN) {
    return res.status(500).json({ error: "TOKEN DE REPLICATE NO ENCONTRADO EN VERCEL" });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo POST' });
  }

  try {
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    const { imageUrl } = req.body;
    
    // Esto debería disparar el log en Vercel
    console.log("Iniciando segmentación para:", imageUrl);

    const output = await replicate.run(
      "lucataco/sam2:c0f4d306b6539151529a65681944510b64d732890696956636731304917a151b",
      { input: { image: imageUrl } }
    );
    
    return res.status(200).json({ success: true, maskUrl: output });
  } catch (error) {
    // Esto captura cualquier error técnico
    return res.status(500).json({ error: "Error en Replicate: " + error.message });
  }
}