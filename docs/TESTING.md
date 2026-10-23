# Testing

## Running

```bash
npm test          # all tests
npm run coverage  # tests plus a coverage report; fails below 90 percent line coverage
```

The suite uses `node:test` and `node:assert`, so nothing needs to be installed. A full run takes a few seconds.

## What is covered

| Area | Files | What is checked |
| --- | --- | --- |
| Planner logic | `tests/planner/*` | Date arithmetic; every validation rule and edge case; budget totals for all event types at many sizes; priority behaviour; timeline compression, ordering and bounds; idea selection, eligibility and ranking; integrity of the event data; local question answering |
| AI | `tests/ai/*` | Gemini request shape and key placement; model failover for quota, overload, retired, forbidden, network, empty and unreadable responses; cooldowns, recovery and `Retry-After`; the overall time budget; rejected keys; fallbacks; caching; prompt delimiting and injection attempts; defensive parsing of model output; chat history handling |
| HTTP units | `tests/http/units.test.js` | Rate limiter windows; body reader limits and content types; router 404 and 405; security headers; configuration parsing; logging |
| Server, end to end | `tests/server.test.js` | The real server on a random port: every endpoint, validation errors, content type, malformed and oversized bodies, rate limiting, path traversal attempts, compression, ETags, error hygiene and log content |
| Client logic | `tests/client/core.test.js` | Formatting; progress calculations; saved-data validation and recovery from corrupt storage; API client behaviour; text export |
| Client views | `tests/client/views.test.js`, `tests/client/form.test.js` | Tabs keyboard behaviour; budget, timeline, vendor, idea and question views; form reading, writing and error display; results assembly; safe rendering of hostile text |
| Chat assistant | `tests/client/chatbot.test.js` | Launcher and dialog attributes, opening, closing and Escape, focus handling, sending with history and the saved plan, typing indicator, error handling, persistence for the tab, new chat, safe rendering of replies, and the chat API call |
| Accessibility | `tests/quality/accessibility.test.js` | Page structure, labels, ids, headings, error handling hooks, stylesheet rules |
| Contrast | `tests/quality/contrast.test.js` | WCAG contrast ratios for every colour pairing in both themes |
| Hygiene | `tests/quality/hygiene.test.js` | No emoji, plain ASCII documents, required documents exist, no unsafe DOM calls, no inline code, no credentials, no console logging, file size limit |

## Approach

- Planner functions are pure, so tests call them directly with a fixed "today" and need no mocks.
- The server tests start the real application and use `fetch`, so routing, headers, limits and error handling are exercised together.
- The AI is replaced with small fakes that return, fail or return garbage on demand. No test calls the network.
- Views are tested against a tiny fake DOM (`tests/helpers/fakeDom.js`) that supports only what the views use. This keeps the suite dependency-free while still checking structure, attributes, events and text.
- Property-style loops check invariants (budget totals, date bounds and ordering) across many inputs rather than a few hand-picked ones.

## Not covered by automated tests

`public/js/main.js` is the startup script that connects the page to the modules above. It contains no logic of its own beyond wiring and is excluded from the coverage figure. It was exercised manually in a browser. Real-browser behaviours such as native `dialog` focus trapping, printing and screen reader output are checked manually; see the checklist in [ACCESSIBILITY.md](ACCESSIBILITY.md).

## Adding tests

Put new files under `tests/` ending in `.test.js`. Use `tests/helpers/fixtures.js` for valid events and plans, `tests/helpers/server.js` to start the application, and `tests/helpers/fakeDom.js` for view tests.
