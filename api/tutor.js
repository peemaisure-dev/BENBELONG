import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI();

export default async function handler(req, res) {
  // รองรับทั้ง GET และ POST ตามที่หน้าเว็บส่งมา
  const prompt = req.body?.prompt || req.query?.prompt;

  if (!prompt) {
    return res.status(400).json({ error: "No prompt provided" });
  }

  try {
    // ใช้โมเดลรุ่นปัจจุบันที่รองรับ
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return res.status(200).json({ text: response.text });
  } catch (error) {
    console.error("AI Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
