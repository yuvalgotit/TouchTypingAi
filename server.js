require('dotenv').config();
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function getWPM(sentence, keystrokes) {
  const chars = sentence.length;
  const totalTimeMs = keystrokes.reduce((acc, k) => acc + k.delta, 0);
  if (!totalTimeMs) return 0;
  const minutes = totalTimeMs / 60000;
  return Math.round((chars / 5) / minutes);
}

app.post('/generate-sentence', async (req, res) => {
  try {
    const { sentence, keystrokes } = req.body;
    if (!keystrokes) return res.status(400).json({ error: 'Keystrokes missing' });

    const errors = keystrokes.filter(k => k.error).length;

    const prompt = `
You are a touch typing coach. Based on the user's last sentence and keystroke data, generate a new sentence for them to type.
- Encourage strengths (make them feel good).
- Focus on weaknesses (more practice where they make errors or are slow).
- Add a small element of randomness (symbol, number, or odd word) for variety.
- Shorter than 150 chars.
- Don't use emojis

User's last sentence: "${sentence}"
Errors: ${errors}
WPM: ${getWPM(sentence, keystrokes)}
Keystrokes: ${JSON.stringify(keystrokes)}
Output only the new sentence, user will type everything you write, even if you start with an explanation so keep that in mind.
`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 60
    });

    const newSentence = response.choices[0].message.content.trim()
    
    const newSentenceWithKeyboardQuotes = newSentence
        .replace(/’/g, "'")
        .replace(/“/g, '"')
        .replace(/”/g, '"');

    res.json({ sentence: newSentenceWithKeyboardQuotes });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'OpenAI request failed' });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
