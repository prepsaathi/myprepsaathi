// api/upload-hindu.js — PrepSaathi
// Reads The Hindu PDF and generates current affairs content

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
      }, method === 'POST' ? { 'Prefer': 'return=representation' } : {},
         method === 'DELETE' ? {} : {})
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
function callClaude(key, messages, maxTok) {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTok,
    messages
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

// ── MYMEMORY TRANSLATE ──────────────────────────────────────────────────────
function translate(text) {
  if (!text || text.trim().length === 0) return Promise.resolve(text);
  const encoded = encodeURIComponent(text.substring(0, 500));
  return new Promise((resolve) => {
    const r = https.request({
      hostname: 'api.mymemory.translated.net',
      path: `/get?q=${encoded}&langpair=en|hi`,
      method: 'GET'
    }, (resp) => {
      let d = ''; resp.on('data', c => d += c);
      resp.on('end', () => {
        try {
          const json = JSON.parse(d);
          const translated = json.responseData?.translatedText;
          resolve(translated && translated !== text ? translated : text);
        } catch(e) { resolve(text); }
      });
    });
    r.on('error', () => resolve(text));
    r.end();
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
  'IR':'अंतर्राष्ट्रीय संबंध','Environment':'पर्यावरण',
  'Science':'विज्ञान और प्रौद्योगिकी','Geography':'भूगोल',
  'History':'इतिहास','Art & Culture':'कला और संस्कृति'
};

// ── MAIN HANDLER ────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Anthropic API key not configured.' });
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(500).json({ error: 'Supabase not configured.' });

  const { pdf, filename } = req.body;
  if (!pdf) return res.status(400).json({ error: 'No PDF data received.' });

  const today = getTodayLabel();
  const todayIST = getTodayIST();

  try {
    // ── STEP 1: Send PDF to Claude ──────────────────────────────────────────
    const [r1, rQ] = await Promise.all([

      // Summary + sections + highlights from PDF
      callClaude(ANTHROPIC_KEY, [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdf }
            },
            {
              type: 'text',
              text: `You are a UPSC current affairs expert. Today: ${today}.
Read this The Hindu newspaper PDF carefully. Extract UPSC-relevant news only.
Return ONLY this JSON (English only, no markdown):
{"summary":"6 sentences covering today's most important UPSC-relevant news from The Hindu. Cover polity, economy, IR, environment, science, geography. Start: Today's The Hindu covers","sections":[{"tag":"Polity","heading":"Polity & Governance","icon":"⚖️","content":"1 sentence on most important polity news from The Hindu today."},{"tag":"Economy","heading":"Economy & Finance","icon":"📈","content":"1 sentence on economy news from The Hindu today."},{"tag":"IR","heading":"International Relations","icon":"🌏","content":"1 sentence on India's foreign relations from The Hindu today."},{"tag":"Environment","heading":"Environment","icon":"🌿","content":"1 sentence on environment news from The Hindu today."},{"tag":"Science","heading":"Science & Tech","icon":"🔬","content":"1 sentence on science/tech news from The Hindu today."},{"tag":"Geography","heading":"Geography","icon":"🗺️","content":"1 sentence connecting today's Hindu news to geography topics."},{"tag":"History","heading":"History","icon":"🏛️","content":"1 sentence connecting today's Hindu news to history topics."},{"tag":"Art & Culture","heading":"Art & Culture","icon":"🎭","content":"1 sentence connecting today's Hindu news to art, culture, heritage topics."}],"highlights":[{"title":"headline from Hindu","body":"1 sentence summary.","tag":"Polity","source":"The Hindu"},{"title":"headline","body":"1 sentence.","tag":"Economy","source":"The Hindu"},{"title":"headline","body":"1 sentence.","tag":"IR","source":"The Hindu"},{"title":"headline","body":"1 sentence.","tag":"Environment","source":"The Hindu"},{"title":"headline","body":"1 sentence.","tag":"Science","source":"The Hindu"}],"staticConnects":[{"news":"1 sentence on a Hindu news event.","staticLink":"1 sentence UPSC static syllabus connection.","subject":"Polity","icon":"⚖️"},{"news":"news event.","staticLink":"static connection.","subject":"Geography","icon":"🗺️"},{"news":"news event.","staticLink":"static connection.","subject":"History","icon":"🏛️"},{"news":"news event.","staticLink":"static connection.","subject":"Art & Culture","icon":"🎭"},{"news":"news event.","staticLink":"static connection.","subject":"Economy","icon":"📈"}]}
JSON only.`
            }
          ]
        }
      ], 2500),

      // 10 Questions from PDF
      callClaude(ANTHROPIC_KEY, [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdf }
            },
            {
              type: 'text',
              text: `You are a UPSC Prelims expert. Today: ${today}.
Read this The Hindu newspaper PDF. Generate 10 UPSC Prelims MCQs strictly based on news in this PDF.
Use authentic UPSC styles: "Consider the following statements", "Which is/are correct", "Select using codes below".
Return ONLY this JSON (no markdown):
{"questions":[{"q":"Q1 from Hindu news","options":["opt1","opt2","opt3","opt4"],"answer":0,"explanation":"1 sentence with key fact from The Hindu.","subject":"Polity","source":"The Hindu"},{"q":"Q2","options":["opt1","opt2","opt3","opt4"],"answer":1,"explanation":"1 sentence.","subject":"Economy","source":"The Hindu"},{"q":"Q3","options":["opt1","opt2","opt3","opt4"],"answer":2,"explanation":"1 sentence.","subject":"Environment","source":"The Hindu"},{"q":"Q4","options":["opt1","opt2","opt3","opt4"],"answer":0,"explanation":"1 sentence.","subject":"IR","source":"The Hindu"},{"q":"Q5","options":["opt1","opt2","opt3","opt4"],"answer":3,"explanation":"1 sentence.","subject":"Science","source":"The Hindu"},{"q":"Q6","options":["opt1","opt2","opt3","opt4"],"answer":1,"explanation":"1 sentence.","subject":"Geography","source":"The Hindu"},{"q":"Q7","options":["opt1","opt2","opt3","opt4"],"answer":2,"explanation":"1 sentence.","subject":"History","source":"The Hindu"},{"q":"Q8","options":["opt1","opt2","opt3","opt4"],"answer":0,"explanation":"1 sentence.","subject":"Polity","source":"The Hindu"},{"q":"Q9","options":["opt1","opt2","opt3","opt4"],"answer":3,"explanation":"1 sentence.","subject":"Economy","source":"The Hindu"},{"q":"Q10","options":["opt1","opt2","opt3","opt4"],"answer":1,"explanation":"1 sentence.","subject":"Art & Culture","source":"The Hindu"}]}
Real UPSC questions from The Hindu only. JSON only.`
            }
          ]
        }
      ], 3000)
    ]);

    if (r1.status !== 200) throw new Error(r1.data?.error?.message || 'Claude PDF read error');
    if (rQ.status !== 200) throw new Error(rQ.data?.error?.message || 'Claude questions error');

    const content = parseJSON(r1.data.content[0].text);
    const qData = parseJSON(rQ.data.content[0].text);
    content.questions = qData.questions;

    // ── STEP 2: Translate to Hindi ──────────────────────────────────────────
    const [summaryHi, ...sectionContentsHi] = await Promise.all([
      translate(content.summary),
      ...content.sections.map(s => translate(s.content))
    ]);

    const highlightTitles = await Promise.all(content.highlights.map(h => translate(h.title)));
    const highlightBodies = await Promise.all(content.highlights.map(h => translate(h.body)));
    const questionTexts = await Promise.all(content.questions.map(q => translate(q.q)));
    const explanationTexts = await Promise.all(content.questions.map(q => translate(q.explanation)));
    const staticNewsHi = await Promise.all((content.staticConnects||[]).map(s => translate(s.news)));
    const staticLinkHi = await Promise.all((content.staticConnects||[]).map(s => translate(s.staticLink)));

    // Apply translations
    content.summaryHi = summaryHi;
    content.sections = content.sections.map((s, i) => ({
      ...s, headingHi: sectionHiHeadings[s.tag] || s.heading,
      contentHi: sectionContentsHi[i] || s.content
    }));
    content.highlights = content.highlights.map((h, i) => ({
      ...h, titleHi: highlightTitles[i] || h.title, bodyHi: highlightBodies[i] || h.body
    }));
    content.questions = content.questions.map((q, i) => ({
      ...q, qHi: questionTexts[i] || q.q, optionsHi: q.options,
      explanationHi: explanationTexts[i] || q.explanation,
      subjectHi: subjectHiMap[q.subject] || q.subject
    }));
    content.staticConnects = (content.staticConnects||[]).map((s, i) => ({
      ...s, newsHi: staticNewsHi[i] || s.news,
      staticLinkHi: staticLinkHi[i] || s.staticLink,
      subjectHi: subjectHiMap[s.subject] || s.subject
    }));
    content.date = getTodayLabel();
    content.source = 'The Hindu';

    // ── STEP 3: Delete old row + Save to Supabase ───────────────────────────
    await supabaseRequest('DELETE', `daily_content?date=eq.${todayIST}`, null, SUPABASE_KEY, SUPABASE_URL);
    await supabaseRequest('POST', 'daily_content', { date: todayIST, content }, SUPABASE_KEY, SUPABASE_URL);

    return res.status(200).json({
      success: true,
      message: `Content generated from ${filename} and saved successfully!`,
      preview: { summary: content.summary.substring(0, 150) + '...' }
    });

  } catch (err) {
    console.error('Upload Hindu error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
