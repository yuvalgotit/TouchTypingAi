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

    const userPerformanceTxt = await digestUserInputToShortText(sentence, keystrokes)
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
async function digestUserInputToShortText(sentence, keystrokes) {
  const prompt = `
You are an AI powered touch typing coach. In a brief (less than 40 words) no bullshit, ruthless third-person sentence, what are the user weaknesses, be specific about which keys and keys sequences are you talking about

${generatePromptInput(sentence, keystrokes)}
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
You are an AI powered touch typing coach. Generate **one sentence under 200 characters** that the user will type exactly every char of it.
- Don't have any introduction, no preface and no foreword before the text because the user is typing every char of your output
- Sentence should incorporate words that contains user weaknesses mentioned in the user performance below
- Add randomness while sticking to real words.
- Don't use emojis and don't use the symbol -
${userFocus ? `- User want to practice on typing ${userFocus.substring(0, 30)}, make the text around that while also focusing on his weaknesses` : ''}

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

function generatePromptInput(sentence, keystrokes) {
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