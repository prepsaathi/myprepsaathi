// api/upload-hindu.js — Receives The Hindu PDF, sends to Claude, stores context

const https = require('https');

// Simple in-memory store for today's PDF context
// On Vercel, this persists within a function instance
// For production, use Vercel KV or similar
let todayContext = null;
let contextDate = null;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — return stored context
  if (req.method === 'GET') {
    return res.status(200).json({ context: todayContext, date: contextDate });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured.' });

  const { pdf, filename } = req.body;
  if (!pdf) return res.status(400).json({ error: 'No PDF data provided.' });

  const today = new Date().toLocaleDateString('en-IN', {
    weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Kolkata'
  });

  // Send PDF to Claude with vision/document capability
  const reqBody = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdf
          }
        },
        {
          type: 'text',
          text: `You are a UPSC expert. Today: ${today}.

This is The Hindu newspaper PDF. Extract and summarize all UPSC-relevant content.

Return ONLY a raw JSON object (no markdown, no backticks):

{
  "summary": "Detailed 12-15 line overview in English of today's most important UPSC-relevant news from The Hindu. Include key facts, numbers, scheme names, country names. Start with: Today's current affairs covers",
  "summaryHi": "Same detailed summary in Hindi Devanagari 12-15 lines. Start with: आज के समसामयिक मामलों में",
  "sections": [
    {"tag":"Polity","heading":"Polity & Governance","headingHi":"राजनीति और शासन","icon":"⚖️","content":"3-4 sentences from The Hindu on polity/governance","contentHi":"Same in Hindi"},
    {"tag":"Economy","heading":"Economy & Finance","headingHi":"अर्थव्यवस्था और वित्त","icon":"📈","content":"3-4 sentences on economy from The Hindu","contentHi":"Same in Hindi"},
    {"tag":"IR","heading":"International Relations","headingHi":"अंतर्राष्ट्रीय संबंध","icon":"🌏","content":"3-4 sentences on IR from The Hindu","contentHi":"Same in Hindi"},
    {"tag":"Environment","heading":"Environment & Ecology","headingHi":"पर्यावरण और पारिस्थितिकी","icon":"🌿","content":"3-4 sentences on environment from The Hindu","contentHi":"Same in Hindi"},
    {"tag":"Science","heading":"Science & Technology","headingHi":"विज्ञान और प्रौद्योगिकी","icon":"🔬","content":"3-4 sentences on science from The Hindu","contentHi":"Same in Hindi"}
  ],
  "highlights": [
    {"title":"Headline from The Hindu","titleHi":"हिंदी शीर्षक","body":"2 sentence explanation","bodyHi":"2 वाक्य हिंदी","tag":"Polity","source":"The Hindu"},
    {"title":"Headline","titleHi":"शीर्षक","body":"explanation","bodyHi":"हिंदी","tag":"Economy","source":"The Hindu"},
    {"title":"Headline","titleHi":"शीर्षक","body":"explanation","bodyHi":"हिंदी","tag":"IR","source":"The Hindu"},
    {"title":"Headline","titleHi":"शीर्षक","body":"explanation","bodyHi":"हिंदी","tag":"Environment","source":"The Hindu"},
    {"title":"Headline","titleHi":"शीर्षक","body":"explanation","bodyHi":"हिंदी","tag":"Science","source":"The Hindu"}
  ],
  "questions": [
    {"q":"UPSC Prelims style question from today's Hindu","qHi":"Hindi","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"3 sentence explanation","explanationHi":"हिंदी व्याख्या","subject":"Polity","subjectHi":"राजनीति","source":"The Hindu"},
    {"q":"Q2","qHi":"Q2","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"exp","explanationHi":"व्याख्या","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"The Hindu"},
    {"q":"Q3","qHi":"Q3","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"exp","explanationHi":"व्याख्या","subject":"Environment","subjectHi":"पर्यावरण","source":"The Hindu"},
    {"q":"Q4","qHi":"Q4","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"exp","explanationHi":"व्याख्या","subject":"Geography","subjectHi":"भूगोल","source":"The Hindu"},
    {"q":"Q5","qHi":"Q5","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"exp","explanationHi":"व्याख्या","subject":"History","subjectHi":"इतिहास","source":"The Hindu"},
    {"q":"Q6","qHi":"Q6","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"exp","explanationHi":"व्याख्या","subject":"Science","subjectHi":"विज्ञान","source":"The Hindu"},
    {"q":"Q7","qHi":"Q7","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"exp","explanationHi":"व्याख्या","subject":"IR","subjectHi":"अंतर्राष्ट्रीय संबंध","source":"The Hindu"},
    {"q":"Q8","qHi":"Q8","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"exp","explanationHi":"व्याख्या","subject":"Polity","subjectHi":"राजनीति","source":"The Hindu"},
    {"q":"Q9","qHi":"Q9","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"exp","explanationHi":"व्याख्या","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"The Hindu"},
    {"q":"Q10","qHi":"Q10","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"exp","explanationHi":"व्याख्या","subject":"Governance","subjectHi":"शासन","source":"The Hindu"}
  ]
}

Replace all placeholders with real content from this newspaper. UPSC question styles: "Consider the following statements", "Which is/are correct", etc. All Hindi in Devanagari. Return ONLY the JSON.`
        }
      ]
    }]
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
    parsed.source = 'The Hindu';
    parsed.filename = filename;

    // Store in memory for this serverless instance
    todayContext = parsed;
    contextDate = today;

    return res.status(200).json({ success: true, date: today, message: 'Current affairs generated from The Hindu PDF.' });

  } catch(err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
