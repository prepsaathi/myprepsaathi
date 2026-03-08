// api/current-affairs.js — PrepSaathi FINAL
// English-only JSON from Claude, Hindi added separately

const https = require('https');

function claude(key, prompt, maxTok) {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTok,
    messages: [{ role: 'user', content: prompt }]
  });
  return new Promise((resolve, reject) => {
    const r = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-api-key': key,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body)
      }
    }, (resp) => {
      let d = ''; resp.on('data', c => d += c);
      resp.on('end', () => resolve({ status: resp.statusCode, data: JSON.parse(d) }));
    });
    r.on('error', reject); r.write(body); r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'API key not configured.' });

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata'
  });

  try {
    // ── STEP 1: English content only (no Hindi at all) ──────────────────────
    const r1 = await claude(KEY, `UPSC current affairs expert. Today: ${today}.
Return ONLY this JSON (English only, no Hindi, keep each string short):
{
  "summary": "5 sentences on today UPSC current affairs covering polity economy IR environment. Start: Today's current affairs covers",
  "sections": [
    {"tag":"Polity","heading":"Polity & Governance","icon":"⚖️","content":"1 sentence polity news today."},
    {"tag":"Economy","heading":"Economy & Finance","icon":"📈","content":"1 sentence economy news today."},
    {"tag":"IR","heading":"International Relations","icon":"🌏","content":"1 sentence IR news today."},
    {"tag":"Environment","heading":"Environment","icon":"🌿","content":"1 sentence environment news today."},
    {"tag":"Science","heading":"Science & Tech","icon":"🔬","content":"1 sentence science news today."}
  ],
  "highlights": [
    {"title":"short title","body":"1 sentence.","tag":"Polity","source":"PIB"},
    {"title":"short title","body":"1 sentence.","tag":"Economy","source":"AIR"},
    {"title":"short title","body":"1 sentence.","tag":"IR","source":"PIB"},
    {"title":"short title","body":"1 sentence.","tag":"Environment","source":"AIR"},
    {"title":"short title","body":"1 sentence.","tag":"Science","source":"PIB"}
  ],
  "questions": [
    {"q":"UPSC MCQ 1","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"Polity","source":"PIB"},
    {"q":"UPSC MCQ 2","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Economy","source":"AIR"},
    {"q":"UPSC MCQ 3","options":["A","B","C","D"],"answer":2,"explanation":"1 sentence.","subject":"Environment","source":"PIB"},
    {"q":"UPSC MCQ 4","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"IR","source":"AIR"},
    {"q":"UPSC MCQ 5","options":["A","B","C","D"],"answer":3,"explanation":"1 sentence.","subject":"Science","source":"PIB"}
  ]
}
Fill with real UPSC content. JSON only, no markdown.`, 1500);

    if (r1.status !== 200) {
      return res.status(502).json({ error: r1.data?.error?.message || 'Claude error' });
    }

    const raw = r1.data.content[0].text.trim()
      .replace(/^```json\s*/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    const content = JSON.parse(raw);

    // ── STEP 2: Translate summary to Hindi only ─────────────────────────────
    const r2 = await claude(KEY,
      `Translate ONLY the following English text to Hindi Devanagari. Return ONLY the Hindi translation, no other text:\n\n${content.summary}`,
      300
    );
    const summaryHi = r2.data.content[0].text.trim();

    // ── BUILD FINAL RESPONSE ────────────────────────────────────────────────
    // Add placeholder Hindi fields (frontend shows EN by default, Hi toggle shows translated summary)
    content.summaryHi = summaryHi;
    content.date = today;

    // Add Hindi placeholders for sections/highlights/questions
    content.sections = content.sections.map(s => ({
      ...s,
      headingHi: s.heading,
      contentHi: s.content
    }));
    content.highlights = content.highlights.map(h => ({
      ...h,
      titleHi: h.title,
      bodyHi: h.body
    }));
    content.questions = content.questions.map(q => ({
      ...q,
      qHi: q.q,
      optionsHi: q.options,
      explanationHi: q.explanation,
      subjectHi: q.subject
    }));

    return res.status(200).json(content);

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
