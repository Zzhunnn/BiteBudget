// api/parse-meal.js — Vercel Serverless Function (Gemini 餐點記帳與營養解析代理)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '伺服器尚未設定 GEMINI_API_KEY' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const text = String(body.text || '').trim();

    if (!text) {
      return res.status(400).json({ error: '請輸入餐點描述' });
    }
    if (text.length > 200) {
      return res.status(400).json({ error: '輸入文字請控制在 200 字以內' });
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const systemInstruction = `你是專精於「台灣外食記帳與營養估算」的資料解析器。
任務：將使用者輸入的一句話餐點描述，拆解為結構化記帳清單，估算台灣一般外食／超商／小吃店的合理花費（新台幣整數）、熱量（大卡整數）與蛋白質（公克，最多一位小數）。

規則：
1. 若輸入多種品項（例如「滷肉飯配貢丸湯加一顆滷蛋」），拆成多筆項目回傳。
2. 若註明份量或數量（如「兩顆茶葉蛋」、「大碗」），請將價格、熱量、蛋白質乘上對應倍率，並在 name 標示（如「茶葉蛋 x2」）。
3. 若使用者已註明實際花費（如「雞腿便當 115 元」、「合計 150 元」），優先採用使用者提供的金額。
4. 若輸入明顯不是食物或無法辨識（例如亂碼），items 回傳空陣列，並在 note 說明原因。
5. note 用 1 句繁體中文簡要總結估算依據與 CP 值觀察（35 字內）。`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    name: { type: 'STRING' },
                    price: { type: 'INTEGER' },
                    calories: { type: 'INTEGER' },
                    protein: { type: 'NUMBER' },
                  },
                  required: ['name', 'price', 'calories', 'protein'],
                },
              },
              note: { type: 'STRING' },
            },
            required: ['items', 'note'],
          },
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', response.status, errText);
      return res.status(502).json({ error: `Gemini API 呼叫失敗 (${response.status})` });
    }

    const data = await response.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      return res.status(502).json({ error: 'AI 回傳內容為空' });
    }

    const parsed = JSON.parse(rawJson);
    const sanitizedItems = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((item) => item && typeof item.name === 'string' && item.name.trim())
      .map((item) => ({
        name: item.name.trim().slice(0, 60),
        price: Math.max(0, Math.round(Number(item.price) || 0)),
        calories: Math.max(0, Math.round(Number(item.calories) || 0)),
        protein: Math.max(0, Math.round((Number(item.protein) || 0) * 10) / 10),
      }));

    return res.status(200).json({
      items: sanitizedItems,
      note: String(parsed.note || '已完成台灣外食記帳與營養估算').slice(0, 120),
      model,
    });
  } catch (err) {
    console.error('parse-meal handler error:', err);
    return res.status(500).json({ error: '伺服器解析餐點時發生錯誤' });
  }
};