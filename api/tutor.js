export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { promptText } = req.body;
    if (!promptText) {
        return res.status(400).json({ error: 'Missing prompt text' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Server API Key not configured' });
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
            })
        });

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to communicate with AI' });
    }
}
