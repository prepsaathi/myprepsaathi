// api/current-affairs.js — PrepSaathi Current Affairs

const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured.' });

  const today = new Date().toLocaleDateString('en-IN', {
    weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Kolkata'
  });

  // Check if a PDF context was provided (from admin upload)
  const pdfContext = req.query.context || null;

  const prompt = `You are a UPSC Civil Services exam expert for PrepSaathi, a free IAS prep platform for Indian students.

Today: ${today}
${pdfContext ? `News source — The Hindu newspaper content:\n${pdfContext}` : 'Generate based on your knowledge of recent UPSC-relevant current affairs.'}

Return ONLY a raw JSON object. No markdown. No backticks. No text outside the JSON.

{
  "summary": "A detailed 12-15 line overview paragraph in English covering today's most important UPSC-relevant events. Include key facts, numbers, names of schemes/policies/countries. Start with: Today's current affairs covers",
  "summaryHi": "Same detailed 12-15 line overview in Hindi Devanagari. Start with: आज के समसामयिक मामलों में",
  "sections": [
    {"tag":"Polity","heading":"Polity & Governance","headingHi":"राजनीति और शासन","icon":"⚖️","content":"3-4 sentences covering today's polity/governance developments with specific facts","contentHi":"Same in Hindi Devanagari"},
    {"tag":"Economy","heading":"Economy & Finance","headingHi":"अर्थव्यवस्था और वित्त","icon":"📈","content":"3-4 sentences on economic developments, RBI, budget, schemes","contentHi":"Same in Hindi Devanagari"},
    {"tag":"IR","heading":"International Relations","headingHi":"अंतर्राष्ट्रीय संबंध","icon":"🌏","content":"3-4 sentences on India's foreign relations, treaties, summits","contentHi":"Same in Hindi Devanagari"},
    {"tag":"Environment","heading":"Environment & Ecology","headingHi":"पर्यावरण और पारिस्थितिकी","icon":"🌿","content":"3-4 sentences on environment, climate, biodiversity news","contentHi":"Same in Hindi Devanagari"},
    {"tag":"Science","heading":"Science & Technology","headingHi":"विज्ञान और प्रौद्योगिकी","icon":"🔬","content":"3-4 sentences on ISRO, tech, health, innovation news","contentHi":"Same in Hindi Devanagari"}
  ],
  "highlights": [
    {"title":"Short headline EN","titleHi":"हिंदी शीर्षक","body":"2 sentence English explanation with UPSC context","bodyHi":"2 वाक्य हिंदी","tag":"Polity","source":"The Hindu"},
    {"title":"Short headline EN","titleHi":"हिंदी शीर्षक","body":"2 sentence English explanation","bodyHi":"2 वाक्य हिंदी","tag":"Economy","source":"PIB"},
    {"title":"Short headline EN","titleHi":"हिंदी शीर्षक","body":"2 sentence English explanation","bodyHi":"2 वाक्य हिंदी","tag":"IR","source":"AIR"},
    {"title":"Short headline EN","titleHi":"हिंदी शीर्षक","body":"2 sentence English explanation","bodyHi":"2 वाक्य हिंदी","tag":"Environment","source":"The Hindu"},
    {"title":"Short headline EN","titleHi":"हिंदी शीर्षक","body":"2 sentence English explanation","bodyHi":"2 वाक्य हिंदी","tag":"Science","source":"PIB"}
  ],
  "questions": [
    {"q":"UPSC Prelims style question in English","qHi":"Same in Hindi Devanagari","options":["Option A","Option B","Option C","Option D"],"optionsHi":["विकल्प A","विकल्प B","विकल्प C","विकल्प D"],"answer":0,"explanation":"3 sentence explanation with UPSC syllabus reference","explanationHi":"3 वाक्य हिंदी व्याख्या","subject":"Polity","subjectHi":"राजनीति","source":"The Hindu"},
    {"q":"Q2","qHi":"Q2 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"PIB"},
    {"q":"Q3","qHi":"Q3 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Environment","subjectHi":"पर्यावरण","source":"The Hindu"},
    {"q":"Q4","qHi":"Q4 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Geography","subjectHi":"भूगोल","source":"AIR"},
    {"q":"Q5","qHi":"Q5 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"explanation","explanationHi":"व्याख्या","subject":"History","subjectHi":"इतिहास","source":"PIB"},
    {"q":"Q6","qHi":"Q6 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Science","subjectHi":"विज्ञान","source":"The Hindu"},
    {"q":"Q7","qHi":"Q7 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"explanation","explanationHi":"व्याख्या","subject":"IR","subjectHi":"अंतर्राष्ट्रीय संबंध","source":"AIR"},
    {"q":"Q8","qHi":"Q8 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Polity","subjectHi":"राजनीति","source":"PIB"},
    {"q":"Q9","qHi":"Q9 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"The Hindu"},
    {"q":"Q10","qHi":"Q10 हिंदी","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"explanation","explanationHi":"व्याख्या","subject":"Governance","subjectHi":"शासन","source":"PIB"}
  ]
}

Replace ALL placeholders with real, accurate, UPSC-quality content. Use UPSC question styles like "Consider the following statements", "Which of the following is/are correct", "Select the correct answer using codes below". All Hindi in Devanagari script only. Return ONLY the JSON.`;

  const reqBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
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
    return res.status(200).json(parsed);

  } catch(err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
