require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
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

// 5 requests per minute
const limiterPerMinute = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5,
  message: {
    sentence: "Too many requests! Please slow down and continue typing.",
    performanceTxt: ''
  },
});

// 600 requests per day
const limiterPerDay = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 600,
  message: {
    sentence: "Daily request limit reached. Come back tomorrow!",
    performanceTxt: ''
  },
});

app.post('/generate-sentence', limiterPerMinute, limiterPerDay, async (req, res) => {
  try {
    const { sentence, keystrokes, practiceTopic, performanceHistory = [] } = req.body;

    if (typeof sentence !== 'string' || !Array.isArray(keystrokes)) {
      return res.status(400).json({
        sentence: "Invalid inputs, the AI can't generate a new sentence.",
        performanceTxt: ''
      });
    }

    const sanitizedSentence = sentence.slice(0, 200)
    const sanitizedkeystrokes = keystrokes.slice(-400)
    const sanitizedPracticeTopic = practiceTopic ? practiceTopic.slice(0, 30) : ''
    const sanitizedperformanceHistory = performanceHistory.slice(-2).map(txt => txt.slice(0, 60))

    const userPerformanceTxt = await summarizeUserPerformance(sanitizedSentence, sanitizedkeystrokes)

    sanitizedperformanceHistory.push(userPerformanceTxt)
    sanitizedperformanceHistory.reverse()

    const nextSentence = await getNextSentence(sanitizedperformanceHistory, sanitizedPracticeTopic)

    res.json({
      sentence: nextSentence || 'LLM Error: failed to generate sentence',
      performanceTxt: userPerformanceTxt
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      sentence: 'Internal server error, sorry for the inconvenience.',
      performanceTxt: ''
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

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


  return response.choices[0].message.content.trim().slice(0, 40);
}

async function getNextSentence(performanceHistory, practiceTopic) {
  const prompt = `
You are an AI powered touch typing coach. Generate **one short sentence** or a **series of short phrases** less than 200 characters total, that the user will type exactly every char of it.

- Don't have any introduction, no preface and no foreword before the text because the user is typing every char of your output
- The sentence must **specifically and repeatedly** include the characters and key sequences mentioned in the "User performance" data below.
- When focusing on a letter, incorporate it in a word or a sequences, never just by itself surronded by spaces.
- The sentence should feel like a **focused, repetitive drill** designed to correct specific finger placement issues.
- Do not force grammatical fluency but do stick to real words and short phrases. Occasionally, and unpredictably, insert other elements (numbers, punctuation, or special characters) to add variety and ensure exposure to a wide range of keys. Keep these insertions sparse so the main focus remains on the targeted characters.
- Don't use commans in order to be grammatically correct but use them if the user should focus on them
${practiceTopic ? `- IMPORTANT! User want to practice on typing ${practiceTopic}, incorporate a lot of snippets of it` : ''}

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

  const cleanedSentence = newSentence
    .replace(/[‘’‛′]/g, "'")       // normalize apostrophes
    .replace(/[“”„]/g, '"')        // normalize quotes
    .replace(/[–—−]/g, "-")        // normalize dashes
    .replace(/\r?\n|\r/g, " ")     // remove newlines
    .replace(/\p{Extended_Pictographic}/gu, "") // remove emojis
    .replace(/\s+/g, " ")          // collapse multiple spaces
    .trim()
    .slice(0, 200);

  return cleanedSentence
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