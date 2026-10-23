const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';

export class AiUnavailableError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'AiUnavailableError';
  }
}

// Thin client for the Anthropic Messages API. The key is held in this closure
// and is never logged or included in error messages.
export function createAnthropicClient({ apiKey, model, timeoutMs, fetchImpl = fetch }) {
  const enabled = typeof apiKey === 'string' && apiKey.length > 0;

  async function complete({ system, prompt, maxTokens }) {
    if (!enabled) throw new AiUnavailableError('AI service is not configured.');

    let response;
    try {
      response = await fetchImpl(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new AiUnavailableError('AI service could not be reached.', { cause: error });
    }

    if (!response.ok) throw new AiUnavailableError(`AI service returned status ${response.status}.`);

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new AiUnavailableError('AI service returned an unreadable response.', { cause: error });
    }

    const text = Array.isArray(payload?.content)
      ? payload.content
          .filter((block) => block?.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('')
          .trim()
      : '';
    if (!text) throw new AiUnavailableError('AI service returned an empty response.');
    return text;
  }

  return { enabled, complete };
}
