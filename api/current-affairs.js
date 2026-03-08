// api/current-affairs.js — PrepSaathi (minimal, reliable)

const https = require('https');

function callClaude(key, prompt) {
  const reqBody = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
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

  try {
    let result, parsed;

    if (type === 'summary') {

      // ── CALL 1: Overview paragraph only ─────────────────────────────────────
      const r1 = await callClaude(ANTHROPIC_KEY,
        `UPSC expert. Today: ${today}. Write a 6-sentence English paragraph about today's most important current affairs for UPSC aspirants. Cover polity, economy, IR, environment. Include real facts. Start exactly with: "Today's current affairs covers" — plain text only, no JSON, no bullets.`
      );
      const r1json = JSON.parse(r1.body);
      const summary = r1json.content[0].text.trim();

      // ── CALL 2: Hindi summary ────────────────────────────────────────────────
      const r2 = await callClaude(ANTHROPIC_KEY,
        `Translate this to Hindi Devanagari script exactly:\n\n${summary}`
      );
      const r2json = JSON.parse(r2.body);
      const summaryHi = r2json.content[0].text.trim();

      // ── CALL 3: Sections + Highlights as JSON ────────────────────────────────
      const r3 = await callClaude(ANTHROPIC_KEY,
        `UPSC expert. Today: ${today}. Return ONLY this JSON (no markdown, keep each string under 100 chars):
{"sections":[
{"tag":"Polity","heading":"Polity & Governance","headingHi":"राजनीति और शासन","icon":"⚖️","content":"1 sentence polity news","contentHi":"1 sentence Hindi"},
{"tag":"Economy","heading":"Economy & Finance","headingHi":"अर्थव्यवस्था","icon":"📈","content":"1 sentence economy","contentHi":"1 sentence Hindi"},
{"tag":"IR","heading":"International Relations","headingHi":"अंतर्राष्ट्रीय संबंध","icon":"🌏","content":"1 sentence IR","contentHi":"1 sentence Hindi"},
{"tag":"Environment","heading":"Environment","headingHi":"पर्यावरण","icon":"🌿","content":"1 sentence environment","contentHi":"1 sentence Hindi"},
{"tag":"Science","heading":"Science & Tech","headingHi":"विज्ञान","icon":"🔬","content":"1 sentence science","contentHi":"1 sentence Hindi"}
],
"highlights":[
{"title":"short EN title","titleHi":"हिंदी","body":"1 sentence EN","bodyHi":"1 sentence HI","tag":"Polity","source":"PIB"},
{"title":"short EN title","titleHi":"हिंदी","body":"1 sentence EN","bodyHi":"1 sentence HI","tag":"Economy","source":"AIR"},
{"title":"short EN title","titleHi":"हिंदी","body":"1 sentence EN","bodyHi":"1 sentence HI","tag":"IR","source":"PIB"},
{"title":"short EN title","titleHi":"हिंदी","body":"1 sentence EN","bodyHi":"1 sentence HI","tag":"Environment","source":"AIR"},
{"title":"short EN title","titleHi":"हिंदी","body":"1 sentence EN","bodyHi":"1 sentence HI","tag":"Science","source":"PIB"}
]}
Real UPSC content. Hindi in Devanagari. JSON only.`
      );
      const r3json = JSON.parse(r3.body);
      const r3text = r3json.content[0].text.trim().replace(/^```json\s*/i,'').replace(/^```/,'').replace(/```$/,'').trim();
      const sectionsData = JSON.parse(r3text);

      parsed = { date: today, summary, summaryHi, ...sectionsData };

    } else {

      // ── QUESTIONS: 5 at a time ───────────────────────────────────────────────
      const makeQPrompt = (subjects, startIdx) =>
        `UPSC expert. Today: ${today}. Generate exactly 5 UPSC Prelims MCQs on current affairs. Subjects: ${subjects}. Return ONLY JSON (no markdown, strings under 120 chars each):
{"questions":[
{"q":"Q EN","qHi":"Q HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"1 sentence EN","explanationHi":"1 sentence HI","subject":"${subjects.split(',')[0].trim()}","subjectHi":"विषय","source":"PIB"},
{"q":"Q EN","qHi":"Q HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"1 sentence EN","explanationHi":"1 sentence HI","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"AIR"},
{"q":"Q EN","qHi":"Q HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"1 sentence EN","explanationHi":"1 sentence HI","subject":"Environment","subjectHi":"पर्यावरण","source":"PIB"},
{"q":"Q EN","qHi":"Q HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"1 sentence EN","explanationHi":"1 sentence HI","subject":"IR","subjectHi":"अंतर्राष्ट्रीय संबंध","source":"AIR"},
{"q":"Q EN","qHi":"Q HI","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"1 sentence EN","explanationHi":"1 sentence HI","subject":"${subjects.split(',')[1]?.trim()||'Science'}","subjectHi":"विज्ञान","source":"PIB"}
]}
Real UPSC MCQs. Hindi Devanagari. JSON only.`;

      const [qa, qb] = await Promise.all([
        callClaude(ANTHROPIC_KEY, makeQPrompt('Polity, History', 0)),
        callClaude(ANTHROPIC_KEY, makeQPrompt('Science, Geography, Governance', 5))
      ]);

      const parseQ = (r) => {
        const j = JSON.parse(r.body);
        const t = j.content[0].text.trim().replace(/^```json\s*/i,'').replace(/^```/,'').replace(/```$/,'').trim();
        return JSON.parse(t).questions;
      };

      parsed = { questions: [...parseQ(qa), ...parseQ(qb)] };
    }

    return res.status(200).json(parsed);

  } catch(err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
