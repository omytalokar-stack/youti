import { GoogleGenAI } from '@google/genai';

const MODEL = 'gemini-3.8-flash';
const FALLBACK_MODEL = 'gemini-3.1-flash-lite';
const MODELS = [MODEL, FALLBACK_MODEL];

const META_INSTRUCTION_LINE = /^\s*(?:(?:system|voiceover|narration|script|tts)\s+)?(?:instructions?\s*:|(?:do not|don't)\s+(?:translate|add|omit|read|repeat|say|include)\b|read\s+(?:this|the following)\b|say\s+exactly\b|return\s+only\b)/i;
const SCRIPT_LABEL = /^\s*(?:system instructions?|hook|narration|voiceover|voice-over|script|spoken text|dialogue|tts|output)\s*:\s*/i;

export function sanitizeSpokenText(text) {
  if (typeof text !== 'string') {
    return '';
  }

  let unbracketedText = text;
  while (true) {
    const nextText = unbracketedText.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/gs, ' ');
    if (nextText === unbracketedText) {
      break;
    }
    unbracketedText = nextText;
  }

  const sanitized = unbracketedText.split(/\r?\n/)
    .map((line) => line
      .replace(/[\[\](){}]/g, ' ')
      .replace(/["“”‘’«»]/g, '')
      .replace(/(^|[\s([{])'|'(?=$|[\s,.;!?।)}\]])/g, '$1')
      .replace(/\bdo not translate,\s*add,\s*or omit words\b[.!?]?/gi, ' ')
      .replace(SCRIPT_LABEL, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((line) => !META_INSTRUCTION_LINE.test(line))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.;!?।])/g, '$1')
    .trim();

  return sanitized;
}

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is required to use Gemini.');
  }
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      timeout: 10000,
      retryOptions: { attempts: 1 },
    },
  });
}

async function generateContent(contents, config) {
  const client = getGeminiClient();
  for (const [index, model] of MODELS.entries()) {
    try {
      const response = await client.models.generateContent({ model, contents, config });
      return { model, response };
    } catch (error) {
      const status = error && typeof error === 'object' && 'status' in error
        ? error.status
        : undefined;
      if ((status === 429 || status === 503 || status === 504) && index < MODELS.length - 1) {
        console.warn(`Gemini model ${model} is busy; retrying with ${MODELS[index + 1]}.`);
        continue;
      }
      if (status === 429 || status === 503 || status === 504) {
        const message = status === 429
          ? 'Gemini request limit reached. Check the API quota or try again later.'
          : 'Gemini is temporarily unavailable due to high demand. Please try again shortly.';
        throw Object.assign(new Error(message, { cause: error }), {
          statusCode: status,
          publicMessage: message,
        });
      }
      throw error;
    }
  }
  throw new Error('Gemini generation failed without a provider response.');
}

export async function generateAutomatedShort(channelMemory, channelContext = {}) {
  const mistakes = channelMemory.selfCorrectionMode
    ? (channelMemory.mistakeLogs ?? []).slice(-5)
    : [];
  const tactics = channelMemory.provenTactics ?? [];
  const systemInstruction = [
    'You are Dimag AI, a YouTube Shorts writing assistant.',
    'Create an original short-form video concept and return only valid JSON with exactly these fields:',
    '{"hook":"string","script":"string","title":"string","description":"string","tags":["string"],"subtitleBeats":[{"start":0,"end":2,"text":"spoken phrase","highlightedWord":"word"}]}.',
    'Choose one specific topic yourself from the channel niche and context; do not ask the user for a topic. Prefer reliable, well-established facts and avoid precise claims you cannot support.',
    'Write only natural spoken Hindi or Hinglish in script and subtitleBeats. Never include labels, quotation marks, stage directions, bracketed text, or instructions in spoken text. Limit the script to 22 words and target 12-15 seconds of speech so it stays safely under the 20-second limit.',
    'Split the exact spoken script into sequential subtitleBeats. Timestamps are seconds from the start, each beat is 1-4 seconds, and text must match the spoken script. Highlight one important word per beat.',
    `CHANNEL CONTEXT:\nChannel title: ${channelContext.title || 'Not provided'}\nChannel description: ${(channelContext.description || 'Not provided').slice(0, 2000)}\nCreate content relevant to this channel. Do not invent facts about the channel.`,
    'Do not invent performance data or claim that a concept is guaranteed to succeed.',
    'PROVEN TACTICS (use as guidance):',
    tactics.length
      ? tactics.map(({ title, impact, description }) => `- ${title} (${impact}): ${description}`).join('\n')
      : '- No proven tactics have been recorded.',
    'NEGATIVE CONSTRAINTS:',
    mistakes.length
      ? mistakes.map(({ issue, ruleUpdated, retentionDropAt }) =>
          `- DO NOT REPEAT: ${issue}. Rule: ${ruleUpdated}${retentionDropAt ? ` (retention drop: ${retentionDropAt})` : ''}`,
        ).join('\n')
      : '- No prior mistakes have been recorded.',
  ].join('\n\n');

  const { response } = await generateContent(
    'Generate one engaging, original YouTube Short using the channel memory and constraints above.',
    {
      systemInstruction,
      responseMimeType: 'application/json',
    },
  );
  if (!response.text) {
    throw new Error('Gemini returned an empty response.');
  }

  let generated;
  try {
    generated = JSON.parse(response.text);
  } catch (error) {
    throw new Error('Gemini returned invalid JSON.', { cause: error });
  }

  const requiredStrings = ['hook', 'script', 'title', 'description'];
  const script = sanitizeSpokenText(generated?.script);
  const subtitleBeats = Array.isArray(generated?.subtitleBeats)
    ? generated.subtitleBeats.map((beat) => ({
        ...beat,
        text: sanitizeSpokenText(beat?.text),
        highlightedWord: sanitizeSpokenText(beat?.highlightedWord),
      }))
    : generated?.subtitleBeats;
  if (
    !generated ||
    typeof generated !== 'object' ||
    requiredStrings.some((field) => typeof generated[field] !== 'string') ||
    !script ||
    !Array.isArray(generated.tags) ||
    generated.tags.some((tag) => typeof tag !== 'string') ||
    !Array.isArray(subtitleBeats) ||
    subtitleBeats.length === 0 ||
    subtitleBeats.some((beat) =>
      !beat ||
      typeof beat.start !== 'number' ||
      typeof beat.end !== 'number' ||
      beat.start < 0 ||
      beat.end <= beat.start ||
      beat.end > 20 ||
      typeof beat.text !== 'string' ||
      !beat.text.trim() ||
      typeof beat.highlightedWord !== 'string' ||
      !beat.highlightedWord.trim(),
    )
  ) {
    throw new Error('Gemini response did not match the required video format.');
  }

  return {
    hook: generated.hook,
    script,
    title: generated.title,
    description: generated.description,
    tags: generated.tags,
    subtitleBeats,
  };
}

export async function generateChatResponse(prompt) {
  const { model, response } = await generateContent(prompt, {
    systemInstruction: 'You are Dimag AI, a helpful YouTube creator assistant. Be clear about uncertainty and never invent channel analytics.',
  });
  if (!response.text) {
    throw new Error('Gemini returned an empty response.');
  }
  return {
    response: response.text,
    model: model === MODEL ? 'Gemini 3.8 Flash' : 'Gemini 3.1 Flash-Lite',
  };
}
