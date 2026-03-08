// api/current-affairs.js — CommonJS for Vercel compatibility

const https = require('https');
const http = require('http');

module.exports = async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  // ── FETCH URL HELPER ────────────────────────────────────────────────────────
  function fetchUrl(url, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (PrepSaathi UPSC Platform)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      }, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          return fetchUrl(r.headers.location, timeoutMs).then(resolve).catch(reject);
        }
        let data = '';
        r.on('data', chunk => data += chunk);
        r.on('end', () => resolve(data));
      });
      req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Timeout')); });
      req.on('error', reject);
    });
  }

  // ── RSS PARSER ───────────────────────────────────────────────────────────────
  function parseRSS(xml, tag) {
    const items = [];
    const matches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const m of matches) {
      const block = m[1];
      const title = cleanText(stripCDATA(extractTag(block, 'title')));
      const desc  = cleanText(stripCDATA(extractTag(block, 'description')));
      if (title && title.length > 8) {
        items.push({ tag, title, description: desc.substring(0, 350) });
      }
    }
    return items.slice(0, 7);
  }

  function extractTag(xml, tag) {
    const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? m[1].trim() : '';
  }
  function stripCDATA(s) { return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim(); }
  function cleanText(s) {
    return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<')
            .replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#\d+;/g,'')
            .replace(/\s+/g,' ').trim();
  }

  // ── RSS SOURCES ───────────────────────────────────────────────────────────────
  const RSS_FEEDS = [
    { name: 'PIB',       tag: 'PIB', url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3' },
    { name: 'AIR News',  tag: 'AIR', url: 'https://newsonair.gov.in/rss.aspx' },
    { name: 'PRS India', tag: 'PRS', url: 'https://prsindia.org/feed' },
  ];

  const allArticles = [];
  for (const feed of RSS_FEEDS) {
    try {
      const xml = await fetchUrl(feed.url);
      const items = parseRSS(xml, feed.tag);
      allArticles.push(...items);
      console.log(`${feed.tag}: fetched ${items.length} items`);
    } catch (e) {
      console.log(`Skipped ${feed.name}: ${e.message}`);
    }
  }

  const fallback = allArticles.length === 0;
  const articleText = fallback
    ? 'No live feeds available. Generate 5 highlights and 10 questions on recent UPSC topics: Indian polity, economy, environment, science & technology, and international relations.'
    : allArticles.map((a, i) => `[${i+1}] [${a.tag}] ${a.title}\n${a.description}`).join('\n\n');

  const today = new Date().toLocaleDateString('en-IN', {
    weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Kolkata'
  });

  const prompt = `You are a UPSC Civil Services exam expert for PrepSaathi, a free IAS preparation platform.

Today: ${today}
${fallback ? 'Note: Live news feeds unavailable. Generate from recent UPSC-relevant knowledge.' : 'News from PIB, AIR News, PRS India:'}

${articleText}

Return ONLY a valid JSON object, no markdown, no text outside JSON:

{
  "summary": "150-200 word English summary. Start: Today's current affairs covers...",
  "summaryHi": "Same in Hindi Devanagari 150-200 words. Start: आज के समसामयिक मामलों में...",
  "highlights": [
    {"title":"English headline max 8 words","titleHi":"Hindi Devanagari","body":"2-sentence English UPSC context","bodyHi":"Same Hindi","tag":"Polity","source":"PIB"}
  ],
  "questions": [
    {"q":"UPSC English question","qHi":"Hindi Devanagari","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"3-4 sentence English","explanationHi":"Hindi","subject":"Polity","subjectHi":"राजनीति","source":"PIB"}
  ]
}

Rules: highlights=exactly 5, questions=exactly 10, answer is 0-indexed int, mix subjects, UPSC style questions, all Hindi in Devanagari. Return ONLY JSON.`;

  try {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    });

    const claudeResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      const r = https.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      r.setTimeout(55000, () => { r.destroy(); reject(new Error('Claude timeout')); });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    if (claudeResponse.status !== 200) {
      console.error('Claude API error status:', claudeResponse.status, claudeResponse.body);
      return res.status(502).json({ error: 'AI service error. Please try again.' });
    }

    const claudeData = JSON.parse(claudeResponse.body);
    const rawText = claudeData.content[0].text.trim()
      .replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();

    const parsed = JSON.parse(rawText);
    parsed.date = today;
    parsed.articleCount = allArticles.length;
    parsed.generatedAt = new Date().toISOString();

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: 'Error: ' + err.message });
  }
};
