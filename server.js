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

app.post('/generate-sentence', async (req, res) => {
  try {
    const { sentence, keystrokes, userFocus, performanceHistory = [] } = req.body;

    if (!sentence || !keystrokes) {
      return res.status(400).json({ error: 'Missing sentence/keystrokes, no way to evaluate user performance' });
    }

    const userPerformanceTxt = await summarizeUserPerformance(sentence, keystrokes)
    performanceHistory.push(userPerformanceTxt)
    performanceHistory.reverse()

    const nextSentence = await getNextSentence(performanceHistory, userFocus)

    res.json({
      sentence: nextSentence || `LLM Error: ${response.incomplete_details.reason}`,
      performanceTxt: userPerformanceTxt
    });

  } catch (err) {
    console.error(err);

    res.json({
      sentence: 'Internal server error, sorry for the inconvenience.',
      performanceTxt: ''
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// TODO: trim both sentence and keysrokes to make sure input tokens won't go out of hand
async function summarizeUserPerformance(sentence, keystrokes) {
  const prompt = `
You are an AI powered touch typing coach. In a brief (less than 40 words) no bullshit, ruthless third-person sentence, what are the user weaknesses, be specific about which keys, symbols, numbers and keys sequences are you talking about but do not mention words names because your input will be taken into consideration for his next practice and we don't want to reapeat the same words.

${createUserPerformancePromptInput(sentence, keystrokes)}
`

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 60
  });


  return response.choices[0].message.content.trim()
}

// TODO: trim each item in performanceHistory to make sure input token won't go out of hand (also, isn't that a problem the user client control so much of the prompt?)
async function getNextSentence(performanceHistory, userFocus) {
  const prompt = `
You are an AI powered touch typing coach. Generate **one short sentence** or a **series of short phrases** less than 200 characters total, that the user will type exactly every char of it.

- Don't have any introduction, no preface and no foreword before the text because the user is typing every char of your output
- The sentence must **specifically and repeatedly** include the characters and key sequences mentioned in the "User performance" data below.
- When focusing on a letter, incorporate it in a word or a sequences, never just by itself surronded by spaces.
- The sentence should feel like a **focused, repetitive drill** designed to correct specific finger placement issues.
- Do not force grammatical fluency but do stick to real words and short phrases. Occasionally, and unpredictably, insert other elements (numbers, punctuation, or special characters) to add variety and ensure exposure to a wide range of keys. Keep these insertions sparse so the main focus remains on the targeted characters.
- Do not feel the urge to use commans in order to be grammatically correct but use them if the user should focus on them
- Don't use emojis, Apostrophe or the symbol -.
${userFocus ? `- IMPORTANT! User want to practice on typing ${userFocus.substring(0, 30)}, incorporate a lot of snippets of it` : ''}

User performance:
-${performanceHistory.join(
    `
-`)}
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
    .replace(/”/g, '"')
    .replace(/-/, "-")

  return newSentenceWithKeyboardQuotes
}

function createUserPerformancePromptInput(sentence, keystrokes) {
  return `
The user wrote the sentence: "${sentence}" with ${keystrokes.filter(k => k.error).length} errors and in a speed of ${getWPM(sentence, keystrokes)} WPM.
Here are his keystrokes: ${JSON.stringify(keystrokes)}
  `
}

function getWPM(sentence, keystrokes) {
  const chars = sentence.length;
  const totalTimeMs = keystrokes.reduce((acc, k) => acc + k.delta, 0);
  if (!totalTimeMs) return 0;
  const minutes = totalTimeMs / 60000;
  return Math.round((chars / 5) / minutes);
}