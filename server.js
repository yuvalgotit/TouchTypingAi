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
    aiNotes: ''
  },
});

app.post('/generate-sentence', limiterPerMinute, limiterPerDay, async (req, res) => {
  try {
    const { sentence, problematicKeys, practiceTopic, performanceHistory = [], wpm } = req.body;
    const speeds = ["slowest", "slower", "slow", "fastest", "faster", "fast", "normal"]

    if (typeof sentence !== 'string' || !Array.isArray(problematicKeys)) {
      return res.status(400).json({
        sentence: "Invalid inputs, the AI can't generate a new sentence.",
        aiNotes: ''
      });
    }

    const sanitizedSentence = sentence.slice(0, 200)
    const sanitizedProblematicKeys = problematicKeys.slice(-15)
      .filter(k => k.key.length === 1
        && speeds.includes(k.speed)
        && k.precedingKeys.length > 0
        && k.precedingKeys.length <= 4
        && k.precedingKeys[0].length === 1
        && (k.precedingKeys[1] === undefined || k.precedingKeys[1].length === 1)
        && (k.precedingKeys[2] === undefined || k.precedingKeys[2].length === 1)
        && (k.precedingKeys[3] === undefined || k.precedingKeys[3].length === 1)
        && (k.expected === undefined || k.expected.length === 1)
        && (k.mistyped === undefined || k.mistyped === true))


    const sanitizedPracticeTopic = practiceTopic ? practiceTopic.slice(0, 30) : ''
    const sanitizedPerformanceHistory = performanceHistory.slice(-4).map(performance => {
      return {
        wpm: sanitizeWPM(performance.wpm),
        notes: performance.notes.slice(0, 150)
      }
    })

    const newAiNotes = await summarizeUserPerformance(sanitizedSentence, sanitizedProblematicKeys, wpm, sanitizedPerformanceHistory)

    sanitizedPerformanceHistory.push({ wpm: wpm, notes: newAiNotes })
    sanitizedPerformanceHistory.reverse()

    const nextSentence = await getNextSentence(sanitizedPerformanceHistory, sanitizedPracticeTopic, wpm)

    res.json({
      sentence: nextSentence || 'LLM Error: failed to generate sentence',
      aiNote: newAiNotes
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      sentence: 'Internal server error, sorry for the inconvenience.',
      aiNotes: ''
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

async function summarizeUserPerformance(sentence, problematicKeys, wpm, performanceHistory) {
  const prompt = `You are an AI powered touch typing coach named Flam. In a brief (less than 25 words) no bullshit, ruthless second-person sentence, explain to the user his main weaknesses, be specific about which key or keys sequence you're talking about
- Do not use commas, quotes or slashes at all unless user struggle in them and you want to mention them, When you want to talk about a key just type the key
- Identify recurring sequence or transition where mistypes cluster together. If multiple consecutive keystrokes fail, report the sequence itself instead of each key.
- Don't use any encouragements, just talk about the main weak point without any improvment suggestions or flufh.

The user wrote the sentence: "${sentence}" with ${problematicKeys.filter(k => k.mistyped).length} mistypes and at the speed of ${wpm} WPM.
${problematicKeys.length === 0
      ? 'user have not problematic keystrokes, feel free to go down on him sarcasticaly, be short and not specific'
      : problematicKeys.filter(pk => pk.mistyped).length === 0
        ? `user made no mistypes, feel free to be a bit sarcastic when analyzing it: ${JSON.stringify(problematicKeys)}`
        : `Here are his problematic keystrokes: ${JSON.stringify(problematicKeys)}`
    }

${performanceHistory.length ? `
By the way, here is the history of what you wrote him recently:
${performanceHistory.map(performance => `- [${wpm}wpm] ${performance.notes}`).join(`
`)}` : ''
    }
`
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 60
  });

  return response.choices[0].message.content.trim().slice(0, 200);
}

async function getNextSentence(performanceHistory, practiceTopic, wpm) {
  let whichSymbolsToUse = `- Never use upper case letters
- Never use punctuation
- Never use numbers
- Never use symbols`

  if (wpm > 100) {
    whichSymbolsToUse = `- Sprinkly some upper case letters, numbers, punctuation and symbols from time to time`
  }
  if (wpm > 80) {
    whichSymbolsToUse = `- Never use symbols`
  }
  else if (wpm > 70) {
    whichSymbolsToUse = `- Never use numbers
- Never use symbols`
  }
  else if (wpm > 60) {
    whichSymbolsToUse = `- Never use punctuation
- Never use numbers
- Never use symbols`
  }

  // TODO: 20 % of the sentence should be easy and unrelated, is very important, double down on that
  const prompt = `You are an AI powered touch typing coach named Flam. Generate ** one short sentence ** or a ** series of short phrases ** less than 200 characters total, that the user will type exactly every char of it.

- Don't have any introduction, no preface and no foreword before the text because the user is typing every char of your output
  - The sentence must ** specifically and repeatedly ** include the characters and key sequences mentioned in the "AI notes from previous typing sessions" data below.
- When focusing on a letter, incorporate it in a word or a sequences, never just by itself surronded by spaces, for example if focusing on the letter m, never "m m m" but "mom makes me more".
- The sentence should feel like a ** focused, repetitive drill ** designed to correct specific finger placement issues.
- 20 % of the sentence should not focus on the "AI notes from previous typing sessions" but be random simple words from the top 100. the idea is to give the user 20 % easy words to type for small wins
  - Do not force grammatical fluency but do stick to real words and short phrases.
- Never type a single letter surrounded by spaces, stick to words
${whichSymbolsToUse}
${practiceTopic ? `- IMPORTANT! User want to practice on typing ${practiceTopic}, incorporate a lot of snippets of it
- if the user wants to practice on a language, use only this language or no other, don't mix languages. unless he wants numbers than incorporate some numbers ranging from 0-2000 with the rest of the text
- if the user wants to practice on a programming language or certain symbols, use the appropriate symbols even if we say we won't above, the user is the most important` : ''}

AI notes from previous typing sessions:
- ${performanceHistory.map(performance => performance.notes).join(`
- `)}
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

function sanitizeWPM(input) {
  let wpm = parseInt(input);
  if (isNaN(wpm) || wpm < 0) wpm = 0;
  if (wpm > 400) wpm = 400;
  return wpm;
}
