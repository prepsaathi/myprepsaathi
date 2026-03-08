// api/current-affairs.js
// Vercel Serverless Function — PrepSaathi Current Affairs
// Fetches PIB + AIR News + PRS RSS feeds, sends to Claude API
// Returns: { date, summary, summaryHi, articles, questions }

export default async function handler(req, res) {

  // ── CORS ────────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // ── RSS SOURCES ──────────────────────────────────────────────────────────────
  const RSS_FEEDS = [
    {
      name: 'PIB (Press Information Bureau)',
      url: 'https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3',
      tag: 'PIB'
    },
    {
      name: 'AIR News (All India Radio)',
      url: 'https://newsonair.gov.in/rss.aspx',
      tag: 'AIR'
    },
    {
      name: 'PRS India (Parliament)',
      url: 'https://prsindia.org/feed',
      tag: 'PRS'
    }
  ];

  // ── FETCH RSS FEEDS ─────────────────────────────────────────────────────────
  async function fetchRSS(feed) {
    try {
      // Use allorigins proxy to bypass CORS on server side isn't needed
      // since this runs server-side on Vercel — direct fetch works
      const response = await fetch(feed.url, {
        headers: { 'User-Agent': 'PrepSaathi/1.0 (UPSC Prep Platform)' },
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const xml = await response.text();
      return parseRSS(xml, feed.tag);
    } catch (err) {
      console.error(`Failed to fetch ${feed.name}:`, err.message);
      return [];
    }
  }

  function parseRSS(xml, tag) {
    const items = [];
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const match of itemMatches) {
      const content = match[1];
      const title = stripCDATA(extract(content, 'title'));
      const description = stripCDATA(extract(content, 'description'));
      const pubDate = extract(content, 'pubDate');
      const link = extract(content, 'link');
      if (title && title.length > 10) {
        items.push({
          tag,
          title: cleanText(title),
          description: cleanText(description).substring(0, 400),
          pubDate,
          link
        });
      }
    }
    return items.slice(0, 8); // top 8 per source
  }

  function extract(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return match ? match[1].trim() : '';
  }

  function stripCDATA(str) {
    return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  }

  function cleanText(str) {
    return str
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '').replace(/&[a-z]+;/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  // ── FETCH ALL FEEDS IN PARALLEL ─────────────────────────────────────────────
  const feedResults = await Promise.all(RSS_FEEDS.map(fetchRSS));
  const allArticles = feedResults.flat();

  if (allArticles.length === 0) {
    return res.status(502).json({ error: 'Could not fetch any news feeds. Please try again.' });
  }

  // ── BUILD PROMPT FOR CLAUDE ─────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Asia/Kolkata'
  });

  const articleText = allArticles.map((a, i) =>
    `[${i + 1}] [${a.tag}] ${a.title}\n${a.description}`
  ).join('\n\n');

  const prompt = `You are a UPSC expert and educator for PrepSaathi, a free platform helping Indian students prepare for the IAS exam.

Today's date: ${today}

Here are today's news articles from PIB, AIR News, and PRS India:

${articleText}

Your task: Analyze these articles from a UPSC Civil Services Examination perspective and produce the following in valid JSON format only (no markdown, no explanation outside JSON):

{
  "summary": "A 150-200 word English summary of the most UPSC-relevant news today. Written clearly for aspirants. Mention key schemes, policies, constitutional provisions, or international events. Start with 'Today's current affairs covers...'",
  
  "summaryHi": "Same summary in Hindi (150-200 words), written in clear Hindi for Hindi-medium aspirants. Use Devanagari script. Start with 'आज के समसामयिक मामलों में...'",

  "highlights": [
    { "title": "Short English headline (max 8 words)", "titleHi": "Hindi headline", "body": "2-sentence English explanation with UPSC relevance", "bodyHi": "Same in Hindi", "tag": "Polity/Economy/Environment/IR/Science/History/Geography/Governance", "source": "PIB or AIR or PRS" }
  ],

  "questions": [
    {
      "q": "UPSC-style question in English (match actual UPSC Prelims phrasing)",
      "qHi": "Same question in Hindi",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "optionsHi": ["विकल्प A", "विकल्प B", "विकल्प C", "विकल्प D"],
      "answer": 0,
      "explanation": "Clear 3-4 sentence explanation in English with syllabus context",
      "explanationHi": "Same explanation in Hindi",
      "subject": "Subject name in English",
      "subjectHi": "विषय हिंदी में",
      "source": "PIB or AIR or PRS"
    }
  ]
}

Rules:
- highlights array: exactly 5 items, most important UPSC-relevant stories
- questions array: exactly 10 questions, varied across subjects, genuine UPSC Prelims difficulty
- answer field: 0-indexed integer (0=A, 1=B, 2=C, 3=D)
- All Hindi text must be in Devanagari script
- Questions must be directly based on today's news articles provided
- Match UPSC question style: "Consider the following statements", "Which of the following is correct", etc.
- Return ONLY valid JSON, nothing else`;

  // ── CALL CLAUDE API ─────────────────────────────────────────────────────────
  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(45000)
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Claude API error:', errText);
      return res.status(502).json({ error: 'AI service temporarily unavailable. Please try again in a moment.' });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content[0].text.trim();

    // Parse JSON — strip any accidental markdown fences
    const jsonText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(jsonText);

    // Attach metadata
    parsed.date = today;
    parsed.articleCount = allArticles.length;
    parsed.sources = RSS_FEEDS.map(f => f.name);
    parsed.generatedAt = new Date().toISOString();

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Processing error:', err);
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'Could not parse AI response. Please refresh and try again.' });
    }
    return res.status(500).json({ error: 'Something went wrong. Please try again in a moment.' });
  }
}
