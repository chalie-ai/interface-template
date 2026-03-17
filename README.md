# Chalie Interface Template

Build interfaces that extend Chalie's capabilities. An interface is a self-contained app with its own backend daemon and frontend UI that pairs with a Chalie instance.

## What Is an Interface?

An interface is an app that connects to Chalie. It has two parts:

- **Backend daemon** — an HTTP server that exposes capabilities (tools) Chalie can invoke, pushes signals and messages via the gateway, and manages its own lifecycle
- **Frontend** — an `index.html` + `bundle.js` that renders a full-screen app inside Chalie's dashboard

When a user asks "what's the weather?" in chat, Chalie invokes your daemon's `get_forecast` capability. When the user opens your interface from the app launcher, your frontend renders the full weather experience.

## Quick Start

1. Copy this template repo
2. Pick a language from `examples/` (Python, Go, or JavaScript)
3. Implement your capabilities in the handler
4. Declare your scopes in `/meta`
5. Build your frontend in `frontend/`
6. Install in Chalie's dashboard

---

## Architecture

```
Your daemon          Dashboard (gateway)           Chalie backend
(localhost:4001)     (localhost:3000)               (internal)

GET /health      ←── health checks ──────────────→ registers tools
GET /capabilities←── reads tools ─────────────────→ registers tools
GET /meta        ←── reads scopes ────────────────→ stores permissions
POST /execute    ←── tool invocation (from Chalie reasoning loop)

POST gateway ────→   validates scopes ───────────→ POST /api/signals
     /signals        filters by user permission     (world state)

POST gateway ────→   validates scopes ───────────→ POST /api/messages
     /messages       checks message permission      (reasoning loop)

GET gateway  ────→   filters response ───────────→ GET /api/query/context
    /context         strips denied fields           (user context)
```

Your daemon never sees Chalie's host, port, or access key. The dashboard is the gateway and firewall. All auth, permission checking, and request proxying are transparent to your code.

---

## Security Model

### No Credentials in Your Code

Your daemon receives a gateway URL at startup. That's it — no tokens, no API keys for Chalie, no backend host. The dashboard identifies your daemon by its registered port and handles all authentication internally.

### Scoped Permissions

Your interface declares what data and actions it needs via scopes. During installation, the user sees each scope with your explanation and can approve or deny individually. The dashboard enforces these permissions at the gateway level — your daemon never receives data the user didn't approve.

### Gateway Enforcement

Every request from your daemon passes through the dashboard gateway:
- **Signals**: only declared signal types are forwarded
- **Messages**: only forwarded if the user approved message permissions
- **Context**: only approved fields are included in the response (denied fields are stripped)

If a scope is denied, your daemon receives a clean response (empty fields or 403) — never an error. Design your interface to handle partial permissions gracefully.

---

## Interface Contract

Your daemon is an HTTP server. It must expose these endpoints:

### Endpoints Your Daemon MUST Expose

#### `GET /health`

Health check. The dashboard calls this every 30 seconds.

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

Declares what tools this interface provides. These become tools that Chalie's reasoning loop can invoke via `POST /execute`.

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
    "documentation": "Returns a multi-day weather forecast. If no location is provided, uses the user's current location from context.",
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
  }
]
```

#### `POST /execute`

Chalie invokes one of your capabilities. Called when the user asks something that triggers your tool.

**Request**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `capability` | string | yes | The capability name to invoke |
| `params` | object | yes | Parameters as defined in your capability spec |

```json
{
  "capability": "get_forecast",
  "params": {"location": "London", "days": 5}
}
```

**Response** `200 OK`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | no | Human-readable result (Chalie uses this in conversation) |
| `data` | object | no | Structured result data (your frontend can use this) |
| `error` | string | no | Error description (null on success) |

```json
{
  "text": "London: 22°C and partly cloudy. 5-day forecast: Tue 22°C sunny, Wed 19°C rain, Thu 20°C cloudy, Fri 23°C sunny, Sat 21°C partly cloudy.",
  "data": {
    "current": {"temp": 22, "condition": "partly_cloudy", "humidity": 65},
    "forecast": [
      {"day": "Tuesday", "high": 22, "low": 14, "condition": "sunny"},
      {"day": "Wednesday", "high": 19, "low": 12, "condition": "rain"}
    ]
  },
  "error": null
}
```

The `text` field is what Chalie weaves into the conversation as natural language. The `data` field is structured data your frontend can use when the user opens the interface app.

**Always return HTTP 200.** Even on failure, return `200` with `error` set — never return `4xx` or `5xx`. Chalie reads the `error` field, not the HTTP status. A non-200 status causes the error message to be lost and Chalie reports a generic failure instead of your specific error.

#### `GET /meta`

Interface metadata and scope declarations.

**Response** `200 OK`:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier (lowercase, no spaces) |
| `name` | string | yes | Display name |
| `version` | string | yes | Semantic version |
| `description` | string | yes | Short description |
| `author` | string | no | Author name |
| `scopes` | object | yes | Permission declarations (see Scopes section) |

```json
{
  "id": "weather",
  "name": "Weather",
  "version": "1.0.0",
  "description": "Current conditions, forecasts, and weather alerts",
  "author": "Chalie Team",
  "scopes": {
    "context": {
      "location": "Required for location-based forecasts",
      "timezone": "Required for displaying times in your local zone"
    },
    "signals": {
      "forecast_update": "Hourly weather updates added to Chalie's awareness",
      "weather_alert": "Severe weather warnings added to Chalie's awareness"
    },
    "messages": {
      "weather_emergency": "Storm warnings delivered directly to you via chat"
    }
  }
}
```

#### `GET /index.html`

Full-screen app layout. Served when the user opens your interface from the launcher.

#### `GET /bundle.js`

Frontend JavaScript. Loaded by the dashboard alongside `index.html`.

#### `GET /icon.png`

Launcher icon. Square, minimum 256x256 pixels.

---

### Scopes

Scopes declare what data and actions your interface needs. The user approves or denies each scope individually during installation. The dashboard enforces them at the gateway.

#### Three Scope Categories

**`context`** — which user context fields your interface needs:

| Scope | Data Provided | Example Use |
|-------|---------------|-------------|
| `location` | lat, lon, location name | Weather for user's city |
| `timezone` | timezone string, local time | Display times correctly |
| `device` | device class, platform | Responsive layout |
| `energy` | user energy level | Adjust notification frequency |
| `attention` | user attention state | Respect deep focus |

**`signals`** — which signal types your interface will push to world state:

Each signal type you declare can be individually toggled by the user. If denied, your `POST gateway/signals` call for that type returns 403. Your daemon should handle this gracefully (skip the signal, don't crash).

**`messages`** — which message types your interface will push to the reasoning loop:

Messages cost LLM tokens and may interrupt the user. Listing them as scopes lets the user control which message types they want. A user might allow `weather_emergency` but deny a less critical message type.

#### Scope Descriptions

Every scope must include a human-readable description explaining why the interface needs it. These are shown to the user during installation. Be specific and honest — vague descriptions reduce trust:

```
// Good
"location": "Required for showing weather at your current city"

// Bad
"location": "Used by the interface"
```

#### Handling Denied Scopes

When a scope is denied:
- **Context**: the field is omitted from the `GET gateway/context` response
- **Signals**: `POST gateway/signals` returns 403 for that signal type
- **Messages**: `POST gateway/messages` returns 403 for that message type

Your daemon must handle this gracefully. Examples:
- Location denied → ask user to set a default city in your settings UI
- Signal denied → skip background updates for that type
- Message denied → downgrade to a signal (world state instead of direct message)

---

### Gateway Endpoints (Your Daemon Calls These)

Your daemon communicates with Chalie through the dashboard gateway. You never call Chalie directly.

#### `POST {gateway}/signals` — Push a Signal (World State)

Signals are passive world knowledge. Zero LLM cost. Use for background updates.

**Body**:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `signal_type` | string | yes | — | Must be declared in your scopes |
| `content` | string | yes | — | Human-readable description |
| `activation_energy` | float | no | 0.5 | Salience weight 0-1 |
| `metadata` | object | no | null | Structured data |

```json
{
  "signal_type": "forecast_update",
  "content": "London: 22°C, partly cloudy. Rain expected tomorrow.",
  "activation_energy": 0.4,
  "metadata": {"temp": 22, "condition": "partly_cloudy"}
}
```

**Response**: `202 {"ok": true}` or `403` if scope denied.

**Batch**: `POST {gateway}/signals/batch` — array of up to 50 signals.

#### `POST {gateway}/messages` — Push a Message (Reasoning Loop)

Messages enter Chalie's reasoning loop. Costs LLM tokens. Use for actionable items.

**Body**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | yes | Message content |
| `topic` | string | no | Topic hint |
| `metadata` | object | no | Structured context |

```json
{
  "text": "Severe weather alert: Storm warning for London from 6pm tonight.",
  "topic": "weather",
  "metadata": {"alert_type": "storm_warning", "severity": "severe"}
}
```

**Response**: `202 {"ok": true}` or `403` if scope denied.

#### `GET {gateway}/context` — Get User Context

Returns the user's current context, filtered by your approved scopes.

**Response** `200 OK` (only fields the user approved):

```json
{
  "timezone": "Europe/London",
  "local_time": "2026-03-17T14:30:00Z",
  "location": {
    "lat": 51.5074,
    "lon": -0.1278,
    "name": "London, UK"
  }
}
```

If the user denied `location`, the response simply omits it:

```json
{
  "timezone": "Europe/London",
  "local_time": "2026-03-17T14:30:00Z"
}
```

---

### When to Use Signals vs Messages

| Scenario | Use | Why |
|----------|-----|-----|
| Hourly weather update | Signal | Background knowledge, not urgent |
| Storm warning | Message | User needs to know, may need to act |
| Inbox count: 47 unread | Signal | Passive awareness |
| Urgent email from boss | Message | Actionable, time-sensitive |
| Stock price changed | Signal | Background, user decides relevance |
| Stock crashed 20% | Message | User likely needs to act |

Default to signals. Only use messages for things the user genuinely needs to act on. A noisy interface that spams messages will get uninstalled.

---

## Initialization

Your daemon starts with minimal arguments:

```bash
./your-daemon --gateway=http://localhost:3000 --port=4001 --data-dir=./data
```

| Argument | Description |
|----------|-------------|
| `--gateway` | Dashboard gateway URL (always localhost) |
| `--port` | Port for your HTTP server |
| `--data-dir` | Writable directory for your persistent data |

No tokens, no API keys, no Chalie host. The gateway handles all authentication transparently. Your daemon just makes HTTP calls to the gateway URL.

---

## Frontend

Your frontend consists of two files:

### `index.html`

The full-screen app layout loaded when the user opens your interface. Design it as a complete app.

Guidelines:
- Use `100%` height/width (the dashboard provides the container)
- Follow the Radiant design system for consistency (dark theme, accent glows — see `frontend/index.html` for baseline tokens)
- Include CSS inline or in a `<style>` tag
- Load `bundle.js` as a module: `<script type="module" src="bundle.js"></script>`

### `bundle.js`

Your frontend logic. Exports two functions:

```javascript
// Called when the user opens your interface
export function mount(container, config) {
  // config = { gateway, daemon_host }
  // gateway = dashboard gateway URL (same as daemon's --gateway)
  // daemon_host = your daemon's URL (for fetching your own data)
  // Render your UI into container
}

// Called when the user navigates away
export function unmount(container) {
  // Cleanup: stop timers, remove listeners
}
```

Your frontend can call the gateway for context data or your own daemon for interface-specific data. All gateway calls go through the same scope enforcement.

---

## Directory Structure

```
your-interface/
├── handler          # Your daemon binary or entry script
├── frontend/
│   ├── index.html   # Full-screen app layout
│   ├── bundle.js    # Frontend logic (mount/unmount exports)
│   └── icon.png     # Launcher icon (square, min 256x256)
└── data/            # Persistent storage (created at runtime)
```

---

## Examples

Working daemon skeletons in three languages:

| Language | Directory | HTTP Framework | Lines |
|----------|-----------|---------------|-------|
| Python | `examples/python/` | Flask | ~100 |
| Go | `examples/go/` | net/http | ~120 |
| JavaScript | `examples/javascript/` | Deno std/http | ~100 |

Each example implements all required endpoints with a dummy "echo" capability. Copy one, replace the business logic, and you have a working interface.

---

## Lifecycle

```
INSTALL
  Dashboard starts your daemon with --gateway, --port, --data-dir
  → GET /health (verify alive)
  → GET /capabilities (register tools with Chalie)
  → GET /meta (read scopes + metadata)
  → Dashboard shows scope approval screen to user
  → User approves/denies scopes
  → Your daemon starts its self-managed background work
  → Icon appears in app launcher

RUNNING
  Your daemon is autonomous:
  → Polls external APIs on its own schedule
  → Pushes signals via gateway (scope-gated)
  → Pushes messages via gateway (scope-gated)
  → Pulls user context via gateway (field-filtered by scopes)
  → Responds to POST /execute when Chalie invokes a capability
  → Serves frontend files when user opens the interface

SETTINGS CHANGE
  User changes scope permissions in dashboard
  → Dashboard updates internal scope table
  → Next gateway request reflects new permissions
  → No daemon restart needed

UNINSTALL
  Dashboard sends SIGTERM → your daemon exits
  Dashboard deregisters tools from Chalie
  Dashboard revokes internal scope bindings
  Package directory deleted
```

---

## Best Practices

**Handle denied scopes gracefully.** Never crash because a scope was denied. Disable the feature that needs it and move on. Offer alternatives in your settings UI (e.g., manual location input if geolocation is denied).

**Default to signals.** Messages cost tokens and may interrupt. Use them only for genuinely urgent items. Users uninstall noisy interfaces.

**Be context-aware.** Check `energy` and `attention` from the context endpoint before pushing messages. If the user is in deep focus, consider queuing or downgrading to a signal.

**Keep capabilities stateless.** Your `POST /execute` handler should not depend on previous invocations. Chalie may call any capability at any time.

**Frontend independence.** Your frontend should work even if your daemon is temporarily down. Cache last known data. Show stale data with a timestamp rather than an error screen.

**Scope descriptions matter.** Clear, specific descriptions build trust. "Required for showing weather at your current city" is better than "Needs location access."
