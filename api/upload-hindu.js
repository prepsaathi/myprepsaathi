// api/upload-hindu.js — PrepSaathi
// Accepts extracted text from The Hindu PDF and generates current affairs

const https = require('https');

function supabaseRequest(method, path, body, secretKey, supabaseUrl) {
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const url = new URL(supabaseUrl);
    const options = {
      hostname: url.hostname,
      path: '/rest/v1/' + path,
      method,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'apikey': secretKey,
        'Authorization': 'Bearer ' + secretKey
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

async function translateAllToHindi(key, data) {
  const prompt = 'You are a UPSC Hindi translator. Translate these texts to accurate Hindi Devanagari.' +
    ' Use proper UPSC terminology: Strike=हमला/प्रहार, Treaty=संधि, Sovereign=संप्रभु, Parliament=संसद,' +
    ' Amendment=संशोधन, Inflation=मुद्रास्फीति, Bilateral=द्विपक्षीय, Sanctions=प्रतिबंध,' +
    ' Ceasefire=युद्धविराम, Nuclear=परमाणु, Satellite=उपग्रह, Mission=अभियान, Summit=शिखर सम्मेलन.' +
    ' Return ONLY a JSON object with same keys but Hindi values. No markdown.\n' +
    JSON.stringify(data);

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6', max_tokens: 3000,
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
          const t = json.content[0].text.trim()
            .replace(/^```json\s*/i,'').replace(/^```/,'').replace(/```$/,'').trim();
          resolve(JSON.parse(t));
        } catch(e) { console.error('Translation failed:', e.message); resolve(data); }
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
  'IR':'अंतर्राष्ट्रीय संबंध','Environment':'पर्यावरण',
  'Science':'विज्ञान और प्रौद्योगिकी','Geography':'भूगोल',
  'History':'इतिहास','Art & Culture':'कला और संस्कृति'
};

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

  const { text, filename } = req.body;
  if (!text) return res.status(400).json({ error: 'No text received from PDF.' });

  const today = getTodayLabel();
  const todayIST = getTodayIST();

  // Limit text to avoid token overflow
  const hinduText = text.substring(0, 12000);

  try {
    const summaryPrompt = 'You are a UPSC current affairs expert. Today: ' + today + '.\n' +
      'Below is extracted text from The Hindu newspaper. Extract UPSC-relevant news.\n' +
      'Return ONLY this JSON (English, no markdown):\n' +
      '{"summary":"6 sentences on most important UPSC news from The Hindu today. Start: Today\'s The Hindu covers",' +
      '"sections":[' +
      '{"tag":"Polity","heading":"Polity & Governance","icon":"⚖️","content":"1 sentence polity news."},' +
      '{"tag":"Economy","heading":"Economy & Finance","icon":"📈","content":"1 sentence economy news."},' +
      '{"tag":"IR","heading":"International Relations","icon":"🌏","content":"1 sentence IR news."},' +
      '{"tag":"Environment","heading":"Environment","icon":"🌿","content":"1 sentence environment news."},' +
      '{"tag":"Science","heading":"Science & Tech","icon":"🔬","content":"1 sentence science news."},' +
      '{"tag":"Geography","heading":"Geography","icon":"🗺️","content":"1 sentence geography connect."},' +
      '{"tag":"History","heading":"History","icon":"🏛️","content":"1 sentence history connect."},' +
      '{"tag":"Art & Culture","heading":"Art & Culture","icon":"🎭","content":"1 sentence culture connect."}' +
      '],' +
      '"highlights":[' +
      '{"title":"headline","body":"1 sentence.","tag":"Polity","source":"The Hindu"},' +
      '{"title":"headline","body":"1 sentence.","tag":"Economy","source":"The Hindu"},' +
      '{"title":"headline","body":"1 sentence.","tag":"IR","source":"The Hindu"},' +
      '{"title":"headline","body":"1 sentence.","tag":"Environment","source":"The Hindu"},' +
      '{"title":"headline","body":"1 sentence.","tag":"Science","source":"The Hindu"}' +
      '],' +
      '"staticConnects":[' +
      '{"news":"news from Hindu.","staticLink":"UPSC static connect.","subject":"Polity","icon":"⚖️"},' +
      '{"news":"news.","staticLink":"connect.","subject":"Geography","icon":"🗺️"},' +
      '{"news":"news.","staticLink":"connect.","subject":"History","icon":"🏛️"},' +
      '{"news":"news.","staticLink":"connect.","subject":"Art & Culture","icon":"🎭"},' +
      '{"news":"news.","staticLink":"connect.","subject":"Economy","icon":"📈"}' +
      ']}\n' +
      'THE HINDU TEXT:\n' + hinduText + '\nJSON only.';

    const questionsPrompt = 'You are a UPSC Prelims expert. Today: ' + today + '.\n' +
      'Based on The Hindu text, generate 10 UPSC Prelims MCQs.\n' +
      'Use styles: "Consider the following statements", "Which is/are correct".\n' +
      'Return ONLY this JSON (no markdown):\n' +
      '{"questions":[' +
      '{"q":"Q1","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"Polity","source":"The Hindu"},' +
      '{"q":"Q2","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Economy","source":"The Hindu"},' +
      '{"q":"Q3","options":["A","B","C","D"],"answer":2,"explanation":"1 sentence.","subject":"Environment","source":"The Hindu"},' +
      '{"q":"Q4","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"IR","source":"The Hindu"},' +
      '{"q":"Q5","options":["A","B","C","D"],"answer":3,"explanation":"1 sentence.","subject":"Science","source":"The Hindu"},' +
      '{"q":"Q6","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Geography","source":"The Hindu"},' +
      '{"q":"Q7","options":["A","B","C","D"],"answer":2,"explanation":"1 sentence.","subject":"History","source":"The Hindu"},' +
      '{"q":"Q8","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"Polity","source":"The Hindu"},' +
      '{"q":"Q9","options":["A","B","C","D"],"answer":3,"explanation":"1 sentence.","subject":"Economy","source":"The Hindu"},' +
      '{"q":"Q10","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Art & Culture","source":"The Hindu"}' +
      ']}\n' +
      'THE HINDU TEXT:\n' + hinduText + '\nJSON only.';

    const [r1, rQ] = await Promise.all([
      callClaude(ANTHROPIC_KEY, summaryPrompt, 2500),
      callClaude(ANTHROPIC_KEY, questionsPrompt, 3000)
    ]);

    if (r1.status !== 200) throw new Error(r1.data && r1.data.error && r1.data.error.message || 'Claude summary error');
    if (rQ.status !== 200) throw new Error(rQ.data && rQ.data.error && rQ.data.error.message || 'Claude questions error');

    const content = parseJSON(r1.data.content[0].text);
    const qData = parseJSON(rQ.data.content[0].text);
    content.questions = qData.questions;

    // Translate to Hindi using Claude (context-aware)
    const toTranslate = {
      summary: content.summary,
      sections: content.sections.map(function(s) { return s.content; }),
      hlTitles: content.highlights.map(function(h) { return h.title; }),
      hlBodies: content.highlights.map(function(h) { return h.body; }),
      questions: content.questions.map(function(q) { return q.q; }),
      explanations: content.questions.map(function(q) { return q.explanation; }),
      staticNews: (content.staticConnects||[]).map(function(s) { return s.news; }),
      staticLinks: (content.staticConnects||[]).map(function(s) { return s.staticLink; })
    };

    const translated = await translateAllToHindi(ANTHROPIC_KEY, toTranslate);

    content.summaryHi = translated.summary || content.summary;
    content.sections = content.sections.map(function(s, i) {
      return Object.assign({}, s, {
        headingHi: sectionHiHeadings[s.tag] || s.heading,
        contentHi: (translated.sections && translated.sections[i]) || s.content
      });
    });
    content.highlights = content.highlights.map(function(h, i) {
      return Object.assign({}, h, {
        titleHi: (translated.hlTitles && translated.hlTitles[i]) || h.title,
        bodyHi: (translated.hlBodies && translated.hlBodies[i]) || h.body
      });
    });
    content.questions = content.questions.map(function(q, i) {
      return Object.assign({}, q, {
        qHi: (translated.questions && translated.questions[i]) || q.q,
        optionsHi: q.options,
        explanationHi: (translated.explanations && translated.explanations[i]) || q.explanation,
        subjectHi: subjectHiMap[q.subject] || q.subject
      });
    });
    content.staticConnects = (content.staticConnects||[]).map(function(s, i) {
      return Object.assign({}, s, {
        newsHi: (translated.staticNews && translated.staticNews[i]) || s.news,
        staticLinkHi: (translated.staticLinks && translated.staticLinks[i]) || s.staticLink,
        subjectHi: subjectHiMap[s.subject] || s.subject
      });
    });
    content.date = getTodayLabel();
    content.source = 'The Hindu';

    // Delete old + save new
    await supabaseRequest('DELETE', 'daily_content?date=eq.' + todayIST, null, SUPABASE_KEY, SUPABASE_URL);
    await supabaseRequest('POST', 'daily_content', { date: todayIST, content: content }, SUPABASE_KEY, SUPABASE_URL);

    return res.status(200).json({
      success: true,
      message: 'Content generated from ' + filename + ' and saved!',
      preview: { summary: content.summary.substring(0, 150) + '...' }
    });

  } catch (err) {
    console.error('Upload Hindu error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
