// api/current-affairs.js — PrepSaathi with Supabase Daily Caching

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
      headers: {
        'Content-Type': 'application/json',
        'apikey': secretKey,
        'Authorization': `Bearer ${secretKey}`,
        'Prefer': method === 'POST' ? 'return=representation' : undefined
      }
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

// ── GET TODAY'S DATE IN IST ─────────────────────────────────────────────────
function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

function getTodayLabel() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata'
  });
}

// ── GENERATE FRESH CONTENT FROM CLAUDE ─────────────────────────────────────
async function generateContent(anthropicKey) {
  const today = getTodayLabel();

  const r1 = await callClaude(anthropicKey,
    `UPSC current affairs expert. Today: ${today}.
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

  if (r1.status !== 200) throw new Error(r1.data?.error?.message || 'Claude error');
  const content = parseJSON(r1.data.content[0].text);

  // Hindi translation of summary only
  const r2 = await callClaude(anthropicKey,
    `Translate ONLY to Hindi Devanagari. Return ONLY the translation:\n\n${content.summary}`, 300);
  content.summaryHi = r2.data.content[0].text.trim();

  // Add Hindi placeholders for sections/highlights/questions
  content.sections = content.sections.map(s => ({
    ...s, headingHi: s.heading, contentHi: s.content
  }));
  content.highlights = content.highlights.map(h => ({
    ...h, titleHi: h.title, bodyHi: h.body
  }));
  content.questions = content.questions.map(q => ({
    ...q, qHi: q.q, optionsHi: q.options,
    explanationHi: q.explanation, subjectHi: q.subject
  }));

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

  const todayIST = getTodayIST(); // e.g. 2025-03-19

  try {
    // ── STEP 1: Check Supabase cache ──────────────────────────────────────
    const cached = await supabaseRequest(
      'GET', `daily_content?date=eq.${todayIST}&limit=1`,
      null, SUPABASE_KEY, SUPABASE_URL
    );

    if (cached.status === 200) {
      const rows = JSON.parse(cached.body);
      if (rows.length > 0) {
        console.log('Cache HIT for', todayIST);
        return res.status(200).json(rows[0].content);
      }
    }

    // ── STEP 2: Cache MISS — generate fresh content ───────────────────────
    console.log('Cache MISS for', todayIST, '— generating...');
    const content = await generateContent(ANTHROPIC_KEY);

    // ── STEP 3: Save to Supabase ──────────────────────────────────────────
    await supabaseRequest(
      'POST', 'daily_content',
      { date: todayIST, content },
      SUPABASE_KEY, SUPABASE_URL
    );

    console.log('Saved to Supabase for', todayIST);
    return res.status(200).json(content);

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
