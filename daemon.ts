import { CONSTANTS, ContextResult } from "./constants.ts";

/**
 * Chalie Interface Daemon — TypeScript Template
 *
 * This file is the complete implementation of a Chalie interface. It compiles
 * to a self-contained binary via `deno compile` — no runtime, no dependencies,
 * no Node.js, no Python required on the end-user's machine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT YOU NEED TO IMPLEMENT
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   1. IDENTITY — Fill in NAME, VERSION, DESCRIPTION, and AUTHOR.
 *
 *   2. CAPABILITIES — Declare what tools Chalie can invoke (the CAPABILITIES
 *      array). Each capability becomes an LLM-visible tool in the ACT loop.
 *
 *   3. SCOPES — Declare what data your interface needs from the user
 *      (the SCOPES object). Users approve each scope individually at install.
 *
 *   4. executeCommand() — Handle each capability invocation. Chalie calls
 *      this when the user's message triggers one of your declared capabilities.
 *
 *   5. renderInterface() — Return HTML for the full-screen app the user sees
 *      when they open your interface from the launcher.
 *
 *   6. POLLS — Declare background jobs that run on a schedule. Use these to
 *      push signals, sync external data, or check for alerts.
 *
 * Everything else — HTTP server, port management, health checks, capability
 * registration, gateway handshake — is handled by the framework below.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RUNNING LOCALLY (DEVELOPMENT)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   deno run --allow-net --allow-read --allow-write --allow-env daemon.ts \
 *     --gateway=http://localhost:3000
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPILING A RELEASE BINARY
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   deno task compile:linux    → dist/daemon-linux-x64
 *   deno task compile:mac-x64  → dist/daemon-mac-x64
 *   deno task compile:mac-arm  → dist/daemon-mac-arm64
 *   deno task compile:windows  → dist/daemon-windows-x64.exe
 *
 * Or push a version tag (v1.2.3) to trigger the GitHub Actions release
 * workflow, which cross-compiles all four targets automatically.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SECURITY MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Your daemon never sees Chalie's host, port, credentials, or database. The
 * dashboard is the gateway and firewall. Auth, scope enforcement, and request
 * proxying are transparent to your code. You receive exactly one thing at
 * startup: a gateway URL. All Chalie communication flows through it.
 *
 * @module
 */

// =============================================================================
// ① IDENTITY — Change these for your interface
// =============================================================================

/**
 * Human-readable display name shown in the launcher and settings.
 *
 * @example "Weather", "GitHub Inbox", "Home Sensors"
 */
const NAME = "Example Interface";

/**
 * Semantic version string following semver (major.minor.patch).
 *
 * The dashboard compares this to the installed version and shows an
 * "update available" badge when they differ.
 *
 * @example "1.0.0", "2.3.1"
 */
const VERSION = "1.0.0";

/**
 * One-line description shown in the interface catalogue and install screen.
 * Keep it under 100 characters — be specific about what this interface does.
 *
 * @example "Real-time weather conditions, hourly forecasts, and severe alerts"
 */
const DESCRIPTION = "A skeleton interface — replace with your own logic";

/**
 * Author name or organisation shown in the install screen.
 *
 * @example "Your Name", "Acme Corp"
 */
const AUTHOR = "Your Name";

// =============================================================================
// ② SCOPES — Declare what data your interface needs
// =============================================================================

/**
 * Scope declarations shown to the user during installation.
 *
 * The user approves or denies each scope individually. The dashboard enforces
 * approved scopes at the gateway — your daemon never receives data the user
 * didn't approve.
 *
 * ─── Context Scopes ───────────────────────────────────────────────────────────
 *
 * Context scopes control which fields appear in the response from
 * `getContext()`. Denied fields are simply omitted — your code must handle
 * their absence gracefully.
 *
 * | Scope      | Fields provided                                      |
 * |------------|------------------------------------------------------|
 * | location   | lat, lon, name (city-level only, never raw GPS)     |
 * | timezone   | timezone string, local_time ISO string               |
 * | device     | device class (mobile/tablet/desktop), platform       |
 * | energy     | user energy level 0–1 (from ambient inference)       |
 * | attention  | focus state: "focused" | "ambient" | "distracted"    |
 *
 * ─── Signal Scopes ────────────────────────────────────────────────────────────
 *
 * Each key under `signals` is a signal type your interface may push via
 * `sendSignal()`. If a signal type is not declared here, the gateway rejects
 * it with 403. If the user denies a type, your `sendSignal()` call returns
 * false silently.
 *
 * ─── Message Scopes ───────────────────────────────────────────────────────────
 *
 * Each key under `messages` is a message topic your interface may push via
 * `sendMessage()`. Messages enter Chalie's reasoning loop (LLM cost). Users
 * are protective of their attention — declare only genuinely urgent topics.
 *
 * ─── Description Rules ────────────────────────────────────────────────────────
 *
 * Every scope value is shown verbatim in the install screen. Be specific:
 *
 *   GOOD: "Required for showing weather at your current city"
 *   BAD:  "Used by the interface"
 *
 * Vague descriptions reduce trust and increase denial rates.
 */
const SCOPES: Scopes = {
  context: {
    [CONSTANTS.SCOPES.LOCATION]: "Shows personalised data based on your city",
    [CONSTANTS.SCOPES.TIMEZONE]: "Displays times in your local timezone",
  },
  signals: {
    example_update: "Periodic status updates added to Chalie's awareness",
  },
  messages: {
    // Declare message topics here only if your interface needs to send
    // direct messages to Chalie's reasoning loop. Each topic costs LLM tokens
    // and may interrupt the user. Leave this empty if signals are sufficient.
    //
    // example_alert: "Important alerts delivered directly to you via chat",
  },
};

// =============================================================================
// ③ CAPABILITIES — Declare the tools Chalie can invoke
// =============================================================================

/**
 * Capability declarations registered with Chalie's ACT loop on install.
 *
 * Each entry in this array becomes an LLM-visible tool. When the user asks
 * something that triggers one of your capabilities, Chalie calls
 * `executeCommand()` with the capability name and the parameters it inferred.
 *
 * ─── Field Guide ──────────────────────────────────────────────────────────────
 *
 * name          Unique within this interface. Used as the tool identifier in
 *               the ACT loop. Snake_case recommended.
 *
 * description   Shown to the LLM. Write it as a short imperative sentence
 *               describing what the tool does and when to use it. This is the
 *               primary signal the LLM uses to select your tool — write it
 *               for an LLM reader, not a human.
 *
 * documentation Optional extended docs for the LLM. Use this to explain edge
 *               cases, default behaviour, or parameter interactions that don't
 *               fit in description. The LLM reads this when constructing the
 *               call — be precise.
 *
 * parameters    Array of parameter specs. Each parameter the LLM can populate:
 *
 *               name        Snake_case identifier.
 *               type        "string" | "number" | "integer" | "boolean" | "object"
 *               required    true = LLM must provide a value.
 *               description Shown to the LLM. What this parameter controls.
 *               default     Optional fallback used when the parameter is absent.
 *
 * returns       Optional description of what the tool returns. Helps the LLM
 *               understand how to interpret and present the result.
 *
 * ─── Example ──────────────────────────────────────────────────────────────────
 *
 * {
 *   name: "get_forecast",
 *   description: "Get weather forecast for a location. Use when the user asks about weather, temperature, or conditions.",
 *   documentation: "Returns a multi-day forecast. If no location is provided, uses the user's current location from context.",
 *   parameters: [
 *     {
 *       name: "location",
 *       type: "string",
 *       required: false,
 *       description: "City name or 'lat,lon' coordinates. Omit to use the user's current location.",
 *     },
 *     {
 *       name: "days",
 *       type: "integer",
 *       required: false,
 *       default: 5,
 *       description: "Number of forecast days (1–14). Defaults to 5.",
 *     },
 *   ],
 *   returns: {
 *     type: "object",
 *     description: "Forecast with daily temperature, conditions, and precipitation chance",
 *   },
 * }
 */
const CAPABILITIES: Capability[] = [
  {
    name: "echo",
    description:
      "Echo back the input text. Use this to demonstrate the interface is working.",
    parameters: [
      {
        name: "text",
        type: "string",
        required: true,
        description: "The text to echo back.",
      },
    ],
    returns: {
      type: "object",
      description: "The original text with an echo prefix.",
    },
  },
];

// =============================================================================
// ④ POLLS — Background jobs that run on a schedule
// =============================================================================

/**
 * Scheduled background jobs.
 *
 * Each poll runs independently on its own interval. Use polls to:
 * - Fetch data from external APIs and push signals to Chalie
 * - Check for alerts or threshold breaches and push messages
 * - Sync state from remote systems into your local data store
 * - Perform any periodic maintenance your interface needs
 *
 * The `every` field is a duration in milliseconds. Use the helpers for
 * readability: `seconds(30)`, `minutes(5)`, `hours(1)`, `days(1)`.
 *
 * ─── Execution Model ──────────────────────────────────────────────────────────
 *
 * - All polls start immediately when the daemon starts (first tick fires
 *   right away, then repeats on the interval).
 * - Polls run concurrently — a slow poll does not block others.
 * - If a poll's `run()` throws, the error is logged and the poll continues
 *   on its next scheduled tick. Never crash the daemon from a poll.
 * - The gateway enforces scopes on every `sendSignal()` and `sendMessage()`
 *   call inside your poll. Handle 403 / `false` returns gracefully.
 *
 * ─── Signals vs Messages ──────────────────────────────────────────────────────
 *
 * | Scenario                    | Use     | Why                             |
 * |-----------------------------|---------|-------------------------------- |
 * | Hourly weather update       | Signal  | Background knowledge, not urgent|
 * | Severe storm warning        | Message | User needs to act               |
 * | Inbox: 47 unread emails     | Signal  | Passive awareness               |
 * | Urgent email from your boss | Message | Actionable, time-sensitive      |
 * | Stock price change          | Signal  | Background, user decides        |
 * | Portfolio down 20%          | Message | User likely needs to act        |
 *
 * Default to signals. A noisy interface that spams messages will get
 * uninstalled. Check the user's attention state before pushing messages —
 * if they're in deep focus, downgrade to a signal or skip entirely.
 *
 * ─── Checking Attention Before Messaging ──────────────────────────────────────
 *
 * const ctx = await getContext();
 * if (ctx.attention === "focused") {
 *   // User is in deep focus — downgrade to signal or skip
 *   await sendSignal("my_alert", "Alert queued (user in focus mode)", 0.3);
 *   return;
 * }
 * await sendMessage("Urgent: something needs your attention.", "my_topic");
 *
 * @example
 * ```ts
 * const POLLS: Poll[] = [
 *   {
 *     name: "hourly-status",
 *     every: hours(1),
 *     async run() {
 *       const ctx = await getContext();
 *       const city = ctx.get(CONSTANTS.SCOPES.LOCATION)?.name ?? "unknown location";
 *       await sendSignal(
 *         "example_update",
 *         `Interface is running. User is in ${city}.`,
 *         0.2,
 *       );
 *     },
 *   },
 *   {
 *     name: "five-minute-check",
 *     every: minutes(5),
 *     async run() {
 *       // Check external API, push signal or message based on result
 *     },
 *   },
 * ];
 * ```
 */
const POLLS: Poll[] = [
  {
    name: "hourly-status",
    every: hours(1),
    /**
     * Push a lightweight status signal every hour.
     *
     * Replace this with your own polling logic: weather API calls, inbox
     * checks, sensor reads, external data sync, etc.
     *
     * The activation_energy (0.2) is intentionally low — this is background
     * knowledge, not something that needs to surface immediately.
     */
    async run() {
      const ctx = await getContext();
      const location = ctx.get(CONSTANTS.SCOPES.LOCATION);
      const city = location?.name ?? "unknown location";
      await sendSignal(
        "example_update",
        `Interface is running. User is in ${city}.`,
        0.2,
      );
    },
  },
];

// =============================================================================
// ⑤ executeCommand() — Handle capability invocations from Chalie
// =============================================================================

/**
 * Execute a capability invoked by Chalie's reasoning loop.
 *
 * This function is called when the user says something that triggers one of
 * your declared capabilities. Chalie infers the capability name and parameters
 * from the conversation and calls this function with them.
 *
 * ─── Contract ─────────────────────────────────────────────────────────────────
 *
 * You MUST always return a `CommandResult` — never throw from this function.
 * If an error occurs, catch it and return `{ error: "description of error" }`.
 *
 * Always return HTTP 200. The framework handles the response status. Chalie
 * reads the `error` field, not the HTTP status. If you let an exception
 * propagate, the framework catches it and returns a generic error — your
 * specific error message is lost.
 *
 * ─── Return Fields ────────────────────────────────────────────────────────────
 *
 * text   Human-readable result. Chalie weaves this into the conversation as
 *        natural language. Write it as a complete sentence or paragraph —
 *        something Chalie can quote or paraphrase in its response.
 *        Optional: omit if the result is purely structural.
 *
 * data   Structured result for your frontend. Your `renderInterface()` UI can
 *        read this when the user opens the interface. Store it, display it,
 *        visualise it — whatever makes sense for your interface.
 *        Optional: omit if there's no structured data to surface.
 *
 * error  Non-null if the invocation failed. Chalie reports this to the user.
 *        Be specific: "Could not fetch forecast: API rate limit exceeded" is
 *        more useful than "Request failed".
 *        Set to null (or omit) on success.
 *
 * ─── Accessing Gateway Data ───────────────────────────────────────────────────
 *
 * Call `getContext()` if you need the user's location, timezone, or device
 * info to fulfil the request. Context fields absent from the response were
 * denied by the user — handle their absence gracefully.
 *
 * ─── Example ──────────────────────────────────────────────────────────────────
 *
 * ```ts
 * async function executeCommand(
 *   capability: string,
 *   params: Record<string, unknown>,
 * ): Promise<CommandResult> {
 *   switch (capability) {
 *     case "get_forecast": {
 *       const location = params.location as string | undefined;
 *       if (!location) {
 *         const ctx = await getContext();
 *         const location = ctx.get(CONSTANTS.SCOPES.LOCATION);
 *         if (!location) {
 *           return { error: "No location provided and location scope was denied." };
 *         }
 *         // use location.name
 *       }
 *       const forecast = await fetchForecastFromExternalAPI(location);
 *       return {
 *         text: `London: 22°C and partly cloudy. Rain expected tomorrow.`,
 *         data: { current: forecast.current, days: forecast.daily },
 *         error: null,
 *       };
 *     }
 *
 *     default:
 *       return { error: `Unknown capability: ${capability}` };
 *   }
 * }
 * ```
 *
 * @param capability - The capability name, matching a key in CAPABILITIES.
 * @param params     - Parameters inferred by Chalie from the conversation.
 * @returns          - Always a CommandResult. Never throws.
 */
async function executeCommand(
  capability: string,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  switch (capability) {
    case "echo": {
      // ── Replace this with your real capability handlers ──────────────────
      const text = (params.text as string) ?? "";
      return {
        text: `Echo: ${text}`,
        data: { original: text, length: text.length },
        error: null,
      };
    }

    default:
      return { error: `Unknown capability: ${capability}` };
  }
}

// =============================================================================
// ⑥ renderInterface() — Return the HTML for your full-screen app
// =============================================================================

/**
 * Render the widget shown when the user opens your interface inside the dashboard.
 *
 * Return an HTML string containing a single root `<div>`. The dashboard injects
 * it directly into the page — do NOT return a full HTML document. No `<!DOCTYPE>`,
 * no `<html>`, no `<head>`, no `<body>`. The dashboard owns the page shell;
 * your interface is a full-screen widget within it.
 *
 * ─── The `config` Argument ────────────────────────────────────────────────────
 *
 * config.gateway     The dashboard gateway URL (same as --gateway on startup).
 *                    Use this to call `GET /context`, `POST /signals`, etc.
 *                    All gateway calls are scope-enforced.
 *
 * config.daemonHost  The URL of this daemon (your own server).
 *                    Use this to fetch interface-specific data from your own
 *                    endpoints, if you add any.
 *
 * ─── Structure Rules ──────────────────────────────────────────────────────────
 *
 * - Return exactly one root `<div>` that fills its container.
 * - Do NOT include a `<style>` tag — the dashboard provides styling options.
 * - Use `width: 100%; height: 100%` on the root div — the dashboard sets the
 *   container size.
 * - `<script type="module">` tags inside your root div are fine.
 *
 * ─── Design Guidelines ────────────────────────────────────────────────────────
 *
 * - The dashboard injects Radiant design system tokens — dark theme, accent
 *   glows, typography — into the page. Use those CSS variables rather than
 *   hardcoding colours or fonts.
 * - Your widget should work even if your daemon is temporarily down. Cache the
 *   last known data in localStorage and show it with a "last updated" timestamp
 *   rather than a blank error screen.
 *
 * ─── Data Flow ────────────────────────────────────────────────────────────────
 *
 *   1. From the gateway (scope-enforced context):
 *      fetch(`${config.gateway}/context`)
 *
 *   2. From your own daemon (any custom endpoints you add):
 *      fetch(`${config.daemonHost}/my-data`)
 *
 * ─── Example ──────────────────────────────────────────────────────────────────
 *
 * ```ts
 * function renderInterface(config: InterfaceConfig): string {
 *   return `
 *   <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
 *     <div id="weather-app">Loading...</div>
 *     <script type="module">
 *       const gateway = ${JSON.stringify(config.gateway)};
 *       const ctx = await fetch(gateway + "/context").then(r => r.json());
 *       document.getElementById("weather-app").textContent =
 *         "Weather for " + (ctx.location?.name ?? "your location");
 *     </script>
 *   </div>`;
 * }
 * ```
 *
 * @param config - Gateway and daemon URLs injected by the framework.
 * @returns      - An HTML string with a single root <div>. No full document.
 */
function renderInterface(config: InterfaceConfig): string {
  return `
<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;">
  <h1>${NAME}</h1>
  <p>${DESCRIPTION}</p>
  <p>Replace <code>renderInterface()</code> in daemon.ts with your UI.</p>

  <script type="module">
    // config is injected by the framework — use these URLs to talk to
    // the gateway and to this daemon.
    const gateway = ${JSON.stringify(config.gateway)};
    const daemon  = ${JSON.stringify(config.daemonHost)};

    // Example: fetch context from gateway (respects user-approved scopes)
    // const ctx = await fetch(gateway + "/context").then(r => r.json());
  </script>
</div>`;
}

// =============================================================================
// FRAMEWORK — Do not edit below this line
// =============================================================================
//
// Everything below is the runtime harness. It handles:
//
//   - CLI argument parsing (--gateway, --data-dir injected by dashboard)
//   - HTTP server (health, capabilities, meta, execute, interface)
//   - Poll scheduling (runs your POLLS array on their declared intervals)
//   - Gateway client (sendSignal, sendMessage, getContext)
//   - Graceful error handling and logging
//
// You should not need to modify any of this. If you find yourself wanting to,
// open an issue at https://github.com/chalie-ai/interface-template.

// ── Types ─────────────────────────────────────────────────────────────────────

interface Parameter {
  name: string;
  type: "string" | "number" | "integer" | "boolean" | "object";
  required: boolean;
  description: string;
  default?: unknown;
}

interface Capability {
  name: string;
  description: string;
  documentation?: string;
  parameters: Parameter[];
  returns?: { type: string; description: string };
}

interface Scopes {
  context?: Record<string, string>;
  signals?: Record<string, string>;
  messages?: Record<string, string>;
}

interface CommandResult {
  text?: string | null;
  data?: unknown;
  error?: string | null;
}

interface InterfaceConfig {
  gateway: string;
  daemonHost: string;
}

interface Poll {
  /** Human-readable name used in log output. */
  name: string;
  /** Interval in milliseconds. Use seconds(), minutes(), hours(), days(). */
  every: number;
  /** Async function called on each tick. Must not throw. */
  run: () => Promise<void>;
}

// ── Interval Helpers ──────────────────────────────────────────────────────────

/** Convert seconds to milliseconds for use in Poll.every. */
export function seconds(n: number): number {
  return n * 1_000;
}

/** Convert minutes to milliseconds for use in Poll.every. */
export function minutes(n: number): number {
  return n * 60_000;
}

/** Convert hours to milliseconds for use in Poll.every. */
export function hours(n: number): number {
  return n * 3_600_000;
}

/** Convert days to milliseconds for use in Poll.every. */
export function days(n: number): number {
  return n * 86_400_000;
}

// ── CLI Arguments ─────────────────────────────────────────────────────────────

function parseArgs(): { gateway: string; port: number; dataDir: string } {
  const args: Record<string, string> = {};
  for (const arg of Deno.args) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key && value !== undefined) args[key] = value;
  }

  const gateway = args["gateway"];
  if (!gateway) {
    console.error("[fatal] --gateway is required");
    Deno.exit(1);
  }

  return {
    gateway: gateway.replace(/\/$/, ""),
    port: parseInt(args["port"] ?? "4001", 10),
    dataDir: args["data-dir"] ?? "./data",
  };
}

// ── Gateway Client ─────────────────────────────────────────────────────────────

let _gateway = "";

/**
 * Push a signal to Chalie's world state.
 *
 * Signals are passive background knowledge — zero LLM cost. Use them for
 * periodic updates, status snapshots, or any information Chalie should be
 * aware of but doesn't need to act on immediately.
 *
 * The gateway enforces your declared signal scopes. If the signal type is not
 * in your SCOPES.signals declaration, or if the user denied it, the call
 * returns false silently. Design your polls to handle this gracefully.
 *
 * @param signalType      Category string matching a key in SCOPES.signals.
 * @param content         Human-readable description of the signal.
 * @param activationEnergy Salience weight 0.0–1.0. Higher values stay visible
 *                        longer in world state. Use low values (0.1–0.3) for
 *                        routine updates, higher (0.6–0.9) for notable events.
 * @param metadata        Optional structured data attached to the signal.
 * @returns               true if the signal was accepted, false if denied or failed.
 */
async function sendSignal(
  signalType: string,
  content: string,
  activationEnergy = 0.5,
  metadata: Record<string, unknown> | null = null,
): Promise<boolean> {
  try {
    const resp = await fetch(`${_gateway}/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signal_type: signalType,
        content,
        activation_energy: activationEnergy,
        metadata,
      }),
    });
    if (resp.status === 403) {
      console.log(`[signal] '${signalType}' denied by scope — skipping`);
      return false;
    }
    return resp.status === 202;
  } catch (e) {
    console.warn(`[signal] push failed: ${(e as Error).message}`);
    return false;
  }
}

/**
 * Push a message to Chalie's reasoning loop.
 *
 * Messages are direct communication — Chalie reasons about them and may
 * surface them to the user. Each message costs LLM tokens and can interrupt
 * the user. Use sparingly, only for genuinely actionable or time-sensitive
 * information.
 *
 * The gateway enforces your declared message scopes. Undeclared or denied
 * message topics return false silently.
 *
 * Before calling this, consider checking the user's attention state:
 *
 *   const ctx = await getContext();
 *   if (ctx.attention === "focused") {
 *     // Downgrade to signal — don't interrupt focused work
 *     await sendSignal("my_type", content, 0.4);
 *     return;
 *   }
 *   await sendMessage(content, "my_topic");
 *
 * @param text     The message content. Write it as a complete, standalone
 *                 sentence or paragraph — Chalie will read it directly.
 * @param topic    Optional topic hint matching a key in SCOPES.messages.
 *                 Used for scope enforcement and routing.
 * @param metadata Optional structured context attached to the message.
 * @returns        true if the message was accepted, false if denied or failed.
 */
async function sendMessage(
  text: string,
  topic: string | null = null,
  metadata: Record<string, unknown> | null = null,
): Promise<boolean> {
  try {
    const resp = await fetch(`${_gateway}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, topic, metadata }),
    });
    if (resp.status === 403) {
      console.log(`[message] topic '${topic}' denied by scope — skipping`);
      return false;
    }
    return resp.status === 202;
  } catch (e) {
    console.warn(`[message] push failed: ${(e as Error).message}`);
    return false;
  }
}

/**
 * Get the user's current context from the gateway.
 *
 * Returns a `ContextResult` accessor. Call `.get(CONSTANTS.SCOPES.*)` to read
 * a field — the return type is inferred from the scope key you pass.
 *
 * Fields the user denied are absent (`.get()` returns `undefined`).
 * Always handle undefined gracefully:
 *
 *   const ctx = await getContext();
 *   const location = ctx.get(CONSTANTS.SCOPES.LOCATION);
 *   const city = location?.name ?? "your location";  // ✓
 *   const city = location!.name;                     // ✗ may throw
 *
 * This function is safe to call frequently — the gateway caches the response
 * and the round-trip is local. It will never throw; on any error it returns
 * an empty context (all `.get()` calls return `undefined`).
 *
 * @returns ContextResult with typed `.get()` accessor.
 */
async function getContext(): Promise<ContextResult> {
  try {
    const resp = await fetch(`${_gateway}/context`);
    if (resp.ok) return new ContextResult(await resp.json());
  } catch (e) {
    console.warn(`[context] fetch failed: ${(e as Error).message}`);
  }
  return new ContextResult({});
}

// ── Poll Scheduler ─────────────────────────────────────────────────────────────

function startPolls(polls: Poll[]): void {
  for (const poll of polls) {
    const run = async () => {
      try {
        await poll.run();
      } catch (e) {
        console.warn(`[poll:${poll.name}] error: ${(e as Error).message}`);
      }
    };

    // Fire immediately on start, then on the declared interval.
    run();
    setInterval(run, poll.every);
    console.log(
      `[poll] '${poll.name}' scheduled every ${poll.every / 1000}s`,
    );
  }
}

// ── HTTP Server ────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleRequest(
  req: Request,
  port: number,
  gateway: string,
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  // Health check — called by the dashboard every 30 seconds.
  if (path === "/health") {
    return jsonResponse({ status: "ok", name: NAME, version: VERSION });
  }

  // Capabilities — read once at install, then periodically to detect updates.
  if (path === "/capabilities") {
    return jsonResponse(CAPABILITIES);
  }

  // Meta — interface identity and scope declarations.
  if (path === "/meta") {
    return jsonResponse({
      name: NAME,
      version: VERSION,
      description: DESCRIPTION,
      author: AUTHOR,
      scopes: SCOPES,
    });
  }

  // Execute — Chalie invokes a capability from its reasoning loop.
  if (path === "/execute" && req.method === "POST") {
    let body: { capability?: string; params?: Record<string, unknown> };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ text: null, data: null, error: "Invalid JSON body" });
    }

    const capability = body.capability ?? "";
    const params = body.params ?? {};

    try {
      const result = await executeCommand(capability, params);
      // Always return 200 — Chalie reads the error field, not the HTTP status.
      return jsonResponse({
        text: result.text ?? null,
        data: result.data ?? null,
        error: result.error ?? null,
      });
    } catch (e) {
      // Catch any exception that escaped executeCommand (it shouldn't, but
      // belt-and-suspenders). Always return 200 so Chalie gets the error text.
      return jsonResponse({
        text: null,
        data: null,
        error: `Unhandled error in executeCommand: ${(e as Error).message}`,
      });
    }
  }

  // Interface widget — injected into the dashboard when the user opens your interface.
  // Returns an HTML fragment (a single root <div>), not a full document.
  if (path === "/" || path === "/index.html") {
    const config: InterfaceConfig = {
      gateway,
      daemonHost: `http://localhost:${port}`,
    };
    const fragment = renderInterface(config);
    return new Response(fragment, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return new Response("Not found", { status: 404 });
}

// ── Entry Point ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { gateway, port, dataDir } = parseArgs();

  _gateway = gateway;

  await Deno.mkdir(dataDir, { recursive: true });

  startPolls(POLLS);

  console.log(`[${NAME}] v${VERSION} starting on port ${port}`);
  console.log(`[${NAME}] gateway: ${gateway}`);

  Deno.serve({ port }, (req) => handleRequest(req, port, gateway));
}

main();
