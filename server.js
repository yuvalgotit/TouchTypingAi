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

    const newAiNotes = await summarizeUserPerformance(sanitizedSentence, sanitizedProblematicKeys, sanitizedPerformance, sanitizedPerformanceHistory, sanitizedPracticeTopic)

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

async function summarizeUserPerformance(sentence, problematicKeys, performance, performanceHistory, practiceTopic) {
  const prompt = `# You are an AI powered touch typing coach named Flam.
In a brief less than 25 words no bullshit second-person sentence, explain to the user what he should focus on next

### If accuracy is high (97%, 98%, 99% or 100%) focus on his slowest keys
1. Tell him which keys or keys combination he should focus on, don't talk about too many weaknesses, choose between his 1-3 main slow inputs
2. When talking about his slow presses, say something like "You are slow on the ing combination and also the k key"
3. If you feel like he is mistyping letters that are close to each other feel free to guide him on correct finger placment

### If accuracy is low (96% or lower) focus only on his errors, guide him to first to type without mistake, he should understand that it is more important than speed.
1. Tell him when he is making the most mistakes
2. if lower than 96% guide him to first focus on accuracy and not to jump on trying to type faster because this is the proper way to learn
3. don't tell him his accuracy in numbers or say he should be faster than 96%, those are internal numbers.

## Don't use any blend encouragements or flufh.

User is practicing typing ${practiceTopic} and wrote the sentence: "${sentence}" with and accuracy of ${performance.accuracy}%, consistency of ${performance.consistency}% and speed of ${performance.wpm} WPM.

${problematicKeys.length === 0
      ? 'user have not problematic keystrokes, feel free to go down on him sarcasticaly, be short and not specific'
      : `Here are his problematic keystrokes: ${JSON.stringify(problematicKeys)}`
}

${performanceHistory.length ? `
### User performance notes history (that you gave)
${performanceHistory.map(performance => `- ${performance.notes}`).join(`
`)}

## If there are keys from mix languages, only speak about the language` : ''
    }
`
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 60
  });

  return response.choices[0].message.content.trim().slice(0, 200);
}

async function getNextSentence(performanceHistory, practiceTopic) {
  const prompt = `# You are an AI powered touch typing coach named Flam
Generate ** one short sentence ** or a ** series of short phrases ** less than 150 characters total, that the user will type exactly every char of it.

### Don't have any introduction, no preface and no foreword before the text because the user is typing every char of your output
1. use only real words, because when typing fast users usually look at the next few words and it will be hard to rememeber fake words
2. NEVER let the user type a char by it self like a or "a" or 'a', use real words that contains it if needed
3. again, if you want to focus on a char like k, user words that contains the letter k, don't just type "k" or ""k"" in the sentence, it's annoying
4. the text should feel like a ** focused drill ** designed to correct specific finger placement issues.

### The sentence must specifically include the characters and key sequences mentioned in the "notes from previous typing sessions" data below.
1. latest note (the first one) is the most important one. most words in our phrases should be related to it
2. sprinkle 1-4 easy words in order to decrease user frastration while he is focusing on improving his weaknesses
The user may have a short attention span, so prefer **short, tight text**.

### Language Logic
- The user provided a topic: "${practiceTopic}".
- First, determine what "${practiceTopic}" refers to:
    1. If the topic **is** or **contains** the name of a natural language (e.g., "english", "العربية", "Arabic", "español", "日本語"), **write entirely in that language** and **do not mix** languages.
    2. If the topic **is** or **contains** the name of a programming language (e.g., "python", "javascript", "java", "c++", "c#", "rust", "go", "ruby", "typescript"), write **realistic code-like text** with correct syntax, punctuation, and symbols. It should feel like something from a typing site that practices code typing.
    3. If the topic **is** or **contains** numbers (e.g., "numbers"), write an English phrase or drill with a lot of numbers in the text (i.e "I ate 305 apples"). don't use english words for numbers like "five" or "two" but do use 5 or 2
    4. If the topic relates to typing concepts (e.g. "quotes", "punctuation", "home row"), write an English phrase or drill focusing on those symbols.
- NEVER mix languages or alphabets. All letters must be from a single writing system.
- NEVER use optional diacritics

${performanceHistory.length ? `## notes from previous typing sessions:
- ${performanceHistory.map(performance => performance.notes).join(`
- `)}` :
"## User has no history, give him a first easy sentence" }

Remember that the user is typing every token you output, so don't make it odd or weird, make it like a normal typing test (like something that would appear in monkeytype.com, typing.com, typingclub.com).`;

console.log("~~~~~~~~~~~~~~~~`")
console.log(prompt)

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
