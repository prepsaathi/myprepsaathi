// api/current-affairs.js — PrepSaathi

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

async function generateContent(anthropicKey) {
  const today = getTodayLabel();

  // CALL 1 — English summary + sections + highlights + staticConnects
  const summaryPrompt = 'UPSC expert. Today: ' + today + '. Sources: PIB,AIR,RBI,MEA,MoEF.\n' +
    'Return ONLY valid JSON, no markdown, no extra text:\n' +
    '{"summary":"5 sentences on todays UPSC news. Start: Todays current affairs covers",' +
    '"sections":[' +
    '{"tag":"Polity","heading":"Polity & Governance","icon":"⚖️","content":"1 sentence."},' +
    '{"tag":"Economy","heading":"Economy & Finance","icon":"📈","content":"1 sentence."},' +
    '{"tag":"IR","heading":"International Relations","icon":"🌏","content":"1 sentence."},' +
    '{"tag":"Environment","heading":"Environment","icon":"🌿","content":"1 sentence."},' +
    '{"tag":"Science","heading":"Science & Tech","icon":"🔬","content":"1 sentence."},' +
    '{"tag":"Geography","heading":"Geography","icon":"🗺️","content":"1 sentence geography connect."},' +
    '{"tag":"History","heading":"History","icon":"🏛️","content":"1 sentence history connect."},' +
    '{"tag":"Art & Culture","heading":"Art & Culture","icon":"🎭","content":"1 sentence culture connect."}],' +
    '"highlights":[' +
    '{"title":"title","body":"1 sentence.","tag":"Polity","source":"PIB"},' +
    '{"title":"title","body":"1 sentence.","tag":"Economy","source":"RBI"},' +
    '{"title":"title","body":"1 sentence.","tag":"IR","source":"MEA"},' +
    '{"title":"title","body":"1 sentence.","tag":"Environment","source":"MoEF"},' +
    '{"title":"title","body":"1 sentence.","tag":"Science","source":"PIB"}],' +
    '"staticConnects":[' +
    '{"news":"news.","staticLink":"UPSC syllabus link.","subject":"Polity","icon":"⚖️"},' +
    '{"news":"news.","staticLink":"link.","subject":"Geography","icon":"🗺️"},' +
    '{"news":"news.","staticLink":"link.","subject":"History","icon":"🏛️"},' +
    '{"news":"news.","staticLink":"link.","subject":"Art & Culture","icon":"🎭"},' +
    '{"news":"news.","staticLink":"link.","subject":"Economy","icon":"📈"}]}';

  // CALL 2 — English questions
  const questionsPrompt = 'UPSC Prelims expert. Today: ' + today + '. Sources: PIB,AIR,MoEF,RBI,MEA.\n' +
    'Generate 10 MCQs. Use: Consider the following statements / Which is correct / Select using codes.\n' +
    'Return ONLY valid JSON, no markdown:\n' +
    '{"questions":[' +
    '{"q":"Q1","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"Polity","source":"PIB"},' +
    '{"q":"Q2","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Economy","source":"RBI"},' +
    '{"q":"Q3","options":["A","B","C","D"],"answer":2,"explanation":"1 sentence.","subject":"Environment","source":"MoEF"},' +
    '{"q":"Q4","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"IR","source":"MEA"},' +
    '{"q":"Q5","options":["A","B","C","D"],"answer":3,"explanation":"1 sentence.","subject":"Science","source":"PIB"},' +
    '{"q":"Q6","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Geography","source":"PIB"},' +
    '{"q":"Q7","options":["A","B","C","D"],"answer":2,"explanation":"1 sentence.","subject":"History","source":"AIR"},' +
    '{"q":"Q8","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"Polity","source":"PRS"},' +
    '{"q":"Q9","options":["A","B","C","D"],"answer":3,"explanation":"1 sentence.","subject":"Economy","source":"AIR"},' +
    '{"q":"Q10","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Art & Culture","source":"PIB"}]}';

  // CALL 3 — Hindi summary only (small, focused)
  const hiSummaryPrompt = 'Translate to Hindi Devanagari. Use UPSC terms: Strike=हमला, Treaty=संधि, Parliament=संसद, Summit=शिखर सम्मेलन, Bilateral=द्विपक्षीय, Sanctions=प्रतिबंध. Return ONLY the Hindi translation, nothing else.';

  // Run summary + questions in parallel first
  const [rS, rQ] = await Promise.all([
    callClaude(anthropicKey, summaryPrompt, 2500),
    callClaude(anthropicKey, questionsPrompt, 3000)
  ]);

  if (rS.status !== 200) throw new Error(rS.data?.error?.message || 'Claude summary error');
  if (rQ.status !== 200) throw new Error(rQ.data?.error?.message || 'Claude questions error');

  const enData = parseJSON(rS.data.content[0].text);
  const qData = parseJSON(rQ.data.content[0].text);

  // Now translate ONLY the summary (small call)
  const rHi = await callClaude(anthropicKey,
    hiSummaryPrompt + '\n\n' + enData.summary, 500);
  const summaryHi = rHi.data.content[0].text.trim();

  // Build final content — Hindi section headings hardcoded, content in English with Hindi heading
  const content = {
    date: getTodayLabel(),
    summary: enData.summary,
    summaryHi: summaryHi,
    sections: enData.sections.map(s => ({
      ...s,
      headingHi: sectionHiHeadings[s.tag] || s.heading,
      contentHi: s.content // same English content — accurate better than wrong translation
    })),
    highlights: enData.highlights.map(h => ({
      ...h,
      titleHi: h.title,
      bodyHi: h.body
    })),
    staticConnects: (enData.staticConnects || []).map(s => ({
      ...s,
      newsHi: s.news,
      staticLinkHi: s.staticLink,
      subjectHi: subjectHiMap[s.subject] || s.subject
    })),
    questions: qData.questions.map(q => ({
      ...q,
      qHi: q.q,
      optionsHi: q.options,
      explanationHi: q.explanation,
      subjectHi: subjectHiMap[q.subject] || q.subject
    }))
  };

  return content;
}

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
    const cached = await supabaseRequest(
      'GET', 'daily_content?date=eq.' + todayIST + '&limit=1',
      null, SUPABASE_KEY, SUPABASE_URL
    );

    if (cached.status === 200) {
      const rows = JSON.parse(cached.body);
      if (rows.length > 0) {
        console.log('Cache HIT:', todayIST);
        return res.status(200).json(rows[0].content);
      }
    }

    console.log('Cache MISS — generating...');
    const content = await generateContent(ANTHROPIC_KEY);

    await supabaseRequest('POST', 'daily_content',
      { date: todayIST, content }, SUPABASE_KEY, SUPABASE_URL);

    return res.status(200).json(content);

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
