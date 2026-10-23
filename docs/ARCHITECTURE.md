# Architecture

## Goals

1. Keep the technology simple enough that any developer can read the whole project in an hour.
2. Keep planning logic pure and testable, separate from HTTP and from the AI.
3. Make the product useful without AI, and better with it.

## Overview

```
Browser (ES modules)                          Node.js server (no dependencies)
--------------------                          --------------------------------
index.html + main.js  --- JSON over HTTP --->  app.js: security headers, rate limits, routing
  formView, resultsView                           routes/api.js: validate, then call
  views/ (budget, timeline, ...)                    planner/   pure plan builders and event data
  store.js (local storage)                          ai/        Claude client, prompts, cache, fallback
  progress.js, format.js, api.js                  http/staticFiles.js: serves public/ from memory
```

## Server

| Module | Responsibility |
| --- | --- |
| `server.js` | Composition root: loads config, creates the AI client, starts the server, handles shutdown signals |
| `src/app.js` | Builds the HTTP server. Applies security headers, parses the URL, enforces rate limits, reads JSON bodies, converts errors to responses |
| `src/routes/api.js` | Declares the endpoints as `{ method, path, limit, handler }` records. Handlers are plain async functions |
| `src/http/*` | Small single-purpose modules: body reader, router, rate limiter, static files, security headers, error type |
| `src/planner/*` | The product logic. Everything here is a pure function of its inputs |
| `src/ai/*` | Everything that talks to a model |

Dependencies are passed in (`createApp({ config, aiClient, logger, now })`) rather than imported globally, so tests substitute a fake AI client, a silent logger and a controllable clock.

## Planner

`planFromRequest(raw, today)` validates, then `buildPlan(input, today)` assembles:

- **Budget** (`budget.js`). The contingency reserve is a fixed share. The rest is divided across categories in proportion to their weights, with prioritised categories boosted by 1.4. Division uses the largest remainder method, which guarantees integer amounts that sum to the total exactly.
- **Timeline** (`timeline.js`). Every task is defined as "N days before the event". A date scaler turns that into a date. When the event is closer than the template span, earlier tasks are scaled proportionally and clamped between today and the event, keeping their order. Post-event tasks are unaffected. The plan reports `compressed` so the interface can explain what happened.
- **Vendors** (`vendors.js`). Each vendor links to a budget line, so the vendor list shows its allocated amount. Booking deadlines use the same date scaler as the timeline, so the two never disagree. Vendors are ordered by lead time.
- **Ideas** (`ideas.js`). Each idea carries tags and optional limits (guest count, budget tier). Eligible ideas are ranked by how many tags match the user's theme and interests, then the list is completed with one idea per category in turn so it stays varied.
- **Validation** (`validate.js`). Only known fields are copied into the validated object. Text is cleaned of control and bidirectional override characters. Every failure is reported at once with a field name.

Dates are `YYYY-MM-DD` strings handled in UTC, so results do not depend on server time zone. The browser sends its own calendar date so "today" matches the user's, and the server accepts it only when it is within one day of the server date.

Event content lives in `src/planner/data/*.js` as plain objects. A test checks their integrity: percentages total 100, ids are unique, vendors map to budget lines, and so on. Adding a fourth event type means adding one data file and registering it in `eventTypes.js`.

## AI

- `anthropicClient.js` wraps the Messages API with a timeout and converts every failure into one error type. The key lives in a closure.
- `prompts.js` builds prompts. User text is stripped of angle brackets and placed inside tagged blocks that the system prompt marks as untrusted data. Model output is parsed defensively: only well-formed items are kept, lengths are capped, and the client renders everything as text.
- `assistantService.js` combines the client and the planner. Each method always returns a usable result and a `source` field (`ai` or `builtin`). Only successful AI idea results are cached, for ten minutes.

## Browser

- `main.js` handles startup, the form and persistence. `resultsView.js` assembles the results. `views/*` each build one section and own their updates.
- `dom.js` provides `h()`, an element builder that attaches text as text nodes. There is no `innerHTML` anywhere (a test enforces this).
- `progress.js` holds pure functions for completed tasks, vendor steps and spending. `store.js` validates everything it reads back, because local storage can hold anything.
- Views update the part of the page that changed. Ticking a task changes one status label and the summary figures, not the whole list.

## Key decisions

| Decision | Reason |
| --- | --- |
| No framework, no bundler | Fewer moving parts, nothing to audit, instant start |
| No runtime dependencies | No supply chain risk, no vulnerability updates to track |
| Server rebuilds the plan on every AI call | The client is never trusted to supply plan data |
| Plans stored in the browser | No accounts, no personal data on the server |
| AI is optional and always has a fallback | The product works offline from the AI and the user is told which source answered |
| Strict content security policy | Defence in depth if markup ever reached the page |
