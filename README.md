# Chalie Interface Template

Build interfaces that extend Chalie's capabilities. An interface is a self-contained app with its own backend daemon and frontend UI that pairs with a Chalie instance.

## What Is an Interface?

An interface is an app that connects to Chalie. It has two parts:

- **Backend daemon** — an HTTP server that exposes capabilities (tools) Chalie can invoke, pushes signals and messages to Chalie, and manages its own lifecycle
- **Frontend** — an `index.html` + `bundle.js` that renders a full-screen app inside Chalie's dashboard

When a user asks "what's the weather?" in chat, Chalie invokes your daemon's `get_forecast` capability. When the user opens your interface from the app launcher, your frontend renders the full weather experience.

## Quick Start

1. Copy this template repo
2. Pick a language from `examples/` (Python, Go, or JavaScript)
3. Implement your capabilities in the handler
4. Build your frontend in `frontend/`
5. Install in Chalie's dashboard

---

## Interface Contract

Your daemon is an HTTP server. It must expose these endpoints:

### Endpoints Your Daemon MUST Expose

#### `GET /health`

Health check. Chalie calls this every 30 seconds.

**Response** `200 OK`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | string | yes | `"ok"` |
| `name` | string | yes | Interface display name |
| `version` | string | yes | Semantic version |

```json
{"status": "ok", "name": "Weather", "version": "1.0.0"}
```

#### `GET /capabilities`

Declares what tools this interface provides. Chalie fetches this on install and periodically to stay in sync. These become tools that Chalie's reasoning loop can invoke.

**Response** `200 OK`: Array of capability objects.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Tool identifier (unique within this interface) |
| `description` | string | yes | What the tool does (shown to the LLM) |
| `documentation` | string | no | Detailed usage docs for the LLM |
| `parameters` | array | yes | Parameter definitions (can be empty `[]`) |
| `parameters[].name` | string | yes | Parameter name |
| `parameters[].type` | string | yes | `string`, `number`, `integer`, `boolean`, `object` |
| `parameters[].required` | boolean | yes | Whether the parameter is required |
| `parameters[].description` | string | yes | What the parameter is for |
| `parameters[].default` | any | no | Default value if not provided |
| `returns` | object | no | Return type description |

```json
[
  {
    "name": "get_forecast",
    "description": "Get weather forecast for a location",
    "documentation": "Returns a multi-day weather forecast. If no location is provided, uses the user's current location from Chalie's context.",
    "parameters": [
      {
        "name": "location",
        "type": "string",
        "required": false,
        "description": "City name or 'lat,lon' coordinates. Defaults to user's current location."
      },
      {
        "name": "days",
        "type": "integer",
        "required": false,
        "default": 5,
        "description": "Number of forecast days (1-14)"
      }
    ],
    "returns": {
      "type": "object",
      "description": "Forecast with daily temperature, conditions, and precipitation"
    }
  },
  {
    "name": "get_current",
    "description": "Get current weather conditions",
    "parameters": [
      {
        "name": "location",
        "type": "string",
        "required": false,
        "description": "City name or 'lat,lon' coordinates"
      }
    ]
  }
]
```

#### `POST /execute`

Chalie invokes one of your capabilities. This is called when the user asks something that triggers your tool.

**Request**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `capability` | string | yes | The capability name to invoke |
| `params` | object | yes | Parameters as defined in your capability spec |

```json
{
  "capability": "get_forecast",
  "params": {
    "location": "London",
    "days": 5
  }
}
```

**Response** `200 OK`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | no | Human-readable result (Chalie uses this in conversation) |
| `data` | object | no | Structured result data |
| `error` | string | no | Error description (null on success) |

```json
{
  "text": "London: 22°C and partly cloudy. 5-day forecast: Tue 22°C sunny, Wed 19°C rain, Thu 20°C cloudy, Fri 23°C sunny, Sat 21°C partly cloudy.",
  "data": {
    "current": {"temp": 22, "condition": "partly_cloudy", "humidity": 65},
    "forecast": [
      {"day": "Tuesday", "high": 22, "low": 14, "condition": "sunny", "precipitation": 0},
      {"day": "Wednesday", "high": 19, "low": 12, "condition": "rain", "precipitation": 80}
    ]
  },
  "error": null
}
```

The `text` field is what Chalie weaves into the conversation as natural language. The `data` field is structured data your frontend can use when the user opens the interface.

#### `GET /meta`

Interface metadata for the dashboard launcher.

**Response** `200 OK`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique interface identifier (lowercase, no spaces) |
| `name` | string | yes | Display name |
| `version` | string | yes | Semantic version |
| `description` | string | yes | Short description |
| `author` | string | no | Author name |
| `signals` | string[] | no | Signal types this interface may emit |
| `config_schema` | object | no | User-configurable settings schema |

```json
{
  "id": "weather",
  "name": "Weather",
  "version": "1.0.0",
  "description": "Current conditions, forecasts, and weather alerts",
  "author": "Chalie Team",
  "signals": ["forecast_update", "weather_alert"],
  "config_schema": {
    "api_key": {"type": "string", "required": true, "label": "API Key"},
    "units": {"type": "enum", "values": ["metric", "imperial"], "default": "metric"}
  }
}
```

#### `GET /index.html`

The full-screen app layout. Served when the user opens your interface from the dashboard launcher.

#### `GET /bundle.js`

Frontend JavaScript. Loaded by the dashboard alongside your `index.html`.

#### `GET /icon.png`

Launcher icon. Square, minimum 256x256 pixels.

---

### Endpoints Your Daemon CAN Call on Chalie

Your daemon communicates with Chalie via these endpoints. The Chalie host and access key are passed to your daemon at startup (see Initialization below).

#### `POST {chalie_host}/api/signals` — Push a Signal (World State)

Signals are passive world knowledge. Zero LLM cost. Use for background updates that Chalie should know about but doesn't need to act on immediately.

**Headers**: `Authorization: Bearer {access_key}`

**Body**:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `signal_type` | string | yes | — | Signal category (must be declared in `/meta` response) |
| `content` | string | yes | — | Human-readable description |
| `source` | string | no | interface id | Originating system |
| `activation_energy` | float | no | 0.5 | Salience weight 0-1 (higher = stays visible longer) |
| `metadata` | object | no | null | Structured data |

```json
{
  "signal_type": "forecast_update",
  "content": "London: 22°C, partly cloudy. Rain expected tomorrow.",
  "source": "weather",
  "activation_energy": 0.4,
  "metadata": {
    "temp": 22,
    "condition": "partly_cloudy",
    "tomorrow_rain_chance": 80
  }
}
```

**Response**: `202 {"ok": true, "signal_id": "<uuid>"}`

**Batch variant**: `POST {chalie_host}/api/signals/batch` — array of up to 50 signals.

#### `POST {chalie_host}/api/messages` — Push a Message (Reasoning Loop)

Messages are direct communication. Chalie reasons about them and may surface them to the user. Use for actionable items the user should know about.

**Headers**: `Authorization: Bearer {access_key}`

**Body**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | yes | Message content |
| `source` | string | no | Interface identifier |
| `topic` | string | no | Topic hint |
| `metadata` | object | no | Structured context |

```json
{
  "text": "Severe weather alert: Storm warning for London from 6pm tonight. Wind gusts up to 70mph expected.",
  "source": "weather",
  "topic": "weather",
  "metadata": {
    "alert_type": "storm_warning",
    "severity": "severe",
    "starts_at": "2026-03-17T18:00:00Z"
  }
}
```

**Response**: `202 {"ok": true, "message_id": "<uuid>"}`

**When to use signals vs messages:**

| Scenario | Use | Why |
|----------|-----|-----|
| Hourly weather update | Signal | Background knowledge, not urgent |
| Storm warning | Message | User needs to know, may need to act |
| Inbox count: 47 unread | Signal | Passive awareness |
| Urgent email from boss | Message | Actionable, time-sensitive |
| Stock price changed | Signal | Background, user decides relevance |
| Stock price crashed 20% | Message | User likely needs to act |

#### `GET {chalie_host}/api/query/context` — Get User Context

Returns the user's current context (location, timezone, device, energy level). Use this to make your interface context-aware.

**Headers**: `Authorization: Bearer {access_key}`

**Response** `200 OK`:

```json
{
  "timezone": "Europe/London",
  "locale": "en-GB",
  "local_time": "2026-03-17T14:30:00Z",
  "location": {
    "lat": 51.5074,
    "lon": -0.1278,
    "name": "London, UK"
  },
  "device": {
    "class": "phone",
    "platform": "iOS"
  },
  "energy": "high",
  "attention": "casual"
}
```

Fields may be `null` if the user hasn't granted permissions (e.g., location) or if no frontend is connected. Always handle missing fields gracefully.

---

## Initialization

When your daemon starts, it receives a runtime context via command-line argument:

```bash
./your-daemon --chalie-host=http://localhost:8081 --access-key=abc123 --data-dir=/data/weather --port=4001
```

| Argument | Description |
|----------|-------------|
| `--chalie-host` | Chalie backend URL |
| `--access-key` | Authentication key for Chalie API |
| `--data-dir` | Writable directory for your interface's persistent data |
| `--port` | Port to run your HTTP server on |

You do NOT hardcode any of these. They are injected by the dashboard when your interface is installed. The examples in this repo include a helper that parses these arguments and provides a `ChalieClient` you can use throughout your code.

---

## Frontend

Your frontend consists of two files:

### `index.html`

The full-screen app layout. This is loaded into the dashboard's interface container when the user opens your interface. Design it as a complete app — not a widget or card.

Guidelines:
- Use `100%` height/width (the dashboard provides the container)
- Follow the Radiant design system for visual consistency (dark theme, accent glows)
- Include all your CSS inline or in a `<style>` tag (no external stylesheets to avoid CORS)
- Load `bundle.js` as a module: `<script type="module" src="bundle.js"></script>`

### `bundle.js`

Your frontend logic. It should export two functions:

```javascript
// Called when the user opens your interface
export function mount(container, config) {
  // config = { chalie_host, access_key }
  // Render your UI into container
}

// Called when the user navigates away
export function unmount(container) {
  // Cleanup: stop timers, remove listeners
}
```

Your frontend can call Chalie's API directly (using the provided `config.chalie_host` and `config.access_key`) or communicate with your own daemon for data.

---

## Directory Structure

```
your-interface/
├── handler          # Your daemon binary (compiled) or entry script
├── frontend/
│   ├── index.html   # Full-screen app layout
│   ├── bundle.js    # Frontend logic (mount/unmount exports)
│   └── icon.png     # Launcher icon (square, min 256x256)
└── data/            # Persistent storage (created at runtime)
```

---

## Examples

This repo includes working daemon skeletons in three languages:

| Language | Directory | HTTP Framework | Lines of Code |
|----------|-----------|---------------|---------------|
| Python | `examples/python/` | Flask | ~120 |
| Go | `examples/go/` | net/http | ~130 |
| JavaScript | `examples/javascript/` | Deno (std/http) | ~110 |

Each example implements all required endpoints with a dummy "echo" capability. Copy one, replace the business logic, and you have a working interface.

---

## Lifecycle

```
INSTALL
  Dashboard starts your daemon with --chalie-host, --access-key, --port, --data-dir
  → Chalie calls GET /health (verify alive)
  → Chalie calls GET /capabilities (register tools)
  → Chalie calls GET /meta (show in launcher)
  → Your daemon starts its own background work

RUNNING
  Your daemon is autonomous:
  → Polls external APIs on its own schedule
  → Pushes signals to Chalie when it learns something
  → Pushes messages to Chalie when something needs attention
  → Pulls user context from Chalie when needed
  → Responds to POST /execute when Chalie invokes a capability
  → Serves frontend files when user opens the interface

UNINSTALL
  Dashboard sends SIGTERM → your daemon exits gracefully
  Dashboard deregisters your tools from Chalie
  Package directory deleted
```

---

## Best Practices

**Signals vs Messages**: Default to signals. Only use messages for things the user genuinely needs to act on. A noisy interface that spams messages will get uninstalled.

**Context awareness**: Pull user context before making decisions. Don't fetch weather for your server's location — fetch it for the user's location.

**Graceful degradation**: If Chalie is unreachable, your daemon should keep running. Queue signals and retry. Don't crash because the cognitive runtime is temporarily down.

**Stateless capabilities**: Your `POST /execute` handler should not depend on previous invocations. Chalie may call any capability at any time, in any order.

**Frontend independence**: Your frontend should work even if your daemon is temporarily down. Cache the last known data. Show stale data with a timestamp rather than an error screen.

**Respect user attention**: Check `energy` and `attention` from the context endpoint before pushing messages. If the user is in deep focus, consider queuing non-urgent messages or downgrading them to signals.
