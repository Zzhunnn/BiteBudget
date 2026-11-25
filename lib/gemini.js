// lib/gemini.js — 共用 Gemini 呼叫模組（含 503/429 自動重試與備援模型切換）
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGeminiWithRetry({ apiKey, payload, primaryModel, fallbackModel }) {
  const models = [...new Set([primaryModel, fallbackModel].filter(Boolean))];
  let lastStatus = 502;
  let lastErrorText = '';

  for (const model of models) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    // 每個模型最多嘗試 2 次（遇 503 高流量或 429 限流時等 1 秒重試）
    for (let attempt = 1; attempt <= 2; attempt++) {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = await response.json();
        return { ok: true, data, model };
      }

      lastStatus = response.status;
      lastErrorText = await response.text();
      console.error(`Gemini error [${model}] attempt ${attempt}:`, lastStatus, lastErrorText);

      if ((lastStatus === 503 || lastStatus === 429) && attempt === 1) {
        await sleep(1000);
        continue;
      }
      break;
    }
  }

  return { ok: false, status: lastStatus, errorText: lastErrorText };
}

module.exports = { callGeminiWithRetry };