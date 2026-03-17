/**
 * Chalie Interface Daemon — TypeScript Template
 *
 * This file is your entire interface. Fill in the six sections below, then
 * compile to a self-contained binary:
 *
 *   deno task compile:linux    → dist/daemon-linux-x64
 *   deno task compile:mac-arm  → dist/daemon-mac-arm64
 *   deno task compile:windows  → dist/daemon-windows-x64.exe
 *
 * Or push a version tag (v1.2.3) to trigger the GitHub Actions release
 * workflow, which cross-compiles all four targets automatically.
 *
 * @module
 */

import {
  createDaemon,
  sendSignal,
  sendMessage,
  getContext,
  CONSTANTS,
  hours,
  minutes,
  seconds,
  days,
} from "jsr:@chalie/interface-sdk@1";

import type { CommandResult, Capability, Scopes, Poll } from "jsr:@chalie/interface-sdk@1";

// =============================================================================
// ① IDENTITY
// =============================================================================

const NAME        = "Example Interface";
const VERSION     = "1.0.0";
const DESCRIPTION = "A skeleton interface — replace with your own logic";
const AUTHOR      = "Your Name";

// =============================================================================
// ② SCOPES — Declare what data your interface needs
// =============================================================================
//
// The user approves each scope individually at install time. The gateway
// enforces them — your code never receives data the user didn't approve.
//
// context   Controls which fields getContext().get() returns.
// signals   Signal types you may push via sendSignal(). Undeclared = 403.
// messages  Message topics you may push via sendMessage(). Undeclared = 403.
//
// Every description is shown verbatim on the install screen — be specific:
//   GOOD: "Required for showing weather at your current city"
//   BAD:  "Used by the interface"

const SCOPES: Scopes = {
  context: {
    [CONSTANTS.SCOPES.LOCATION]: "Shows personalised data based on your city",
    [CONSTANTS.SCOPES.TIMEZONE]: "Displays times in your local timezone",
  },
  signals: {
    example_update: "Periodic status updates added to Chalie's awareness",
  },
  messages: {
    // Declare message topics here only if needed. Messages cost LLM tokens
    // and may interrupt the user. Leave empty if signals are sufficient.
    //
    // example_alert: "Important alerts delivered directly to you via chat",
  },
};

// =============================================================================
// ③ CAPABILITIES — Tools Chalie's LLM can invoke
// =============================================================================
//
// Each capability becomes a tool in Chalie's ACT loop. The `description`
// field is shown to the LLM — write it for an LLM reader, not a human.
//
// When triggered, executeCommand() below is called with the capability
// name and the parameters Chalie inferred from the conversation.

const CAPABILITIES: Capability[] = [
  {
    name: "echo",
    description: "Echo back the input text. Use to demonstrate the interface is working.",
    parameters: [
      {
        name: "text",
        type: "string",
        required: true,
        description: "The text to echo back.",
      },
    ],
  },
];

// =============================================================================
// ④ POLLS — Background jobs that run on a schedule
// =============================================================================
//
// Each poll runs independently on its own interval. Use for fetching external
// data and pushing signals or messages.
//
// Helpers: seconds(n), minutes(n), hours(n), days(n)
//
// Polls fire immediately on startup, then repeat on the declared interval.
// Errors are logged and the poll continues — it will never crash the daemon.
//
// Signal vs message:
//   Hourly weather update → signal  (background, not urgent)
//   Severe storm warning  → message (user needs to act)
// Default to signals. Users uninstall noisy interfaces.

const POLLS: Poll[] = [
  {
    name: "hourly-status",
    every: hours(1),
    async run() {
      const location = (await getContext()).get(CONSTANTS.SCOPES.LOCATION);
      const city = location?.name ?? "unknown location";
      await sendSignal("example_update", `Interface running. User is in ${city}.`, 0.2);
    },
  },
];

// =============================================================================
// ⑤ executeCommand() — Handle capability invocations from Chalie
// =============================================================================
//
// Called when the user triggers one of your capabilities. Always return a
// CommandResult — never throw. Chalie reads the `error` field, not HTTP status.
//
// text   Human-readable result Chalie weaves into conversation.
// data   Structured result your renderInterface() can use.
// error  Non-null on failure. null on success.

async function executeCommand(
  capability: string,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  switch (capability) {
    case "echo": {
      const text = (params.text as string) ?? "";
      return { text: `Echo: ${text}`, data: { original: text, length: text.length }, error: null };
    }
    default:
      return { error: `Unknown capability: ${capability}` };
  }
}

// =============================================================================
// ⑥ renderInterface() — Return the HTML widget shown in the dashboard
// =============================================================================
//
// Return a single root <div> with plain HTML tags. The dashboard injects it
// directly into the page. Fetch data server-side here and bake it into the
// returned HTML — no client-side API calls needed.

async function renderInterface(): Promise<string> {
  const location = (await getContext()).get(CONSTANTS.SCOPES.LOCATION);
  return `
<div>
  <h1>${NAME}</h1>
  <p>${DESCRIPTION}</p>
  ${location ? `<p>Hello from ${location.name}</p>` : ""}
</div>`;
}

// =============================================================================
// Start
// =============================================================================

createDaemon({ name: NAME, version: VERSION, description: DESCRIPTION, author: AUTHOR, scopes: SCOPES, capabilities: CAPABILITIES, polls: POLLS, executeCommand, renderInterface });
