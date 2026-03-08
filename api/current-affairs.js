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

  const prompt = `You are a UPSC expert for PrepSaathi. Today: ${today}.

Generate current affairs content for UPSC Civil Services Prelims aspirants.

Return ONLY valid JSON, no markdown, no backticks, no extra text. Keep all strings concise to fit in response.

JSON structure:
{
  "summary": "120 word English summary starting with: Today current affairs covers",
  "summaryHi": "120 शब्द हिंदी में। शुरुआत: आज के समसामयिक मामलों में",
  "highlights": [
    {"title":"Title EN","titleHi":"शीर्षक","body":"1-2 sentence EN","bodyHi":"1-2 वाक्य हिंदी","tag":"Polity","source":"PIB"},
    {"title":"Title EN","titleHi":"शीर्षक","body":"1-2 sentence EN","bodyHi":"1-2 वाक्य हिंदी","tag":"Economy","source":"AIR"},
    {"title":"Title EN","titleHi":"शीर्षक","body":"1-2 sentence EN","bodyHi":"1-2 वाक्य हिंदी","tag":"Environment","source":"PIB"},
    {"title":"Title EN","titleHi":"शीर्षक","body":"1-2 sentence EN","bodyHi":"1-2 वाक्य हिंदी","tag":"IR","source":"AIR"},
    {"title":"Title EN","titleHi":"शीर्षक","body":"1-2 sentence EN","bodyHi":"1-2 वाक्य हिंदी","tag":"Science","source":"PRS"}
  ],
  "questions": [
    {"q":"UPSC Q1 EN","qHi":"Q1 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"2 sentence EN","explanationHi":"2 वाक्य हिंदी","subject":"Polity","subjectHi":"राजनीति","source":"PIB"},
    {"q":"UPSC Q2 EN","qHi":"Q2 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"2 sentence EN","explanationHi":"2 वाक्य हिंदी","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"AIR"},
    {"q":"UPSC Q3 EN","qHi":"Q3 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"2 sentence EN","explanationHi":"2 वाक्य हिंदी","subject":"Environment","subjectHi":"पर्यावरण","source":"PIB"},
    {"q":"UPSC Q4 EN","qHi":"Q4 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"2 sentence EN","explanationHi":"2 वाक्य हिंदी","subject":"Geography","subjectHi":"भूगोल","source":"AIR"},
    {"q":"UPSC Q5 EN","qHi":"Q5 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"2 sentence EN","explanationHi":"2 वाक्य हिंदी","subject":"History","subjectHi":"इतिहास","source":"PIB"},
    {"q":"UPSC Q6 EN","qHi":"Q6 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"2 sentence EN","explanationHi":"2 वाक्य हिंदी","subject":"Science","subjectHi":"विज्ञान","source":"PRS"},
    {"q":"UPSC Q7 EN","qHi":"Q7 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"2 sentence EN","explanationHi":"2 वाक्य हिंदी","subject":"IR","subjectHi":"अंतर्राष्ट्रीय संबंध","source":"AIR"},
    {"q":"UPSC Q8 EN","qHi":"Q8 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"2 sentence EN","explanationHi":"2 वाक्य हिंदी","subject":"Polity","subjectHi":"राजनीति","source":"PIB"},
    {"q":"UPSC Q9 EN","qHi":"Q9 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"2 sentence EN","explanationHi":"2 वाक्य हिंदी","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"AIR"},
    {"q":"UPSC Q10 EN","qHi":"Q10 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"2 sentence EN","explanationHi":"2 वाक्य हिंदी","subject":"Governance","subjectHi":"शासन","source":"PRS"}
  ]
}

Replace every placeholder with real UPSC-quality content for today. All Hindi in Devanagari. Return ONLY the JSON object.`;

  const reqBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
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

    if (result.status !== 200) {
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
