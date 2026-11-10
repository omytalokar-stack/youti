const RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 408, 429, 500, 503, 504]);
const RETRYABLE_CODES = new Set([
  'INVALID_ARGUMENT',
  'DEADLINE_EXCEEDED',
  'INTERNAL',
  'NOT_FOUND',
  'RESOURCE_EXHAUSTED',
  'UNAVAILABLE',
]);
const KEY_FAILURE_STATUSES = new Set([401, 403, 429]);
const MAX_RETRIES = 3;
let nextKeyIndex = 0;

export function getGeminiApiKeys() {
  const keys = [
    ...(process.env.GEMINI_API_KEYS ?? '').split(','),
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
  ]
    .map((key) => key?.trim())
    .filter(Boolean);
  const uniqueKeys = [...new Set(keys)];
  if (uniqueKeys.length === 0) {
    throw new Error('Set GEMINI_API_KEY, GEMINI_API_KEY_2, or GEMINI_API_KEYS in the backend environment.');
  }
  return uniqueKeys;
}

function getErrorCode(error) {
  if (!error || typeof error !== 'object') return '';
  const rawCode = error.code ?? error.status ?? '';
  if (typeof rawCode === 'number') {
    return new Map([
      [4, 'DEADLINE_EXCEEDED'],
      [8, 'RESOURCE_EXHAUSTED'],
      [13, 'INTERNAL'],
      [14, 'UNAVAILABLE'],
    ]).get(rawCode) ?? String(rawCode);
  }
  return String(rawCode).toUpperCase();
}

function getErrorStatus(error) {
  if (!error || typeof error !== 'object') return null;
  const status = Number(error.status ?? error.statusCode);
  return Number.isInteger(status) ? status : null;
}

function getErrorMessage(error) {
  return error && typeof error === 'object' && typeof error.message === 'string'
    ? error.message.toUpperCase()
    : '';
}

export function getGeminiErrorStatus(error) {
  const status = getErrorStatus(error);
  if (status !== null) return status;
  switch (getErrorCode(error)) {
    case 'DEADLINE_EXCEEDED':
      return 504;
    case 'RESOURCE_EXHAUSTED':
      return 429;
    case 'UNAVAILABLE':
      return 503;
    default:
      return null;
  }
}

export function isRetryableGeminiError(error) {
  const code = getErrorCode(error);
  const status = getGeminiErrorStatus(error);
  const message = getErrorMessage(error);
  return (status !== null && RETRYABLE_STATUSES.has(status))
    || RETRYABLE_CODES.has(code)
    || /DEADLINE_EXCEEDED|RESOURCE_EXHAUSTED|UNAVAILABLE/.test(message);
}

export function shouldTryAnotherGeminiKey(error) {
  return isRetryableGeminiError(error);
}

function shouldRotateKeyFirst(error) {
  const code = getErrorCode(error);
  const status = getErrorStatus(error);
  return KEY_FAILURE_STATUSES.has(status)
    || code === 'RESOURCE_EXHAUSTED'
    || /RESOURCE_EXHAUSTED/.test(getErrorMessage(error));
}

function attemptKey(attempt) {
  return `${attempt.keyIndex}:${attempt.modelIndex}`;
}

function findNextAttempt(current, attempted, keys, models, axis) {
  const axisLength = axis === 'key' ? keys.length : models.length;
  for (let offset = 1; offset < axisLength; offset += 1) {
    const candidate = axis === 'key'
      ? { keyIndex: (current.keyIndex + offset) % keys.length, modelIndex: current.modelIndex }
      : { keyIndex: current.keyIndex, modelIndex: current.modelIndex + offset };
    if (!attempted.has(attemptKey(candidate))) return candidate;
  }
  return null;
}

export async function runGeminiWithFallback({
  models,
  invoke,
  apiKeys = getGeminiApiKeys(),
  maxRetries = MAX_RETRIES,
}) {
  if (!Array.isArray(models) || models.length === 0 || models.some((model) => !model)) {
    throw new Error('At least one Gemini model must be configured.');
  }
  if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
    throw new Error('At least one Gemini API key must be configured.');
  }
  if (typeof invoke !== 'function') {
    throw new Error('A Gemini request function is required.');
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > MAX_RETRIES) {
    throw new Error(`Gemini fallback allows between 0 and ${MAX_RETRIES} retries.`);
  }

  const startKeyIndex = nextKeyIndex % apiKeys.length;
  nextKeyIndex = (startKeyIndex + 1) % apiKeys.length;
  let current = { keyIndex: startKeyIndex, modelIndex: 0 };
  const attempted = new Set();
  let lastError;

  for (let attemptNumber = 0; attemptNumber <= maxRetries; attemptNumber += 1) {
    attempted.add(attemptKey(current));
    const model = models[current.modelIndex];
    try {
      return {
        model,
        keyIndex: current.keyIndex,
        value: await invoke({ apiKey: apiKeys[current.keyIndex], keyIndex: current.keyIndex, model }),
      };
    } catch (error) {
      lastError = error;
      if (!isRetryableGeminiError(error) || attemptNumber === maxRetries) {
        throw error;
      }

      const preferredAxis = shouldRotateKeyFirst(error) ? 'key' : 'model';
      console.warn(
        `[gemini] Key ${current.keyIndex + 1}, model ${model} failed${getErrorStatus(error) ? ` (${getErrorStatus(error)})` : ''}; trying a bounded fallback.`,
      );
      current = findNextAttempt(current, attempted, apiKeys, models, preferredAxis)
        ?? findNextAttempt(current, attempted, apiKeys, models, preferredAxis === 'key' ? 'model' : 'key');
      if (!current) throw error;
    }
  }

  throw lastError ?? new Error('Gemini request failed without a provider response.');
}
