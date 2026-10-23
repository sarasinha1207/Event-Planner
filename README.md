# Celebration Planner

A planning assistant for weddings, birthdays and community events. Describe an event and receive a budget that adds up exactly, a dated timeline, a vendor checklist with booking deadlines and questions to ask, and personalised ideas. An optional AI assistant (Claude) can generate fresh ideas and answer questions about the plan; without it, a built-in planner does the same job.

The project is built with a deliberately small stack: Node.js with no runtime dependencies on the server, and plain HTML, CSS and ES modules in the browser. There is no build step.

## Contents

- [Problem statement alignment](#problem-statement-alignment)
- [Features](#features)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [How it works](#how-it-works)
- [API](#api)
- [Project layout](#project-layout)
- [Testing](#testing)
- [Security](#security)
- [Accessibility](#accessibility)
- [Efficiency](#efficiency)
- [Limitations and next steps](#limitations-and-next-steps)

## Problem statement alignment

The brief asks for a GenAI-powered planning assistant that helps users organise weddings, birthdays and community events with budgets, timelines, vendor checklists and personalised ideas.

| Requirement | Where it is delivered |
| --- | --- |
| Weddings, birthdays, community events | Three event definitions in `src/planner/data`, each with its own budget split, timeline, vendors and ideas |
| Budgets | Category budget that always sums to the total, priority boosts, a protected contingency reserve, and a spending tracker |
| Timelines | Dated task list counted back from the event date, compressed automatically when the event is close |
| Vendor checklists | Per-vendor steps, booking deadlines ordered by lead time, and questions to ask each vendor |
| Personalised ideas | Ideas filtered by guest count and budget tier and ranked by the theme and interests the user typed |
| GenAI | Claude generates ideas and answers questions, using a prompt that treats user text as data; a built-in planner is the fallback |

## Features

- Three event types with separate, sensible defaults.
- Budget allocation using the largest remainder method, so amounts are whole numbers that add up to the total exactly.
- Up to three budget priorities that receive a larger share while the reserve stays fixed.
- Spending tracker with remaining and over-budget indicators.
- Timeline that compresses proportionally when the event is closer than the recommended lead time, and says so.
- Vendor checklist with essential and priority markers, four standard steps per vendor and specific questions to ask.
- Ideas ranked by relevance to the stated theme and interests, with the matching words shown.
- "Ask the planner" box answering budget, timeline, vendor, guest and idea questions.
- Progress saved in the browser (local storage), a plain-text download and a print layout.
- Six currencies and locale-aware formatting.
- Light and dark colour schemes that follow the system setting.

## Quick start

Requirements: Node.js 22 or later. There is nothing to install.

```bash
npm start
```

Open http://127.0.0.1:3000 in a browser.

To run the tests:

```bash
npm test
```

## Configuration

All settings are environment variables and all are optional. See `.env.example`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `HOST` | `127.0.0.1` | Interface to bind. Loopback by default |
| `ANTHROPIC_API_KEY` | empty | Enables AI ideas and AI answers. Without it the built-in planner is used |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Model used for AI features |
| `AI_TIMEOUT_MS` | `20000` | Time limit for each AI request |
| `RATE_LIMIT_MAX` | `120` | API requests per client per minute |
| `AI_RATE_LIMIT_MAX` | `10` | AI requests per client per minute |
| `MAX_BODY_BYTES` | `16384` | Largest accepted request body |

Example with AI enabled (PowerShell):

```powershell
$env:ANTHROPIC_API_KEY = "your-key"
npm start
```

The key is read from the environment only. It is never written to disk, logged or sent to the browser.

## How it works

1. The browser sends the event details to `POST /api/plan`.
2. The server validates every field, then builds the plan with plain functions: budget, timeline, vendors and ideas.
3. The browser renders the plan with safe DOM calls and keeps progress in local storage.
4. If AI is enabled, "Generate ideas with AI" and "Ask the planner" call Claude. Any failure, timeout or malformed answer falls back to the built-in planner, and the interface says which one answered.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details and design decisions.

## API

All endpoints are JSON. Errors have the shape `{ "error": { "message": "...", "errors": [{ "field": "...", "message": "..." }] } }`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness check |
| `GET /api/meta` | Event types, currencies, input limits and whether AI is enabled |
| `POST /api/plan` | Body `{ "event": {...}, "today": "YYYY-MM-DD" }`. Returns `{ "plan": {...} }` |
| `POST /api/ideas` | Same body. Returns `{ "ideas": { "source": "ai" or "builtin", "items": [...] } }` |
| `POST /api/ask` | Same body plus `"question"`. Returns `{ "source": "ai" or "builtin", "answer": "..." }` |

Event fields: `eventType` (`wedding`, `birthday`, `community`), `eventName`, `eventDate`, `guestCount`, `totalBudget`, `currency`, and optional `location`, `theme`, `interests` and `priorities`.

## Project layout

```
server.js                 Entry point: reads config, wires dependencies, starts listening
src/
  app.js                  HTTP server: routing, rate limits, errors, logging
  config.js               Environment settings with validation
  logger.js               Structured JSON logging
  http/                   Body parsing, router, rate limiter, static files, security headers
  routes/api.js           API endpoints
  planner/                Pure planning logic and event data
  ai/                     Claude client, prompts, cache and the AI/built-in service
public/
  index.html              Page structure
  css/styles.css          Styles with light, dark, print and forced-colour support
  js/                     ES modules: API client, store, progress, formatting, views
tests/                    Unit, integration, accessibility and hygiene tests
docs/                     Architecture, security, accessibility and testing notes
```

## Testing

The suite uses the built-in Node.js test runner and has no dependencies.

```bash
npm test          # run all tests
npm run coverage  # run with a coverage report and a 90 percent line threshold
```

Tests cover the planner, validation, the HTTP server end to end, the AI client and its fallbacks, client logic and views, accessibility rules, colour contrast and project hygiene. See [docs/TESTING.md](docs/TESTING.md).

## Security

Input is validated on the server, output is rendered as text, the content security policy forbids inline code and third-party origins, the API is rate limited, request bodies are size limited, and prompts treat user text as data. See [docs/SECURITY.md](docs/SECURITY.md).

## Accessibility

The interface targets WCAG 2.1 AA: semantic landmarks, labelled controls, a linked error summary, keyboard-operable tabs that follow the ARIA pattern, visible focus, contrast checked by tests, reduced-motion and forced-colour support, and no information conveyed by colour alone. See [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).

## Efficiency

- No runtime dependencies and no client build step.
- Static files are read once at startup, compressed once, and served with ETags so repeat visits cost a 304.
- Plan generation is a few hundred operations and runs in well under a millisecond.
- Identical AI idea requests are served from a small time-limited cache, and AI calls have a strict timeout and a lower rate limit.
- The browser updates only the parts of the page that change when a box is ticked or an amount is typed.

## Limitations and next steps

- Budget shares and timelines are planning guidance, not quotes. Real prices vary by city and season.
- Plans live in one browser. Sharing or syncing between devices would need accounts and a database.
- Rate limiting is per process and keyed on the connection address; behind a reverse proxy, apply limits there as well.
- Run behind HTTPS in production and add a `Strict-Transport-Security` header at the proxy.

## Licence

MIT. See [LICENSE](LICENSE).
