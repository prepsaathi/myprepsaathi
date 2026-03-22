// api/current-affairs.js — PrepSaathi with Supabase Daily Caching

const https = require('https');

// ── SUPABASE ────────────────────────────────────────────────────────────────
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

// ── GENERATE CONTENT — English + Hindi in parallel ──────────────────────────
async function generateContent(anthropicKey) {
  const today = getTodayLabel();

  const basePrompt = (lang) => {
    const isHi = lang === 'hi';
    return `You are a UPSC current affairs expert. Today: ${today}.
Generate content based on official Indian government sources: PIB, AIR News, PRS, MoEF, RBI, MEA.
Also include Geography, History and Art & Culture static connects from today's news.
${isHi ? 'Write ALL text values in Hindi Devanagari script. Use proper UPSC Hindi: Strike=हमला, Treaty=संधि, Parliament=संसद, Amendment=संशोधन, Bilateral=द्विपक्षीय, Sanctions=प्रतिबंध, Ceasefire=युद्धविराम, Summit=शिखर सम्मेलन, Satellite=उपग्रह.' : 'Write ALL text values in English.'}
Return ONLY this JSON (no markdown):
{"summary":"6 sentences on today UPSC news. Start: ${isHi ? 'आज के समसामयिक मामलों में' : "Today's current affairs covers"}","sections":[{"tag":"Polity","heading":"${isHi?'राजनीति और शासन':'Polity & Governance'}","icon":"⚖️","content":"1 sentence polity news."},{"tag":"Economy","heading":"${isHi?'अर्थव्यवस्था और वित्त':'Economy & Finance'}","icon":"📈","content":"1 sentence economy news."},{"tag":"IR","heading":"${isHi?'अंतर्राष्ट्रीय संबंध':'International Relations'}","icon":"🌏","content":"1 sentence IR news."},{"tag":"Environment","heading":"${isHi?'पर्यावरण':'Environment'}","icon":"🌿","content":"1 sentence environment news."},{"tag":"Science","heading":"${isHi?'विज्ञान और प्रौद्योगिकी':'Science & Tech'}","icon":"🔬","content":"1 sentence science news."},{"tag":"Geography","heading":"${isHi?'भूगोल':'Geography'}","icon":"🗺️","content":"1 sentence geography connect."},{"tag":"History","heading":"${isHi?'इतिहास':'History'}","icon":"🏛️","content":"1 sentence history connect."},{"tag":"Art & Culture","heading":"${isHi?'कला और संस्कृति':'Art & Culture'}","icon":"🎭","content":"1 sentence culture connect."}],"highlights":[{"title":"headline","body":"1 sentence.","tag":"Polity","source":"PIB"},{"title":"headline","body":"1 sentence.","tag":"Economy","source":"RBI"},{"title":"headline","body":"1 sentence.","tag":"IR","source":"MEA"},{"title":"headline","body":"1 sentence.","tag":"Environment","source":"MoEF"},{"title":"headline","body":"1 sentence.","tag":"Science","source":"PIB"}],"staticConnects":[{"news":"news event.","staticLink":"UPSC syllabus connection.","subject":"Polity","icon":"⚖️"},{"news":"news.","staticLink":"connection.","subject":"Geography","icon":"🗺️"},{"news":"news.","staticLink":"connection.","subject":"History","icon":"🏛️"},{"news":"news.","staticLink":"connection.","subject":"Art & Culture","icon":"🎭"},{"news":"news.","staticLink":"connection.","subject":"Economy","icon":"📈"}]}
JSON only.`;
  };

  const questionsPrompt = `You are a UPSC Prelims expert. Today: ${today}.
Generate 10 UPSC Prelims MCQs from PIB, AIR, MoEF, RBI, MEA.
Use styles: "Consider the following statements", "Which is/are correct", "Select using codes".
Return ONLY this JSON (no markdown):
{"questions":[{"q":"Q1","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"Polity","source":"PIB"},{"q":"Q2","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Economy","source":"RBI"},{"q":"Q3","options":["A","B","C","D"],"answer":2,"explanation":"1 sentence.","subject":"Environment","source":"MoEF"},{"q":"Q4","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"IR","source":"MEA"},{"q":"Q5","options":["A","B","C","D"],"answer":3,"explanation":"1 sentence.","subject":"Science","source":"PIB"},{"q":"Q6","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Geography","source":"PIB"},{"q":"Q7","options":["A","B","C","D"],"answer":2,"explanation":"1 sentence.","subject":"History","source":"AIR"},{"q":"Q8","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"Polity","source":"PRS"},{"q":"Q9","options":["A","B","C","D"],"answer":3,"explanation":"1 sentence.","subject":"Economy","source":"AIR"},{"q":"Q10","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Art & Culture","source":"PIB"}]}
JSON only.`;

  const questionsHiPrompt = `You are a UPSC Prelims expert. Today: ${today}.
Generate 10 UPSC Prelims MCQs. Write ALL text in Hindi Devanagari.
Use UPSC Hindi: Strike=हमला, Treaty=संधि, Parliament=संसद, Bilateral=द्विपक्षीय.
Return ONLY this JSON (no markdown):
{"questions":[{"q":"प्रश्न 1","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence Hindi.","subject":"Polity"},{"q":"प्रश्न 2","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Economy"},{"q":"प्रश्न 3","options":["A","B","C","D"],"answer":2,"explanation":"1 sentence.","subject":"Environment"},{"q":"प्रश्न 4","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"IR"},{"q":"प्रश्न 5","options":["A","B","C","D"],"answer":3,"explanation":"1 sentence.","subject":"Science"},{"q":"प्रश्न 6","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Geography"},{"q":"प्रश्न 7","options":["A","B","C","D"],"answer":2,"explanation":"1 sentence.","subject":"History"},{"q":"प्रश्न 8","options":["A","B","C","D"],"answer":0,"explanation":"1 sentence.","subject":"Polity"},{"q":"प्रश्न 9","options":["A","B","C","D"],"answer":3,"explanation":"1 sentence.","subject":"Economy"},{"q":"प्रश्न 10","options":["A","B","C","D"],"answer":1,"explanation":"1 sentence.","subject":"Art & Culture"}]}
JSON only.`;

  // 4 parallel calls — EN content + HI content + EN questions + HI questions
  const [rEN, rHI, rQEN, rQHI] = await Promise.all([
    callClaude(anthropicKey, basePrompt('en'), 2500),
    callClaude(anthropicKey, basePrompt('hi'), 2500),
    callClaude(anthropicKey, questionsPrompt, 3000),
    callClaude(anthropicKey, questionsHiPrompt, 3000)
  ]);

  if (rEN.status !== 200) throw new Error(rEN.data?.error?.message || 'Claude EN error');
  if (rHI.status !== 200) throw new Error(rHI.data?.error?.message || 'Claude HI error');
  if (rQEN.status !== 200) throw new Error(rQEN.data?.error?.message || 'Claude Q EN error');
  if (rQHI.status !== 200) throw new Error(rQHI.data?.error?.message || 'Claude Q HI error');

  const enData = parseJSON(rEN.data.content[0].text);
  const hiData = parseJSON(rHI.data.content[0].text);
  const qEN = parseJSON(rQEN.data.content[0].text);
  const qHI = parseJSON(rQHI.data.content[0].text);

  // Merge EN + HI
  const content = {
    date: getTodayLabel(),
    summary: enData.summary,
    summaryHi: hiData.summary,
    sections: enData.sections.map((s, i) => ({
      ...s,
      headingHi: sectionHiHeadings[s.tag] || s.heading,
      contentHi: (hiData.sections && hiData.sections[i]?.content) || s.content
    })),
    highlights: enData.highlights.map((h, i) => ({
      ...h,
      titleHi: (hiData.highlights && hiData.highlights[i]?.title) || h.title,
      bodyHi: (hiData.highlights && hiData.highlights[i]?.body) || h.body
    })),
    staticConnects: (enData.staticConnects || []).map((s, i) => ({
      ...s,
      newsHi: (hiData.staticConnects && hiData.staticConnects[i]?.news) || s.news,
      staticLinkHi: (hiData.staticConnects && hiData.staticConnects[i]?.staticLink) || s.staticLink,
      subjectHi: subjectHiMap[s.subject] || s.subject
    })),
    questions: qEN.questions.map((q, i) => ({
      ...q,
      qHi: (qHI.questions && qHI.questions[i]?.q) || q.q,
      optionsHi: q.options,
      explanationHi: (qHI.questions && qHI.questions[i]?.explanation) || q.explanation,
      subjectHi: subjectHiMap[q.subject] || q.subject
    }))
  };

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

    // Generate fresh
    console.log('Cache MISS — generating...');
    const content = await generateContent(ANTHROPIC_KEY);

    // Save to Supabase
    await supabaseRequest('POST', 'daily_content', { date: todayIST, content }, SUPABASE_KEY, SUPABASE_URL);
    console.log('Saved:', todayIST);

    return res.status(200).json(content);

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
