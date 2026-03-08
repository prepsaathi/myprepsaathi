// api/current-affairs.js — PrepSaathi
// Lightweight single call - summary OR questions based on ?type= param

const https = require('https');

function callClaude(key, prompt) {
  const reqBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    messages: [{ role: 'user', content: prompt }]
  });
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(reqBody)
      }
    };
    const r = https.request(options, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => resolve({ status: resp.statusCode, body: data }));
    });
    r.on('error', reject);
    r.write(reqBody);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured.' });

  const today = new Date().toLocaleDateString('en-IN', {
    weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Kolkata'
  });

  const type = req.query.type || 'summary';

  let prompt;

  if (type === 'summary') {
    prompt = `UPSC current affairs expert. Today: ${today}.
Return ONLY this JSON, no markdown, no extra text:
{"date":"${today}","summary":"8 sentences on today's UPSC current affairs covering polity, economy, IR, environment, science with facts and scheme names. Start: Today's current affairs covers","summaryHi":"Same 8 sentences Hindi Devanagari. Start: आज के समसामयिक मामलों में","sections":[{"tag":"Polity","heading":"Polity & Governance","headingHi":"राजनीति और शासन","icon":"⚖️","content":"2 sentences polity news with facts","contentHi":"2 sentences Hindi"},{"tag":"Economy","heading":"Economy & Finance","headingHi":"अर्थव्यवस्था","icon":"📈","content":"2 sentences economy news","contentHi":"2 sentences Hindi"},{"tag":"IR","heading":"International Relations","headingHi":"अंतर्राष्ट्रीय संबंध","icon":"🌏","content":"2 sentences IR news","contentHi":"2 sentences Hindi"},{"tag":"Environment","heading":"Environment","headingHi":"पर्यावरण","icon":"🌿","content":"2 sentences environment news","contentHi":"2 sentences Hindi"},{"tag":"Science","heading":"Science & Tech","headingHi":"विज्ञान","icon":"🔬","content":"2 sentences science news","contentHi":"2 sentences Hindi"}],"highlights":[{"title":"EN headline","titleHi":"HI headline","body":"2 sentences EN","bodyHi":"2 sentences HI","tag":"Polity","source":"PIB"},{"title":"EN","titleHi":"HI","body":"2 sentences EN","bodyHi":"2 sentences HI","tag":"Economy","source":"AIR"},{"title":"EN","titleHi":"HI","body":"2 sentences EN","bodyHi":"2 sentences HI","tag":"IR","source":"PIB"},{"title":"EN","titleHi":"HI","body":"2 sentences EN","bodyHi":"2 sentences HI","tag":"Environment","source":"AIR"},{"title":"EN","titleHi":"HI","body":"2 sentences EN","bodyHi":"2 sentences HI","tag":"Science","source":"PIB"}]}
Fill with real UPSC content. Hindi Devanagari only. JSON only.`;

  } else {
    prompt = `UPSC current affairs expert. Today: ${today}.
Return ONLY this JSON, no markdown:
{"questions":[{"q":"UPSC MCQ 1 EN (Consider following statements style)","qHi":"Q1 Hindi Devanagari","options":["A","B","C","D"],"optionsHi":["A HI","B HI","C HI","D HI"],"answer":0,"explanation":"2 sentences EN","explanationHi":"2 sentences HI","subject":"Polity","subjectHi":"राजनीति","source":"PIB"},{"q":"Q2","qHi":"Q2 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"2 sentences","explanationHi":"2 sentences HI","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"AIR"},{"q":"Q3","qHi":"Q3 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"2 sentences","explanationHi":"2 sentences HI","subject":"Environment","subjectHi":"पर्यावरण","source":"PIB"},{"q":"Q4","qHi":"Q4 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"2 sentences","explanationHi":"2 sentences HI","subject":"Geography","subjectHi":"भूगोल","source":"AIR"},{"q":"Q5","qHi":"Q5 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"2 sentences","explanationHi":"2 sentences HI","subject":"History","subjectHi":"इतिहास","source":"PIB"},{"q":"Q6","qHi":"Q6 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"2 sentences","explanationHi":"2 sentences HI","subject":"Science","subjectHi":"विज्ञान","source":"AIR"},{"q":"Q7","qHi":"Q7 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"2 sentences","explanationHi":"2 sentences HI","subject":"IR","subjectHi":"अंतर्राष्ट्रीय संबंध","source":"PIB"},{"q":"Q8","qHi":"Q8 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"2 sentences","explanationHi":"2 sentences HI","subject":"Polity","subjectHi":"राजनीति","source":"AIR"},{"q":"Q9","qHi":"Q9 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"2 sentences","explanationHi":"2 sentences HI","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"PIB"},{"q":"Q10","qHi":"Q10 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"2 sentences","explanationHi":"2 sentences HI","subject":"Governance","subjectHi":"शासन","source":"AIR"}]}
Real UPSC MCQs on today's current affairs. Vary subjects. Hindi Devanagari. JSON only.`;
  }

  try {
    const result = await callClaude(ANTHROPIC_KEY, prompt);

    if (result.status !== 200) {
      const e = JSON.parse(result.body);
      return res.status(502).json({ error: e?.error?.message || 'Claude API error' });
    }

    const claudeJson = JSON.parse(result.body);
    const text = claudeJson.content[0].text.trim()
      .replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();

    const parsed = JSON.parse(text);
    return res.status(200).json(parsed);

  } catch(err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
