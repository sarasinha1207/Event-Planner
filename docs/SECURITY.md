# Security

## Data handled

The application stores nothing on the server. Event details are sent to the server to build a plan and are not logged or persisted. The plan and progress are kept in the user's own browser. If AI is enabled, a short description of the event and the user's question are sent to the Anthropic API.

## Controls

| Area | Control | Where |
| --- | --- | --- |
| Input validation | Every field is checked for type, range and length. Unknown fields are dropped. Control characters and bidirectional overrides are removed | `src/planner/validate.js` |
| Output encoding | The client builds the page with `textContent` and text nodes only. No `innerHTML`, `eval` or `document.write` (enforced by a test) | `public/js/dom.js` |
| Content security policy | `default-src 'none'`; scripts, styles, images and connections limited to the same origin; no inline code; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'none'` | `src/http/security.js` |
| Other headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, cross-origin isolation headers | `src/http/security.js` |
| Request limits | JSON content type required, body size limited (16 KiB by default), URL length limited, header and request timeouts set | `src/http/body.js`, `src/app.js` |
| Rate limiting | 120 API requests per minute per client, and 10 AI requests per minute | `src/http/rateLimiter.js` |
| Static files | Served from an in-memory table built at startup, so a request path can never reach a file outside `public/`. Only known file types are loaded | `src/http/staticFiles.js` |
| Error handling | Unexpected errors return a generic message. Details are logged without request content | `src/app.js` |
| Secrets | The API key is read only from the environment, held in a closure, never logged, never sent to the browser, and never appears in error messages | `src/config.js`, `src/ai/anthropicClient.js` |
| Prompt injection | User text is stripped of angle brackets and placed inside tagged data blocks. The system prompt marks those blocks as untrusted. Model output is parsed, length limited and rendered as text, so a manipulated answer cannot run code | `src/ai/prompts.js` |
| Denial of wallet | AI calls have a timeout, a lower rate limit and a cache for repeated requests | `src/ai/assistantService.js` |
| Local storage tampering | Saved data is validated against the expected shape on load and discarded if it does not match | `public/js/store.js` |
| Dependencies | None at runtime or for development | `package.json` |
| Network exposure | Binds to `127.0.0.1` unless `HOST` is set | `src/config.js` |

## Verification

Security behaviour is covered by automated tests: path traversal attempts, malformed and oversized requests, wrong content types and methods, rate limiting, header presence, error message hygiene, secrets staying out of logs and errors, prompt delimiter escape attempts, hostile text in AI output, and a repository scan for credentials and unsafe DOM calls. See `tests/server.test.js`, `tests/ai/*` and `tests/quality/hygiene.test.js`.

## Deployment guidance

- Serve over HTTPS and add `Strict-Transport-Security` at the reverse proxy.
- The built-in rate limiter keys on the connection address. Behind a proxy every request appears to come from the proxy, so also rate limit at the proxy.
- Keep `ANTHROPIC_API_KEY` in a secret manager or the host's environment settings, never in the repository. `.env` files are ignored by git.
- Set a spending limit on the API key.

## Reporting a vulnerability

Open a private security advisory on the repository or contact the maintainers directly. Please do not publish details before a fix is available.
