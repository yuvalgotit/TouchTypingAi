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

const limiterPerMinute = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 6,
  message: {
    sentence: "Too many requests! Please slow down and continue typing.",
    performanceTxt: ''
  },
});

const limiterPerDay = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 600,
  message: {
    sentence: "Daily request limit reached. Come back tomorrow!",
    aiNotes: ''
  },
});

const errorSentences = [
  'Flam tripped over his own long legs - try again.',
  'The flamingo dropped the keyboard in the lake.',
  'Flam is busy preening his feathers, come back soon.',
  'Oops - Flam pecked the wrong key!',
  'Server overheated, Flam fanned it with his wings.',
  'Flam fell asleep standing on one leg - wake him with another try.',
  'Typing got too hot, Flam had to cool his feathers.',
  'Flam is chasing bugs (literally and in the code).',
  "The flamingo's rhythm got thrown off, please retry.",
  'Flam squawked at the server and it crashed - sorry!'
];

const generationFallbacks = [
  'Flam forgot what he was about to say.',
  'The flamingo froze mid-sentence.',
  'Flam pecked the wrong keys and lost the sentence.',
  "Flam's feathers got in the way of the keyboard.",
  'Oops - Flam flew off before finishing the sentence.',
  'Flam was distracted by his reflection in the screen.',
  'The flamingo is speechless right now.',
  'Flam dropped the sentence into the lake.',
  'Server hiccup - Flam squawked and scared off the words.',
  'Flam tried to type but his beak got stuck on the spacebar.'
];

app.post('/generate-sentence', limiterPerMinute, limiterPerDay, async (req, res) => {
  try {
    const { sentence, problematicKeys, practiceTopic, performanceHistory = [], performance } = req.body;
    const speeds = ["slowest", "slower", "slow", "fastest", "faster", "fast", "normal"]

    if (typeof sentence !== 'string' || !Array.isArray(problematicKeys)) {
      return res.status(400).json({
        sentence: "Invalid inputs, the AI can't generate a new sentence.",
        aiNotes: ''
      });
    }

    const sanitizedSentence = sentence.slice(0, 150)
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
    const sanitizedPerformance = {
      accuracy: sanitizePrecenteage(performance.accuracy),
      consistency: sanitizePrecenteage(performance.consistency),
      wpm: sanitizeWPM(performance.wpm)
    }
    const sanitizedPerformanceHistory = performanceHistory.slice(-4).map(ph => {
      return {
        accuracy: sanitizePrecenteage(ph.accuracy),
        consistency: sanitizePrecenteage(ph.consistency),
        wpm: sanitizeWPM(ph.wpm),
        notes: ph.notes.slice(0, 150)
      }
    })

    const newAiNotes = await summarizeUserPerformance(sanitizedSentence, sanitizedProblematicKeys, sanitizedPerformance, sanitizedPerformanceHistory)

    sanitizedPerformanceHistory.push({ accuracy: sanitizedPerformance.accuracy, consistency: sanitizedPerformance.consistency, wpm: sanitizedPerformance.wpm, notes: newAiNotes })
    sanitizedPerformanceHistory.reverse()

    const nextSentence = await getNextSentence(sanitizedPerformanceHistory, sanitizedPracticeTopic, sanitizedPerformance.wpm)

    res.json({
      sentence: nextSentence || generationFallbacks[Math.floor(Math.random() * generationFallbacks.length)],
      aiNote: newAiNotes
    });

  } catch (err) {
    const randomSentence = errorSentences[Math.floor(Math.random() * errorSentences.length)];

    res.status(500).json({
      sentence: randomSentence,
      aiNote: "AI connection isn't working right now, so I can't process your typing and produce feedback"
    });
  }
});

app.post('/regenerate-sentence', limiterPerMinute, limiterPerDay, async (req, res) => {
  try {
    const { practiceTopic, performanceHistory = [] } = req.body;

    const sanitizedPracticeTopic = practiceTopic ? practiceTopic.slice(0, 30) : ''
    const sanitizedPerformanceHistory = performanceHistory.slice(-4).map(ph => {
      return {
        accuracy: sanitizePrecenteage(ph.accuracy),
        consistency: sanitizePrecenteage(ph.consistency),
        wpm: sanitizeWPM(ph.wpm),
        notes: ph.notes.slice(0, 150)
      }
    })

    const nextSentence = await getNextSentence(sanitizedPerformanceHistory, sanitizedPracticeTopic, sanitizedPerformanceHistory?.wpm)

    res.json({
      sentence: nextSentence || generationFallbacks[Math.floor(Math.random() * generationFallbacks.length)],
    });

  } catch (err) {
    const randomSentence = errorSentences[Math.floor(Math.random() * errorSentences.length)];
    console.log(err);

    res.status(500).json({
      sentence: randomSentence,
    });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

async function summarizeUserPerformance(sentence, problematicKeys, performance, performanceHistory) {
  const prompt = `You are an AI powered touch typing coach named Flam. In a brief (less than 25 words) no bullshit, ruthless second-person sentence, explain to the user what he should focus on next
- your way of coaching is first making sure accuracy is high because no mistakes are the basis of good typing.
- If accuracy is less than 97%, tell him he should focus on the keys/key sequences he made a mistake in (don't literally say that but just say the actual key sequences like "You often make mistake in the 'ing' sequence")
- If accuracy is high, tell him he should foxus on the keys/key sequences he was the slowest at (again, saying something like "You type t slow when it's after a, let's focus on that)
Don't use any blend encouragements or flufh.

The user wrote the sentence: "${sentence}" with and accuracy of ${performance.accuracy}%, consistency of ${performance.consistency}% and speed of ${performance.wpm} WPM.

${problematicKeys.length === 0
      ? 'user have not problematic keystrokes, feel free to go down on him sarcasticaly, be short and not specific'
      : `Here are his problematic keystrokes: ${JSON.stringify(problematicKeys)}`
}

${performanceHistory.length ? `
By the way, here is the history of what you wrote him recently:
${performanceHistory.map(performance => `- ${performance.notes}`).join(`
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
  const prompt = `You are an AI powered touch typing coach named Flam. Generate ** one short sentence ** or a ** series of short phrases ** less than 150 characters total, that the user will type exactly every char of it.

- Don't have any introduction, no preface and no foreword before the text because the user is typing every char of your output
- The sentence must specifically include the characters and key sequences mentioned in the "notes from previous typing sessions" data below.
- Never have a char just by it self surronded by spaces, lean toward real sequences, length greater than 2.
- Don't repeat the same word more than 2 times
- The sentence should feel like a ** focused, repetitive drill ** designed to correct specific finger placement issues.
- sprinkly in about 4 easy words in order to decrease user frastration while he is focusing on improving his weaknesses from past typing sessions 
- Do not force grammatical fluency but do stick to real words and short phrases.
- User want to practice typing ${practiceTopic}, incorporate a lot of snippets of it.
- If ${practiceTopic} is a language use only that and DONT mix languages, we don't want to user to switch between language while he type!
- If no language were mention, assume english.
- Never use optional diacritics, never mix languages
- if the user wants to practice on a programming language or certain symbols, include the appropriate symbols

notes from previous typing sessions:
- ${performanceHistory.map(performance => performance.notes).join(`
- `)}

Remember that the user is typing every token you output, so don't make it odd or weird, make it like a normal typing test, use numbers and symbols with good taste if at all
Also, no matter what output only in one language (even if previous typing sessions talks about different language) don't mix chars from different languages
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

function sanitizePrecenteage(precenteage) {
  let intPrecenteage = parseInt(precenteage);
  if (isNaN(intPrecenteage) || intPrecenteage < 0) wpm = 0;
  if (sanitizePrecenteage > 100) intPrecenteage = 100;
  return intPrecenteage;
}
