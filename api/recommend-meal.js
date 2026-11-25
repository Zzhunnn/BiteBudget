// api/recommend-meal.js — Vercel Serverless Function (Gemini 省錢補蛋白推薦代理)

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
    const remainingBudget = Number(body.remainingBudget) || 0;
    const proteinGap = Math.max(0, Number(body.proteinGap) || 0);
    const caloriesGap = Number(body.caloriesGap) || 0;
    const eatenToday = Array.isArray(body.eatenToday) ? body.eatenToday.slice(0, 10) : [];

    if (remainingBudget <= 0) {
      return res.status(200).json({
        summary: '今日餐費預算已用完，建議優先喝水或回家自備餐點。',
        recommendations: [],
      });
    }

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const systemInstruction = `你是台灣大學生與外食族的「省錢補蛋白」顧問。
請根據使用者剩餘餐費、蛋白質缺口、剩餘熱量額度與今日已吃品項，推薦 3 組在台灣超商（7-11／全家）、便當店、自助餐或平價小吃店容易買到的高 CP 值實際外食組合。

嚴格規則：
1. 每組總價 totalPrice 必須 <= 剩餘餐費預算 remainingBudget。
2. 若蛋白質缺口 > 0，優先挑選「每克蛋白質花費最低（高 CP 值）」且不超出剩餘熱量太多的搭配；若蛋白質已達標，挑選省錢、輕負擔的點心或輕食。
3. 盡量避開使用者今天已經吃過太多次的相同品項。
4. 全程使用繁體中文，reason 簡短點出省錢與補蛋白的亮點（25 字內）。`;

    const userPrompt = `目前狀態：
- 剩餘餐費預算：新台幣 ${remainingBudget} 元
- 蛋白質尚缺：${proteinGap} 公克
- 剩餘熱量額度：${caloriesGap} 大卡
- 今日已吃過的餐點：${eatenToday.length > 0 ? eatenToday.join('、') : '尚未進食'}

請提供 3 組台灣高 CP 值外食搭配。`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.6,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              summary: { type: 'STRING' },
              recommendations: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    title: { type: 'STRING' },
                    totalPrice: { type: 'INTEGER' },
                    totalCalories: { type: 'INTEGER' },
                    totalProtein: { type: 'NUMBER' },
                    whereToBuy: { type: 'STRING' },
                    reason: { type: 'STRING' },
                  },
                  required: ['title', 'totalPrice', 'totalCalories', 'totalProtein', 'whereToBuy', 'reason'],
                },
              },
            },
            required: ['summary', 'recommendations'],
          },
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini recommend error:', response.status, errText);
      return res.status(502).json({ error: `Gemini 推薦請求失敗 (${response.status})` });
    }

    const data = await response.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      return res.status(502).json({ error: 'AI 推薦回傳為空' });
    }

    const parsed = JSON.parse(rawJson);
    const recommendations = (Array.isArray(parsed.recommendations) ? parsed.recommendations : [])
      .slice(0, 3)
      .map((rec) => ({
        title: String(rec.title || '推薦外食組合').trim(),
        totalPrice: Math.max(0, Math.round(Number(rec.totalPrice) || 0)),
        totalCalories: Math.max(0, Math.round(Number(rec.totalCalories) || 0)),
        totalProtein: Math.max(0, Math.round((Number(rec.totalProtein) || 0) * 10) / 10),
        whereToBuy: String(rec.whereToBuy || '台灣常見外食').trim(),
        reason: String(rec.reason || '').trim(),
      }));

    return res.status(200).json({
      summary: String(parsed.summary || '以下為 Gemini AI 依剩餘預算與蛋白質缺口產出的高 CP 值搭配：'),
      recommendations,
      model,
    });
  } catch (err) {
    console.error('recommend-meal handler error:', err);
    return res.status(500).json({ error: '伺服器產生推薦時發生錯誤' });
  }
};