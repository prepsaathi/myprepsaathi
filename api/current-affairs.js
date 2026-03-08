// api/current-affairs.js — PrepSaathi Current Affairs

const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured.' });
  }

  const today = new Date().toLocaleDateString('en-IN', {
    weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Kolkata'
  });

  // Skip RSS (unreliable on Vercel) — Claude generates from its own knowledge
  const prompt = `You are a UPSC Civil Services exam expert for PrepSaathi, a free IAS prep platform for Indian students.

Today's date: ${today}

Generate today's current affairs content based on your knowledge of recent Indian and global events relevant to UPSC Civil Services Prelims.

Return ONLY a raw JSON object. No markdown. No backticks. No explanation. Just the JSON:

{"summary":"150 word English summary of today's most important UPSC-relevant current affairs. Start with: Today's current affairs covers","summaryHi":"150 शब्दों का हिंदी सारांश। शुरुआत: आज के समसामयिक मामलों में","highlights":[{"title":"English headline","titleHi":"हिंदी शीर्षक","body":"2 sentence English UPSC context","bodyHi":"2 वाक्य हिंदी","tag":"Polity","source":"PIB"},{"title":"English headline","titleHi":"हिंदी शीर्षक","body":"2 sentence English UPSC context","bodyHi":"2 वाक्य हिंदी","tag":"Economy","source":"AIR"},{"title":"English headline","titleHi":"हिंदी शीर्षक","body":"2 sentence English UPSC context","bodyHi":"2 वाक्य हिंदी","tag":"Environment","source":"PIB"},{"title":"English headline","titleHi":"हिंदी शीर्षक","body":"2 sentence English UPSC context","bodyHi":"2 वाक्य हिंदी","tag":"IR","source":"AIR"},{"title":"English headline","titleHi":"हिंदी शीर्षक","body":"2 sentence English UPSC context","bodyHi":"2 वाक्य हिंदी","tag":"Science","source":"PRS"}],"questions":[{"q":"Q1 UPSC style","qHi":"Q1 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"3 sentence explanation","explanationHi":"3 वाक्य हिंदी व्याख्या","subject":"Polity","subjectHi":"राजनीति","source":"PIB"},{"q":"Q2","qHi":"Q2 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"AIR"},{"q":"Q3","qHi":"Q3 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Environment","subjectHi":"पर्यावरण","source":"PIB"},{"q":"Q4","qHi":"Q4 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Geography","subjectHi":"भूगोल","source":"AIR"},{"q":"Q5","qHi":"Q5 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"explanation","explanationHi":"व्याख्या","subject":"History","subjectHi":"इतिहास","source":"PIB"},{"q":"Q6","qHi":"Q6 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Science","subjectHi":"विज्ञान","source":"PRS"},{"q":"Q7","qHi":"Q7 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"explanation","explanationHi":"व्याख्या","subject":"IR","subjectHi":"अंतर्राष्ट्रीय संबंध","source":"AIR"},{"q":"Q8","qHi":"Q8 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Polity","subjectHi":"राजनीति","source":"PIB"},{"q":"Q9","qHi":"Q9 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"AIR"},{"q":"Q10","qHi":"Q10 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Governance","subjectHi":"शासन","source":"PRS"}]}

Fill in all placeholder values with real UPSC-quality content. Keep all Hindi in Devanagari. Return only the JSON.`;

  const reqBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }]
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(reqBody)
        }
      };
      const r = https.request(options, (resp) => {
        let data = '';
        resp.on('data', c => data += c);
        resp.on('end', () => resolve({ status: resp.statusCode, body: data }));
      });
      r.setTimeout(55000, () => { r.destroy(); reject(new Error('Claude timed out')); });
      r.on('error', reject);
      r.write(reqBody);
      r.end();
    });

    console.log('Claude status:', result.status);

    if (result.status !== 200) {
      console.error('Claude error:', result.body);
      const e = JSON.parse(result.body);
      return res.status(502).json({ error: e?.error?.message || 'Claude API error' });
    }

    const claudeJson = JSON.parse(result.body);
    const text = claudeJson.content[0].text.trim()
      .replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();

    const parsed = JSON.parse(text);
    parsed.date = today;
    parsed.articleCount = 0;

    return res.status(200).json(parsed);

  } catch(err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
