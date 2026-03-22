// api/current-affairs.js — PrepSaathi with Supabase Daily Caching

const https = require('https');

// ── SUPABASE ────────────────────────────────────────────────────────────────
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

// ── CLAUDE ──────────────────────────────────────────────────────────────────
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

// ── CLAUDE BATCH TRANSLATE ──────────────────────────────────────────────────
// Translates all content in one Claude call — context-aware, UPSC-accurate
async function translateAllToHindi(key, data) {
  const prompt = 'You are a UPSC Hindi translator. Translate the following texts to accurate Hindi Devanagari.' +
    ' Use proper UPSC terminology: Strike=हमला/प्रहार, Treaty=संधि, Sovereign=संप्रभु, Parliament=संसद,' +
    ' Amendment=संशोधन, Inflation=मुद्रास्फीति, GDP=जीडीपी, Bilateral=द्विपक्षीय, Multilateral=बहुपक्षीय,' +
    ' Sanctions=प्रतिबंध, Ceasefire=युद्धविराम, Nuclear=परमाणु, Satellite=उपग्रह, Mission=मिशन/अभियान.' +
    ' Return ONLY a JSON object with the same keys but Hindi values. No markdown.\n' +
    JSON.stringify(data);

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }]
  });

  return new Promise((resolve) => {
    const r = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-api-key': key,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(body)
      }
    }, (resp) => {
      let d = ''; resp.on('data', c => d += c);
      resp.on('end', () => {
        try {
          const json = JSON.parse(d);
          const text = json.content[0].text.trim()
            .replace(/^```json\s*/i,'').replace(/^```/,'').replace(/```$/,'').trim();
          resolve(JSON.parse(text));
        } catch(e) {
          console.error('Translation failed:', e.message);
          resolve(data); // fallback to English
        }
      });
    });
    r.on('error', () => resolve(data));
    r.write(body); r.end();
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

const subjectHiMap = {
  'Polity':'राजनीति','Economy':'अर्थव्यवस्था','Environment':'पर्यावरण',
  'IR':'अंतर्राष्ट्रीय संबंध','Science':'विज्ञान','Governance':'शासन',
  'History':'इतिहास','Geography':'भूगोल','Art & Culture':'कला और संस्कृति'
};

const sectionHiHeadings = {
  'Polity':'राजनीति और शासन','Economy':'अर्थव्यवस्था और वित्त',
  'IR':'अंतर्राष्ट्रीय संबंध','Environment':'पर्यावरण','Science':'विज्ञान और प्रौद्योगिकी',
  'Geography':'भूगोल','History':'इतिहास','Art & Culture':'कला और संस्कृति'
};

// ── GENERATE CONTENT ────────────────────────────────────────────────────────
async function generateContent(anthropicKey) {
  const today = getTodayLabel();

  // Parallel: summary+sections+highlights AND questions
  const [r1, rQ] = await Promise.all([
    callClaude(anthropicKey,
`You are a UPSC current affairs expert. Today: ${today}.
Generate content based on official Indian government sources: PIB, AIR News, PRS, MoEF, RBI, MEA, Ministry press releases.
Also include Geography, History and Art & Culture static connects from today's news.
Return ONLY this JSON (English only, no markdown):
{"summary":"6 sentences covering today UPSC news across polity, economy, IR, environment, science, geography and culture. Start: Today's current affairs covers","sections":[{"tag":"Polity","heading":"Polity & Governance","icon":"⚖️","content":"1 sentence on polity/governance news from PIB today."},{"tag":"Economy","heading":"Economy & Finance","icon":"📈","content":"1 sentence on economy from RBI/Finance Ministry today."},{"tag":"IR","heading":"International Relations","icon":"🌏","content":"1 sentence on India foreign relations from MEA today."},{"tag":"Environment","heading":"Environment","icon":"🌿","content":"1 sentence on environment from MoEF today."},{"tag":"Science","heading":"Science & Tech","icon":"🔬","content":"1 sentence on science/space from ISRO/DST today."},{"tag":"Geography","heading":"Geography","icon":"🗺️","content":"1 sentence connecting today's news to geography — rivers, climate, regions, disasters, natural resources."},{"tag":"History","heading":"History","icon":"🏛️","content":"1 sentence connecting today's news to history — freedom struggle, ancient/medieval India, important events."},{"tag":"Art & Culture","heading":"Art & Culture","icon":"🎭","content":"1 sentence connecting today's news to art, culture, UNESCO, festivals, heritage sites, classical traditions."}],"highlights":[{"title":"headline","body":"1 sentence.","tag":"Polity","source":"PIB"},{"title":"headline","body":"1 sentence.","tag":"Economy","source":"RBI"},{"title":"headline","body":"1 sentence.","tag":"IR","source":"MEA"},{"title":"headline","body":"1 sentence.","tag":"Environment","source":"MoEF"},{"title":"headline","body":"1 sentence.","tag":"Science","source":"PIB"}],"staticConnects":[{"news":"1 sentence describing today's news event.","staticLink":"1 sentence explaining the UPSC static syllabus connection — which topic, which chapter, why relevant for exam.","subject":"Polity","icon":"⚖️"},{"news":"another news event.","staticLink":"static syllabus connection.","subject":"Geography","icon":"🗺️"},{"news":"another news event.","staticLink":"static syllabus connection.","subject":"History","icon":"🏛️"},{"news":"another news event.","staticLink":"static syllabus connection.","subject":"Art & Culture","icon":"🎭"},{"news":"another news event.","staticLink":"static syllabus connection.","subject":"Economy","icon":"📈"}]}
JSON only.`, 2500),

    callClaude(anthropicKey,
`You are a UPSC Prelims expert. Today: ${today}.
Generate 10 UPSC Prelims MCQs from PIB, AIR, MoEF, RBI, MEA official sources.
Use styles: "Consider the following statements", "Which is/are correct", "Select using codes".
Return ONLY this JSON (no markdown):
{"questions":[{"q":"Q1","options":["opt1","opt2","opt3","opt4"],"answer":0,"explanation":"1 sentence.","subject":"Polity","source":"PIB"},{"q":"Q2","options":["opt1","opt2","opt3","opt4"],"answer":1,"explanation":"1 sentence.","subject":"Economy","source":"RBI"},{"q":"Q3","options":["opt1","opt2","opt3","opt4"],"answer":2,"explanation":"1 sentence.","subject":"Environment","source":"MoEF"},{"q":"Q4","options":["opt1","opt2","opt3","opt4"],"answer":0,"explanation":"1 sentence.","subject":"IR","source":"MEA"},{"q":"Q5","options":["opt1","opt2","opt3","opt4"],"answer":3,"explanation":"1 sentence.","subject":"Science","source":"PIB"},{"q":"Q6","options":["opt1","opt2","opt3","opt4"],"answer":1,"explanation":"1 sentence.","subject":"Polity","source":"PRS"},{"q":"Q7","options":["opt1","opt2","opt3","opt4"],"answer":2,"explanation":"1 sentence.","subject":"Economy","source":"AIR"},{"q":"Q8","options":["opt1","opt2","opt3","opt4"],"answer":0,"explanation":"1 sentence.","subject":"Geography","source":"PIB"},{"q":"Q9","options":["opt1","opt2","opt3","opt4"],"answer":3,"explanation":"1 sentence.","subject":"History","source":"AIR"},{"q":"Q10","options":["opt1","opt2","opt3","opt4"],"answer":1,"explanation":"1 sentence.","subject":"Governance","source":"PRS"}]}
Real UPSC questions only. JSON only.`, 3000)
  ]);

  if (r1.status !== 200) throw new Error(r1.data?.error?.message || 'Claude error');
  if (rQ.status !== 200) throw new Error(rQ.data?.error?.message || 'Claude error');

  const content = parseJSON(r1.data.content[0].text);
  const qData = parseJSON(rQ.data.content[0].text);
  content.questions = qData.questions;

  // ── TRANSLATE TO HINDI using Claude (context-aware) ────────────────────
  const toTranslate = {
    summary: content.summary,
    sections: content.sections.map(s => s.content),
    hlTitles: content.highlights.map(h => h.title),
    hlBodies: content.highlights.map(h => h.body),
    questions: content.questions.map(q => q.q),
    explanations: content.questions.map(q => q.explanation),
    staticNews: (content.staticConnects||[]).map(s => s.news),
    staticLinks: (content.staticConnects||[]).map(s => s.staticLink)
  };

  const translated = await translateAllToHindi(anthropicKey, toTranslate);

  // Apply translations
  content.summaryHi = translated.summary || content.summary;

  content.sections = content.sections.map((s, i) => ({
    ...s,
    headingHi: sectionHiHeadings[s.tag] || s.heading,
    contentHi: (translated.sections && translated.sections[i]) || s.content
  }));

  content.highlights = content.highlights.map((h, i) => ({
    ...h,
    titleHi: (translated.hlTitles && translated.hlTitles[i]) || h.title,
    bodyHi: (translated.hlBodies && translated.hlBodies[i]) || h.body
  }));

  content.questions = content.questions.map((q, i) => ({
    ...q,
    qHi: (translated.questions && translated.questions[i]) || q.q,
    optionsHi: q.options,
    explanationHi: (translated.explanations && translated.explanations[i]) || q.explanation,
    subjectHi: subjectHiMap[q.subject] || q.subject
  }));

  content.staticConnects = (content.staticConnects||[]).map((s, i) => ({
    ...s,
    newsHi: (translated.staticNews && translated.staticNews[i]) || s.news,
    staticLinkHi: (translated.staticLinks && translated.staticLinks[i]) || s.staticLink,
    subjectHi: subjectHiMap[s.subject] || s.subject
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

  const todayIST = getTodayIST();

  try {
    // Check cache
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

    // Generate fresh
    console.log('Cache MISS — generating...');
    const content = await generateContent(ANTHROPIC_KEY);

    // Save to Supabase
    await supabaseRequest('POST', 'daily_content', { date: todayIST, content }, SUPABASE_KEY, SUPABASE_URL);
    console.log('Saved to Supabase:', todayIST);

    return res.status(200).json(content);

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
