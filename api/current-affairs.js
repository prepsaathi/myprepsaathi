// api/current-affairs.js — PrepSaathi FINAL VERSION
// Single focused call, 5 questions, minimal tokens

const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) return res.status(500).json({ error: 'API key not configured.' });

  const today = new Date().toLocaleDateString('en-IN', {
    weekday:'long', year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Kolkata'
  });

  const type = req.query.type || 'all';

  // Extremely focused prompts — one thing at a time
  const prompts = {

    summary: `You are a UPSC expert. Today: ${today}.
Write a 5-sentence English paragraph on today's UPSC current affairs. Cover polity, economy, environment. Include real facts. Start with: "Today's current affairs covers"
Return ONLY the paragraph text. No JSON. No bullets. No extra text.`,

    summaryHi: `Translate this English paragraph to Hindi Devanagari script. Return ONLY the Hindi text, nothing else:
"Today's current affairs covers important developments in Indian polity, economy, environment, and international relations relevant to UPSC Civil Services Examination aspirants."`,

    sections: `UPSC expert. Today: ${today}. Return ONLY this exact JSON with real content (no markdown):
{"sections":[{"tag":"Polity","heading":"Polity & Governance","headingHi":"राजनीति","icon":"⚖️","content":"One real sentence about Indian polity today.","contentHi":"एक वाक्य हिंदी में।"},{"tag":"Economy","heading":"Economy","headingHi":"अर्थव्यवस्था","icon":"📈","content":"One real sentence about economy.","contentHi":"एक वाक्य हिंदी में।"},{"tag":"IR","heading":"International Relations","headingHi":"विदेश नीति","icon":"🌏","content":"One real sentence about IR.","contentHi":"एक वाक्य हिंदी में।"},{"tag":"Environment","heading":"Environment","headingHi":"पर्यावरण","icon":"🌿","content":"One real sentence about environment.","contentHi":"एक वाक्य हिंदी में।"},{"tag":"Science","heading":"Science & Tech","headingHi":"विज्ञान","icon":"🔬","content":"One real sentence about science.","contentHi":"एक वाक्य हिंदी में।"}],"highlights":[{"title":"Headline 1","titleHi":"शीर्षक 1","body":"One sentence body.","bodyHi":"एक वाक्य।","tag":"Polity","source":"PIB"},{"title":"Headline 2","titleHi":"शीर्षक 2","body":"One sentence.","bodyHi":"एक वाक्य।","tag":"Economy","source":"AIR"},{"title":"Headline 3","titleHi":"शीर्षक 3","body":"One sentence.","bodyHi":"एक वाक्य।","tag":"IR","source":"PIB"},{"title":"Headline 4","titleHi":"शीर्षक 4","body":"One sentence.","bodyHi":"एक वाक्य।","tag":"Environment","source":"AIR"},{"title":"Headline 5","titleHi":"शीर्षक 5","body":"One sentence.","bodyHi":"एक वाक्य।","tag":"Science","source":"PIB"}]}`,

    questions: `UPSC expert. Today: ${today}. Return ONLY this JSON with 5 real UPSC MCQs (no markdown):
{"questions":[{"q":"Real UPSC question 1","qHi":"प्रश्न 1","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"One sentence.","explanationHi":"एक वाक्य।","subject":"Polity","subjectHi":"राजनीति","source":"PIB"},{"q":"Real UPSC question 2","qHi":"प्रश्न 2","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":1,"explanation":"One sentence.","explanationHi":"एक वाक्य।","subject":"Economy","subjectHi":"अर्थव्यवस्था","source":"AIR"},{"q":"Real UPSC question 3","qHi":"प्रश्न 3","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":2,"explanation":"One sentence.","explanationHi":"एक वाक्य।","subject":"Environment","subjectHi":"पर्यावरण","source":"PIB"},{"q":"Real UPSC question 4","qHi":"प्रश्न 4","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":0,"explanation":"One sentence.","explanationHi":"एक वाक्य।","subject":"IR","subjectHi":"अंतर्राष्ट्रीय संबंध","source":"AIR"},{"q":"Real UPSC question 5","qHi":"प्रश्न 5","options":["A","B","C","D"],"optionsHi":["A","B","C","D"],"answer":3,"explanation":"One sentence.","explanationHi":"एक वाक्य।","subject":"Science","subjectHi":"विज्ञान","source":"PIB"}]}`
  };

  function claude(prompt, maxTok=800) {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTok,
      messages: [{ role: 'user', content: prompt }]
    });
    return new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
        headers: { 'Content-Type':'application/json','x-api-key':KEY,'anthropic-version':'2023-06-01','Content-Length':Buffer.byteLength(body) }
      }, (resp) => {
        let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>resolve(JSON.parse(d)));
      });
      r.on('error', reject); r.write(body); r.end();
    });
  }

  function parseJSON(text) {
    return JSON.parse(text.trim().replace(/^```json\s*/i,'').replace(/^```/,'').replace(/```$/,'').trim());
  }

  try {
    if (type === 'summary') {
      // 3 tiny parallel calls
      const [s1, s2, s3] = await Promise.all([
        claude(prompts.summary, 400),
        claude(prompts.sections, 900),
        claude(prompts.questions, 900)
      ]);

      const summary = s1.content[0].text.trim();
      const sections = parseJSON(s2.content[0].text);
      const questions = parseJSON(s3.content[0].text);

      // Quick Hindi translation of summary
      const s4 = await claude(`Translate to Hindi Devanagari: "${summary.substring(0,200)}"`, 300);
      const summaryHi = s4.content[0].text.trim();

      return res.status(200).json({
        date: today,
        summary,
        summaryHi,
        ...sections,
        ...questions
      });
    }

    return res.status(400).json({ error: 'Invalid type' });

  } catch(err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
