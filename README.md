# Chalie Interface Template

Build interfaces that extend Chalie's capabilities. An interface is a self-contained daemon that pairs with a Chalie instance, exposes tools the LLM can invoke, pushes signals and messages via the gateway, and optionally renders a full-screen UI in the dashboard launcher.

## Quick Start

1. **Fork or copy this repo**
2. **Edit `daemon.ts`** — fill in the six sections marked with numbered comments
3. **Test locally**: `deno task dev`
4. **Release**: push a version tag → GitHub Actions compiles four platform binaries automatically

That's it. No build pipeline to configure. No dependencies to install. No runtime required on the user's machine.

---

## What You Implement

Open `daemon.ts`. There are six sections to fill in:

| # | Section | What it is |
|---|---------|------------|
| ① | `ID`, `NAME`, `VERSION`, `DESCRIPTION`, `AUTHOR` | Interface identity |
| ② | `SCOPES` | What data your interface needs from the user |
| ③ | `CAPABILITIES` | Tools Chalie's LLM can invoke |
| ④ | `POLLS` | Background jobs (cron/scheduler style) |
| ⑤ | `executeCommand()` | Handle each capability invocation |
| ⑥ | `renderInterface()` | Return HTML for the full-screen app |

Everything else — HTTP server, port management, health checks, capability registration, gateway communication — is handled by the framework.

---

## Architecture

```
Your daemon                  Dashboard (gateway)           Chalie backend
(managed port)               (localhost:3000)               (internal)

GET /health      ←── health check every 30s ─────────────→ monitors status
GET /capabilities←── reads tools ────────────────────────→ registers in ACT loop
GET /meta        ←── reads scopes ───────────────────────→ stores permissions
GET /            ←── user opens launcher icon ───────────→ serves your UI
POST /execute    ←── tool invocation from reasoning loop

POST gateway ────→   validates scope ────────────────────→ POST /api/signals
     /signals        enforces user permission              (world state)

POST gateway ────→   validates scope ────────────────────→ POST /api/messages
     /messages       checks user permission                (reasoning loop)

GET gateway  ────→   filters by approved scopes ─────────→ GET /api/context
    /context         strips denied fields                  (user context)
```

Your daemon never sees Chalie's host, port, or credentials. The dashboard is the gateway and firewall. You receive exactly one thing at startup: a `--gateway` URL.

---

## The Four Methods

Your code calls these to communicate with Chalie:

### `sendSignal(type, content, energy?, metadata?)`

Push passive background knowledge to Chalie's world state. Zero LLM cost. Use for periodic updates, status snapshots, or anything Chalie should be aware of but doesn't need to act on immediately.

```ts
await sendSignal("forecast_update", "London: 22°C, partly cloudy.", 0.4);
```

### `sendMessage(text, topic?, metadata?)`

Push a message to Chalie's reasoning loop. Costs LLM tokens. Use only for genuinely urgent or actionable information. Check the user's attention state first — don't interrupt focused work.

```ts
const ctx = await getContext();
if (ctx.attention !== "focused") {
  await sendMessage("Storm warning: heavy rain from 6pm tonight.", "weather_alert");
}
```

### `getContext()`

Get the user's current context (location, timezone, device, energy, attention) filtered by the scopes they approved. Missing fields were denied — handle their absence gracefully.

```ts
const ctx = await getContext();
const city = ctx.location?.name ?? "an unknown location";
```

### `renderInterface(config)`

Return HTML for the full-screen app shown when the user opens your interface from the launcher. The `config` object gives you `gateway` and `daemonHost` URLs to fetch data from.

```ts
function renderInterface(config) {
  return `<html>...</html>`;
}
```

---

## Polls (Background Scheduler)

Declare background jobs in the `POLLS` array. Each job runs on its own interval. Use the helpers for readability:

```ts
const POLLS: Poll[] = [
  {
    name: "hourly-weather",
    every: hours(1),
    async run() {
      const forecast = await fetchWeather();
      await sendSignal("forecast_update", forecast.summary, 0.4);
    },
  },
  {
    name: "alert-check",
    every: minutes(15),
    async run() {
      const alert = await checkForAlerts();
      if (alert) {
        await sendMessage(alert.text, "weather_alert");
      }
    },
  },
];
```

Available helpers: `seconds(n)`, `minutes(n)`, `hours(n)`, `days(n)`.

All polls fire immediately on daemon start, then repeat on the declared interval. A failing poll logs a warning and continues — it will never crash the daemon.

---

## Scopes

Scopes declare what data and actions your interface needs. The user approves or denies each one individually during installation. The dashboard enforces them at the gateway — you never receive data the user didn't approve.

```ts
const SCOPES = {
  context: {
    location: "Required for weather at your current city",
    timezone: "Displays times in your local timezone",
  },
  signals: {
    forecast_update: "Hourly weather updates added to Chalie's awareness",
    weather_alert: "Severe weather warnings added to Chalie's awareness",
  },
  messages: {
    weather_emergency: "Storm warnings delivered directly to you via chat",
  },
};
```

**Write honest, specific descriptions.** These are shown verbatim on the install screen. "Required for showing weather at your current city" is better than "Needs location access."

When a scope is denied:
- **Context**: the field is absent from `getContext()` — use optional chaining
- **Signals**: `sendSignal()` returns `false` for that type — skip gracefully
- **Messages**: `sendMessage()` returns `false` — downgrade to a signal

---

## Capabilities

Capabilities are tools the LLM can invoke when the user asks something relevant. Declare them in the `CAPABILITIES` array, handle them in `executeCommand()`.

```ts
const CAPABILITIES = [
  {
    name: "get_forecast",
    description: "Get weather forecast for a location. Use when the user asks about weather.",
    parameters: [
      {
        name: "location",
        type: "string",
        required: false,
        description: "City name. Omit to use the user's current location.",
      },
    ],
  },
];
```

The `description` field is shown to the LLM — write it for an LLM reader, not a human.

**Always return HTTP 200 from `executeCommand()`.** Even on failure. Chalie reads the `error` field, not the HTTP status — a non-200 causes your error message to be lost.

```ts
async function executeCommand(capability, params) {
  try {
    const result = await doSomething(params);
    return { text: result.summary, data: result, error: null };
  } catch (e) {
    return { error: e.message };  // always return 200, never throw
  }
}
```

---

## Release Process

Push a version tag to trigger the GitHub Actions release workflow:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The workflow cross-compiles four platform binaries from a single `ubuntu-latest` runner and publishes a GitHub Release with all four attached:

| Binary | Platform |
|--------|----------|
| `daemon-linux-x64` | Linux x86_64 |
| `daemon-mac-x64` | macOS Intel |
| `daemon-mac-arm64` | macOS Apple Silicon |
| `daemon-windows-x64.exe` | Windows x86_64 |

All binaries are self-contained — they bundle the Deno runtime and your code into a single executable. No Deno, no Node.js, no Python required on the user's machine.

Use pre-release tags for betas: `v1.0.0-beta.1` (any tag containing `-` is marked as pre-release).

---

## Local Development

```bash
# Run without compiling (requires Deno)
deno task dev

# Compile for your current platform
deno task compile:mac-arm   # Apple Silicon
deno task compile:mac-x64   # Intel Mac
deno task compile:linux     # Linux
deno task compile:windows   # Windows

# Compile all four targets at once
deno task compile:all
```

Compiled binaries are written to `dist/`.

---

## Directory Structure

```
your-interface/
├── daemon.ts                    # Your entire interface — edit this
├── deno.json                    # Compile tasks and TypeScript config
├── .github/
│   └── workflows/
│       └── release.yml          # Auto-compile on version tag
└── dist/                        # Compiled binaries (git-ignored)
    ├── daemon-linux-x64
    ├── daemon-mac-x64
    ├── daemon-mac-arm64
    └── daemon-windows-x64.exe
```

---

## Signals vs Messages

| Scenario | Use | Why |
|----------|-----|-----|
| Hourly weather update | Signal | Background knowledge, not urgent |
| Severe storm warning | Message | User needs to know, may need to act |
| Inbox: 47 unread | Signal | Passive awareness |
| Urgent email from boss | Message | Actionable, time-sensitive |
| Stock price changed | Signal | Background, user decides relevance |
| Portfolio down 20% | Message | User likely needs to act |

Default to signals. Users uninstall noisy interfaces. A signal that doesn't surface is free. A message that interrupts focus costs trust.
