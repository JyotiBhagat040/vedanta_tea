const router = require('express').Router();
const axios = require('axios');
const { pool } = require('../db/pool');

// ── POST /api/ai/suggest ─────────────────────────────────────────────────────
// Get AI suggestions for marking based on historical data
router.post('/suggest', async (req, res) => {
  const { party_id, sale_no, weeks = 2 } = req.body;

  // Fetch historical data (last 2 or 4 weeks of sold data for this party's gardens)
  const { rows: history } = await pool.query(
    `SELECT s.garden, s.grade, s.mark, s.deal_price, s.bags, s.net_wt, s.sale_no, s.week_date
     FROM sold_list s
     JOIN party_garden_mapping pgm ON pgm.garden = s.garden AND pgm.party_id = $1
     WHERE s.week_date >= NOW() - INTERVAL '${weeks === 4 ? 28 : 14} days'
     ORDER BY s.week_date DESC, s.garden, s.grade`,
    [party_id]
  );

  // Fetch current catalogue for this party
  const { rows: catalogue } = await pool.query(
    `SELECT c.garden, c.grade, c.mark, c.bags, c.net_wt, c.last_sale_price, c.broker
     FROM catalogue c
     JOIN party_garden_mapping pgm ON pgm.garden = c.garden AND pgm.party_id = $1
     WHERE c.sale_no = $2`,
    [party_id, sale_no]
  );

  if (catalogue.length === 0)
    return res.json({ suggestions: [], reason: 'No catalogue data for this party/sale' });

  // Rule-based suggestion (always works, no AI required)
  const ruleBased = generateRuleBasedSuggestions(catalogue, history);

  // Try AI if configured
  let aiSuggestions = null;
  try {
    if (process.env.AI_PROVIDER === 'ollama') {
      aiSuggestions = await getOllamaSuggestions(catalogue, history);
    } else if (process.env.AI_PROVIDER === 'huggingface') {
      aiSuggestions = await getHuggingFaceSuggestions(catalogue, history);
    }
  } catch (e) {
    console.log('AI provider failed, using rule-based:', e.message);
  }

  res.json({
    suggestions: aiSuggestions || ruleBased,
    method: aiSuggestions ? process.env.AI_PROVIDER : 'rule-based',
    history_weeks: weeks,
    history_count: history.length
  });
});

function generateRuleBasedSuggestions(catalogue, history) {
  return catalogue.map(item => {
    // Find matching history entries
    const matches = history.filter(h =>
      h.garden === item.garden &&
      h.grade === item.grade
    );

    let suggested_price = item.last_sale_price;
    let confidence = 'low';
    let reasoning = 'Based on catalogue last sale price';

    if (matches.length > 0) {
      const prices = matches.map(m => parseFloat(m.deal_price)).filter(p => p > 0);
      if (prices.length > 0) {
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
        const latest = parseFloat(matches[0].deal_price);
        // Trend: if latest > avg, price rising
        const trend = latest > avg ? 'rising' : latest < avg ? 'falling' : 'stable';
        suggested_price = trend === 'rising'
          ? Math.round(latest * 1.02 * 100) / 100  // suggest slight premium
          : Math.round(latest * 100) / 100;
        confidence = prices.length >= 3 ? 'high' : 'medium';
        reasoning = `${prices.length} weeks of data, trend: ${trend}, avg: ${avg.toFixed(2)}`;
      }
    }

    return {
      garden: item.garden,
      grade: item.grade,
      mark: item.mark,
      bags: item.bags,
      net_wt: item.net_wt,
      suggested_price,
      confidence,
      reasoning,
      skip_suggested: !item.last_sale_price && matches.length === 0
    };
  });
}

async function getOllamaSuggestions(catalogue, history) {
  const prompt = `You are a tea auction pricing expert. Based on historical sold data and current catalogue, suggest prices for each lot.

Historical data (last weeks): ${JSON.stringify(history.slice(0, 20))}

Current catalogue lots to mark: ${JSON.stringify(catalogue.slice(0, 20))}

Respond ONLY with a JSON array. Each element: { "garden": "...", "grade": "...", "mark": "...", "suggested_price": 0.00, "confidence": "high|medium|low", "reasoning": "..." }
Do not include any text outside the JSON array.`;

  const response = await axios.post(`${process.env.OLLAMA_URL}/api/generate`, {
    model: 'llama3',
    prompt,
    stream: false,
    options: { temperature: 0.2 }
  }, { timeout: 30000 });

  const text = response.data.response;
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  return null;
}

async function getHuggingFaceSuggestions(catalogue, history) {
  const prompt = `Tea auction pricing. History: ${JSON.stringify(history.slice(0, 10))}. Catalogue: ${JSON.stringify(catalogue.slice(0, 10))}. Return JSON array with suggested_price for each lot.`;

  const response = await axios.post(
    'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2',
    { inputs: prompt, parameters: { max_new_tokens: 500 } },
    {
      headers: { Authorization: `Bearer ${process.env.HF_API_KEY}` },
      timeout: 30000
    }
  );

  const text = response.data[0]?.generated_text || '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  return null;
}

// ── GET /api/ai/status ───────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  let ollamaOk = false;
  try {
    if (process.env.AI_PROVIDER === 'ollama') {
      await axios.get(`${process.env.OLLAMA_URL}/api/tags`, { timeout: 3000 });
      ollamaOk = true;
    }
  } catch (e) {}

  res.json({
    provider: process.env.AI_PROVIDER || 'rule-based',
    ollama_available: ollamaOk,
    fallback: 'rule-based (always available)'
  });
});

module.exports = router;
