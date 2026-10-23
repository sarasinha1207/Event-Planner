# Celebration Planner

![Celebration Planner logo](public/logo.svg)

A planning assistant for weddings, birthdays and community events. Describe an event and receive a budget that adds up exactly, a dated timeline, a vendor checklist with booking deadlines and questions to ask, and personalised ideas. An optional AI assistant powered by Google Gemini can generate fresh ideas and answer questions, and a floating chat assistant on every page can answer planning questions. Without a key, a built-in planner does the same job. Gemini is the only AI used in the project.

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
| GenAI | Gemini generates ideas and answers questions and powers the floating chat assistant, using prompts that treat user text as data. If a model runs out of quota the next one is used automatically, and a built-in planner is the final fallback |

## Features

- Three event types with separate, sensible defaults.
- Budget allocation using the largest remainder method, so amounts are whole numbers that add up to the total exactly.
- Up to three budget priorities that receive a larger share while the reserve stays fixed.
- Spending tracker with remaining and over-budget indicators.
- Timeline that compresses proportionally when the event is closer than the recommended lead time, and says so.
- Vendor checklist with essential and priority markers, four standard steps per vendor and specific questions to ask.
- Ideas ranked by relevance to the stated theme and interests, with the matching words shown.
- "Ask the planner" box answering budget, timeline, vendor, guest and idea questions.
- A floating chat assistant on every page. It remembers the conversation for the tab, knows about your saved plan, and keeps working when a Gemini model is exhausted by switching to the next model.
- Progress saved in the browser (local storage).
- A print sheet and a text download that contain the same information: the event details and progress as points, the budget as a table, and checklists (with what you have already done ticked) for timeline tasks, each vendor's steps and questions to ask, and ideas, with room for notes. Use Save as PDF in the print window to keep a PDF.
- Six currencies and locale-aware formatting.
- A vivid indigo, magenta and coral design with a gradient hero, animated entrance effects, hover and press feedback, animated budget bars and a short confetti burst when a plan is created. Light and dark schemes follow the system setting.
- Line icons drawn from one small set (`public/js/icons.js`), always decorative and paired with text.
- All motion is decorative and is switched off for visitors who prefer reduced motion.

## Quick start

Requirements: Node.js 22 or later. There is nothing to install.

```bash
npm start
```

Open http://127.0.0.1:3000 in a browser. The site has two pages that share one header and footer: Home (http://127.0.0.1:3000/) and Plan an event (/plan.html).

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
| `GEMINI_API_KEY` | empty | Enables Gemini ideas, answers and the chat assistant. Without it the built-in planner is used |
| `GEMINI_MODELS` | `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-2.5-pro` | Comma separated models, tried in order. When one is out of quota, overloaded or retired, the next is used |
| `AI_TIMEOUT_MS` | `20000` | Time limit for each AI request |
| `RATE_LIMIT_MAX` | `120` | API requests per client per minute |
| `AI_RATE_LIMIT_MAX` | `20` | AI requests per client per minute |
| `MAX_BODY_BYTES` | `32768` | Largest accepted request body |

### Adding your Gemini API key

Create a key at https://aistudio.google.com/apikey, then copy `.env.example` to `.env` in the project folder and set the key:

```
GEMINI_API_KEY=your-key-here
```

Restart the server (`npm run dev` restarts it for you when files change). The `.env` file is read at startup and is ignored by git. You can also set `GEMINI_API_KEY` as an ordinary environment variable, which takes priority over the file. The chat window shows "Powered by Gemini" when the key is working and "Basic mode" when it is not.

The key is only ever used by the server. It is never logged, put in a URL or sent to the browser.

## How it works

1. The browser sends the event details to `POST /api/plan`.
2. The server validates every field, then builds the plan with plain functions: budget, timeline, vendors and ideas.
3. The browser renders the plan with safe DOM calls and keeps progress in local storage.
4. If a Gemini key is set, "Generate ideas with AI", "Ask the planner" and the floating chat call Gemini. Models are tried in the configured order; one that is out of quota (429), overloaded (5xx), retired (404), slow or silent is set aside for a short time and the next model answers. If no model can answer, or an answer is unusable, the built-in planner responds. The interface always says which one answered, and for Gemini which model.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for details and design decisions.

## API

All endpoints are JSON. Errors have the shape `{ "error": { "message": "...", "errors": [{ "field": "...", "message": "..." }] } }`.

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness check |
| `GET /api/meta` | Event types, currencies, input limits and whether AI is enabled |
| `POST /api/plan` | Body `{ "event": {...}, "today": "YYYY-MM-DD" }`. Returns `{ "plan": {...} }` |
| `POST /api/ideas` | Same body. Returns `{ "ideas": { "source": "ai" or "builtin", "items": [...] } }` |
| `POST /api/ask` | Same body plus `"question"`. Returns `{ "source": "ai" or "builtin", "model": "...", "answer": "..." }` |
| `POST /api/chat` | Body `{ "message": "...", "history": [{ "role": "user" or "model", "text": "..." }], "event": {...}, "today": "..." }`. `history` and `event` are optional. Same response as `/api/ask` |

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
  ai/                     Gemini client with model failover, prompts, cache and the AI/built-in service
public/
  index.html              Home page: hero, about, how it works, features, FAQ
  plan.html               Plan an event page: the three planning steps, form and results
  logo.svg, logo-mark.svg Logo (full lockup and mark only); favicon.svg is the mark
  css/chatbot.css         Styles for the floating chat assistant
  css/styles.css          Shared styles with light, dark, print and forced-colour support
  css/home.css            Styles used only by the home page
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

Tests cover the planner, validation, the HTTP server end to end, the Gemini client, its model failover and the built-in fallbacks, client logic and views, accessibility rules, colour contrast and project hygiene. See [docs/TESTING.md](docs/TESTING.md).

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
