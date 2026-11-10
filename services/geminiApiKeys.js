export function getGeminiApiKeys() {
  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2]
    .map((key) => key?.trim())
    .filter(Boolean);
  const uniqueKeys = [...new Set(keys)];
  if (uniqueKeys.length === 0) {
    throw new Error('GEMINI_API_KEY or GEMINI_API_KEY_2 is required to use Gemini.');
  }
  return uniqueKeys;
}

export function shouldTryAnotherGeminiKey(error) {
  if (!error || typeof error !== 'object' || !('status' in error)) {
    return true;
  }
  return [400, 401, 403, 429, 500, 503, 504].includes(error.status);
}
