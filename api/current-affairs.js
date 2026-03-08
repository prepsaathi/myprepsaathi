// api/current-affairs.js — PrepSaathi
// Split into 2 phases: summary first, then questions

const https = require('https');

function callClaude(key, prompt, maxTokens) {
  const reqBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
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

  // ── PHASE 1: Summary + Sections + Highlights ─────────────────────────────
  const summaryPrompt = `You are a UPSC expert. Today: ${today}.
Generate UPSC current affairs content. Return ONLY raw JSON, no markdown:
{"summary":"10-12 sentences covering today's top UPSC-relevant news across polity, economy, IR, environment, science. Include real facts, numbers, scheme names. Start: Today's current affairs covers","summaryHi":"Same 10-12 sentences Hindi Devanagari. Start: आज के समसामयिक मामलों में","sections":[{"tag":"Polity","heading":"Polity & Governance","headingHi":"राजनीति और शासन","icon":"⚖️","content":"3 sentences on polity news","contentHi":"3 sentences Hindi"},{"tag":"Economy","heading":"Economy & Finance","headingHi":"अर्थव्यवस्था और वित्त","icon":"📈","content":"3 sentences economy","contentHi":"3 sentences Hindi"},{"tag":"IR","heading":"International Relations","headingHi":"अंतर्राष्ट्रीय संबंध","icon":"🌏","content":"3 sentences IR","contentHi":"3 sentences Hindi"},{"tag":"Environment","heading":"Environment","headingHi":"पर्यावरण","icon":"🌿","content":"3 sentences environment","contentHi":"3 sentences Hindi"},{"tag":"Science","heading":"Science & Tech","headingHi":"विज्ञान और प्रौद्योगिकी","icon":"🔬","content":"3 sentences science","contentHi":"3 sentences Hindi"}],"highlights":[{"title":"EN title","titleHi":"HI title","body":"2 sentences EN","bodyHi":"2 sentences HI","tag":"Polity","source":"PIB"},{"title":"EN","titleHi":"HI","body":"2 sentences EN","bodyHi":"2 sentences HI","tag":"Economy","source":"AIR"},{"title":"EN","titleHi":"HI","body":"2 sentences EN","bodyHi":"2 sentences HI","tag":"IR","source":"PIB"},{"title":"EN","titleHi":"HI","body":"2 sentences EN","bodyHi":"2 sentences HI","tag":"Environment","source":"AIR"},{"title":"EN","titleHi":"HI","body":"2 sentences EN","bodyHi":"2 sentences HI","tag":"Science","source":"PIB"}]}
Fill with real UPSC content. Hindi in Devanagari. JSON only.`;

  // ── PHASE 2: Questions ────────────────────────────────────────────────────
  const questionsPrompt = `You are a UPSC expert. Today: ${today}.
Generate 10 UPSC Prelims style MCQs on today's current affairs. Return ONLY raw JSON, no markdown:
{"questions":[{"q":"UPSC question EN using styles like Consider following statements/Which is correct","qHi":"Same Hindi Devanagari","options":["A","B","C","D"],"optionsHi":["A HI","B HI","C HI","D HI"],"answer":0,"explanation":"2-3 sentences explanation EN","explanationHi":"2-3 sentences HI","subject":"Polity","subjectHi":"राजनीति","source":"PIB"},{"q":"Q2","qHi":"Q2 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"exp","explanationHi":"exp HI","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"AIR"},{"q":"Q3","qHi":"Q3 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"exp","explanationHi":"exp HI","subject":"Environment","subjectHi":"पर्यावरण","source":"PIB"},{"q":"Q4","qHi":"Q4 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"exp","explanationHi":"exp HI","subject":"Geography","subjectHi":"भूगोल","source":"AIR"},{"q":"Q5","qHi":"Q5 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"exp","explanationHi":"exp HI","subject":"History","subjectHi":"इतिहास","source":"PIB"},{"q":"Q6","qHi":"Q6 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"exp","explanationHi":"exp HI","subject":"Science","subjectHi":"विज्ञान","source":"AIR"},{"q":"Q7","qHi":"Q7 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"exp","explanationHi":"exp HI","subject":"IR","subjectHi":"अंतर्राष्ट्रीय संबंध","source":"PIB"},{"q":"Q8","qHi":"Q8 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"exp","explanationHi":"exp HI","subject":"Polity","subjectHi":"राजनीति","source":"AIR"},{"q":"Q9","qHi":"Q9 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"exp","explanationHi":"exp HI","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"PIB"},{"q":"Q10","qHi":"Q10 HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"exp","explanationHi":"exp HI","subject":"Governance","subjectHi":"शासन","source":"AIR"}]}
Use real UPSC current affairs. Vary subjects. Hindi in Devanagari. JSON only.`;

  try {
    // Run both calls in parallel
    const [summaryResult, questionsResult] = await Promise.all([
      callClaude(ANTHROPIC_KEY, summaryPrompt, 3000),
      callClaude(ANTHROPIC_KEY, questionsPrompt, 3000)
    ]);

    if (summaryResult.status !== 200) {
      const e = JSON.parse(summaryResult.body);
      return res.status(502).json({ error: e?.error?.message || 'Claude API error' });
    }
    if (questionsResult.status !== 200) {
      const e = JSON.parse(questionsResult.body);
      return res.status(502).json({ error: e?.error?.message || 'Claude API error' });
    }

    const parseJSON = (raw) => {
      const text = raw.trim().replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
      return JSON.parse(text);
    };

    const summaryData = parseJSON(JSON.parse(summaryResult.body).content[0].text);
    const questionsData = parseJSON(JSON.parse(questionsResult.body).content[0].text);

    const final = {
      ...summaryData,
      questions: questionsData.questions,
      date: today,
      articleCount: 0
    };

    return res.status(200).json(final);

  } catch(err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
