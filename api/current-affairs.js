// api/current-affairs.js — PrepSaathi with Supabase Daily Caching + 10 Questions

const https = require('https');

// ── SUPABASE HELPERS ────────────────────────────────────────────────────────
function supabaseRequest(method, path, body, secretKey, supabaseUrl) {
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const url = new URL(supabaseUrl);
    const options = {
      hostname: url.hostname,
      path: `/rest/v1/${path}`,
      method,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'apikey': secretKey,
        'Authorization': `Bearer ${secretKey}`
      }, method === 'POST' ? { 'Prefer': 'return=representation' } : {})
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    const r = https.request(options, (resp) => {
      let d = ''; resp.on('data', c => d += c);
      resp.on('end', () => resolve({ status: resp.statusCode, body: d }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

// ── CLAUDE HELPER ───────────────────────────────────────────────────────────
function callClaude(key, prompt, maxTok) {
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

function parseJSON(text) {
  return JSON.parse(
    text.trim().replace(/^```json\s*/i,'').replace(/^```/,'').replace(/```$/,'').trim()
  );
}

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function getTodayLabel() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata'
  });
}

// ── GENERATE FRESH CONTENT ──────────────────────────────────────────────────
async function generateContent(anthropicKey) {
  const today = getTodayLabel();

  // Both calls run in parallel
  const [r1, rQ] = await Promise.all([

    // Call 1: Summary + sections + highlights
    callClaude(anthropicKey,
`You are a UPSC current affairs expert. Today: ${today}.
Generate content based STRICTLY on these official Indian government sources only:
- PIB (Press Information Bureau) — pib.gov.in
- AIR News (All India Radio) — newsonair.gov.in
- PRS Legislative Research — prsindia.org
- MoEF (Ministry of Environment, Forest & Climate Change)
- RBI (Reserve Bank of India) press releases
- MEA (Ministry of External Affairs) press releases
- Any other official Ministry/Department press releases

DO NOT use newspaper sources, private media, or unverified sources.
Return ONLY this JSON (English only, short strings, no markdown):
{"summary":"5 sentences on today UPSC-relevant news from PIB and AIR covering polity economy IR environment science. Mention actual schemes, policies, bills from official sources. Start: Today's current affairs covers","sections":[{"tag":"Polity","heading":"Polity & Governance","icon":"⚖️","content":"1 sentence from PIB/PRS on polity/governance today."},{"tag":"Economy","heading":"Economy & Finance","icon":"📈","content":"1 sentence from RBI/Finance Ministry on economy today."},{"tag":"IR","heading":"International Relations","icon":"🌏","content":"1 sentence from MEA on India foreign relations today."},{"tag":"Environment","heading":"Environment","icon":"🌿","content":"1 sentence from MoEF on environment today."},{"tag":"Science","heading":"Science & Tech","icon":"🔬","content":"1 sentence from DST/ISRO/official source on science today."}],"highlights":[{"title":"short headline","body":"1 sentence with key fact or figure.","tag":"Polity","source":"PIB"},{"title":"short headline","body":"1 sentence with key fact.","tag":"Economy","source":"RBI"},{"title":"short headline","body":"1 sentence.","tag":"IR","source":"MEA"},{"title":"short headline","body":"1 sentence.","tag":"Environment","source":"MoEF"},{"title":"short headline","body":"1 sentence.","tag":"Science","source":"PIB"}]}
Use only verified government source content. JSON only.`, 1500),

    // Call 2: 10 UPSC Prelims questions
    callClaude(anthropicKey,
`You are a UPSC Prelims expert. Today: ${today}.
Generate 10 UPSC Prelims MCQs strictly based on news from these official sources:
PIB, AIR News, PRS Legislative Research, MoEF, RBI, MEA, official Ministry press releases.
Use authentic UPSC question styles: "Consider the following statements", "Which is/are correct", "Select using codes below".
Each question must test factual knowledge from today's government announcements, policies, schemes, or official data.
Assign source from: PIB / AIR / PRS / MoEF / RBI / MEA
Return ONLY this JSON (no markdown):
{"questions":[{"q":"Q1","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence with the key fact from official source.","subject":"Polity","source":"PIB"},{"q":"Q2","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Economy","source":"RBI"},{"q":"Q3","options":["A","B","C","D"],"answer":2,"explanation":"1 sentence.","subject":"Environment","source":"MoEF"},{"q":"Q4","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"IR","source":"MEA"},{"q":"Q5","options":["A","B","C","D"],"answer":3,"explanation":"1 sentence.","subject":"Science","source":"PIB"},{"q":"Q6","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Polity","source":"PRS"},{"q":"Q7","options":["A","B","C","D"],"answer":2,"explanation":"1 sentence.","subject":"Economy","source":"AIR"},{"q":"Q8","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"Geography","source":"PIB"},{"q":"Q9","options":["A","B","C","D"],"answer":3,"explanation":"1 sentence.","subject":"History","source":"AIR"},{"q":"Q10","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Governance","source":"PRS"}]}
Real UPSC-style questions from official sources only. JSON only.`, 2500)
  ]);

  if (r1.status !== 200) throw new Error(r1.data?.error?.message || 'Claude summary error');
  if (rQ.status !== 200) throw new Error(rQ.data?.error?.message || 'Claude questions error');

  const content = parseJSON(r1.data.content[0].text);
  const qData = parseJSON(rQ.data.content[0].text);
  content.questions = qData.questions;

  const subjectHiMap = {
    'Polity':'राजनीति','Economy':'अर्थव्यवस्था','Environment':'पर्यावरण',
    'IR':'अंतर्राष्ट्रीय संबंध','Science':'विज्ञान','Governance':'शासन',
    'History':'इतिहास','Geography':'भूगोल'
  };
  const subjectHiHeadings = {
    'Polity':'राजनीति और शासन','Economy':'अर्थव्यवस्था और वित्त',
    'IR':'अंतर्राष्ट्रीय संबंध','Environment':'पर्यावरण','Science':'विज्ञान और प्रौद्योगिकी'
  };

  // ── HINDI TRANSLATION — single focused call ─────────────────────────────
  // Build translation prompt safely
  const translationData = {
    summary: content.summary,
    sections: content.sections.map(s => s.content),
    questions: content.questions.map(q => ({ q: q.q, opts: q.options, exp: q.explanation }))
  };
  const rHindi = await callClaude(anthropicKey,
    'Translate all text values to Hindi Devanagari. Keep all JSON keys in English. Return ONLY valid JSON, no markdown, no extra text:\n' +
    JSON.stringify(translationData), 3000);

  try {
    const hi = JSON.parse(rHindi.data.content[0].text.trim().replace(/^```json\s*/i,'').replace(/^```/,'').replace(/```$/,'').trim());
    content.summaryHi = hi.summary || content.summary;
    content.sections = content.sections.map((s, i) => ({
      ...s,
      headingHi: subjectHiHeadings[s.tag] || s.heading,
      contentHi: (hi.sections && hi.sections[i]) || s.content
    }));
    content.highlights = content.highlights.map(h => ({ ...h, titleHi: h.title, bodyHi: h.body }));
    content.questions = content.questions.map((q, i) => ({
      ...q,
      qHi: (hi.questions && hi.questions[i]?.q) || q.q,
      optionsHi: (hi.questions && hi.questions[i]?.opts) || q.options,
      explanationHi: (hi.questions && hi.questions[i]?.exp) || q.explanation,
      subjectHi: subjectHiMap[q.subject] || q.subject
    }));
  } catch(e) {
    console.error('Hindi translation failed, using English fallback:', e.message);
    content.summaryHi = content.summary;
    content.sections = content.sections.map(s => ({ ...s, headingHi: subjectHiHeadings[s.tag]||s.heading, contentHi: s.content }));
    content.highlights = content.highlights.map(h => ({ ...h, titleHi: h.title, bodyHi: h.body }));
    content.questions = content.questions.map(q => ({ ...q, qHi: q.q, optionsHi: q.options, explanationHi: q.explanation, subjectHi: subjectHiMap[q.subject]||q.subject }));
  }

  content.date = getTodayLabel();
  return content;
}

// ── MAIN HANDLER ────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic API key not configured.' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured.' });

  const todayIST = getTodayIST();

  try {
    // ── Check cache ──────────────────────────────────────────────────────
    const cached = await supabaseRequest(
      'GET', `daily_content?date=eq.${todayIST}&limit=1`,
      null, SUPABASE_KEY, SUPABASE_URL
    );

    if (cached.status === 200) {
      const rows = JSON.parse(cached.body);
      if (rows.length > 0) {
        console.log('Cache HIT:', todayIST);
        return res.status(200).json(rows[0].content);
      }
    }

    // ── Cache miss — generate fresh ──────────────────────────────────────
    console.log('Cache MISS:', todayIST, '— generating...');
    const content = await generateContent(ANTHROPIC_KEY);

    // ── Save to Supabase ─────────────────────────────────────────────────
    await supabaseRequest('POST', 'daily_content', { date: todayIST, content }, SUPABASE_KEY, SUPABASE_URL);
    console.log('Saved to Supabase:', todayIST);

    return res.status(200).json(content);

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
