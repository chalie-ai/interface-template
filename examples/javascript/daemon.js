/**
 * Chalie Interface Daemon — JavaScript Example (Deno)
 *
 * A minimal HTTP server implementing the Chalie interface contract.
 * Replace the echo capability with your own business logic.
 *
 * Usage:
 *   deno run --allow-net --allow-read --allow-write daemon.js \
 *     --gateway=http://localhost:3000 --port=4001 --data-dir=./data
 */

import { parse } from "https://deno.land/std@0.220.0/flags/mod.ts";
import { serve } from "https://deno.land/std@0.220.0/http/server.ts";
import { serveFile } from "https://deno.land/std@0.220.0/http/file_server.ts";
import { join } from "https://deno.land/std@0.220.0/path/mod.ts";

// ---------------------------------------------------------------------------
// Interface Configuration — CHANGE THESE for your interface
// ---------------------------------------------------------------------------

const INTERFACE_ID = "example";
const INTERFACE_NAME = "Example Interface";
const INTERFACE_VERSION = "1.0.0";
const INTERFACE_DESC = "A skeleton interface — replace with your own logic";
const INTERFACE_AUTHOR = "Your Name";

// ---------------------------------------------------------------------------
// Gateway Client — communicates with Chalie via dashboard gateway
// ---------------------------------------------------------------------------

class GatewayClient {
  constructor(gatewayUrl) {
    this.gateway = gatewayUrl.replace(/\/$/, "");
  }

  /** Push a signal to world state (zero LLM cost). Scope-gated. */
  async pushSignal(signalType, content, activationEnergy = 0.5, metadata = null) {
    try {
      const resp = await fetch(`${this.gateway}/signals`, {
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
        console.log(`Signal '${signalType}' denied by scope — skipping`);
        return;
      }
      console.log(`Signal pushed: ${signalType} (status=${resp.status})`);
    } catch (e) {
      console.warn(`Failed to push signal: ${e.message}`);
    }
  }

  /** Push a message to reasoning loop (costs LLM tokens). Scope-gated. */
  async pushMessage(text, topic = null, metadata = null) {
    try {
      const resp = await fetch(`${this.gateway}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, topic, metadata }),
      });
      if (resp.status === 403) {
        console.log("Message denied by scope — skipping");
      }
    } catch (e) {
      console.warn(`Failed to push message: ${e.message}`);
    }
  }

  /** Get user context filtered by approved scopes. */
  async getContext() {
    try {
      const resp = await fetch(`${this.gateway}/context`);
      if (resp.ok) return await resp.json();
    } catch (e) {
      console.warn(`Failed to get context: ${e.message}`);
    }
    return {};
  }
}

// ---------------------------------------------------------------------------
// Capability Handlers — REPLACE THESE with your business logic
// ---------------------------------------------------------------------------

function handleEcho(params, _gw) {
  const text = params.text || "";
  return {
    text: `Echo: ${text}`,
    data: { original: text, length: text.length },
    error: null,
  };
}

const handlers = { echo: handleEcho };

// ---------------------------------------------------------------------------
// Background Worker — REPLACE with your polling/monitoring logic
// ---------------------------------------------------------------------------

async function backgroundWorker(gw, _dataDir) {
  console.log("Background worker started");
  while (true) {
    try {
      const ctx = await gw.getContext();
      const location = ctx?.location?.name || "not available";

      await gw.pushSignal(
        "example_update",
        `Example running. User location: ${location}`,
        0.2,
      );
    } catch (e) {
      console.warn(`Background worker error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 3600_000)); // Your schedule
  }
}

// ---------------------------------------------------------------------------
// HTTP Server — implements the Chalie interface contract
// ---------------------------------------------------------------------------

const args = parse(Deno.args, {
  string: ["gateway", "data-dir"],
  default: { port: 4001, "data-dir": "./data" },
});

if (!args.gateway) {
  console.error("--gateway is required");
  Deno.exit(1);
}

await Deno.mkdir(args["data-dir"], { recursive: true });

const gw = new GatewayClient(args.gateway);
const frontendDir = join(Deno.cwd(), "..", "..", "frontend");

// Start background worker
backgroundWorker(gw, args["data-dir"]);

const capabilities = [
  {
    name: "echo",
    description: "Echo back the input text (demo capability)",
    parameters: [
      { name: "text", type: "string", required: true, description: "Text to echo back" },
    ],
    returns: { type: "object", description: "The echoed text" },
  },
];

const meta = {
  id: INTERFACE_ID,
  name: INTERFACE_NAME,
  version: INTERFACE_VERSION,
  description: INTERFACE_DESC,
  author: INTERFACE_AUTHOR,
  scopes: {
    context: {
      location: "Used to personalize responses based on your city",
      timezone: "Used to display times in your local zone",
    },
    signals: {
      example_update: "Periodic status updates added to Chalie's awareness",
    },
    messages: {},
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handler(req) {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === "/health") return jsonResponse({ status: "ok", name: INTERFACE_NAME, version: INTERFACE_VERSION });
  if (path === "/capabilities") return jsonResponse(capabilities);
  if (path === "/meta") return jsonResponse(meta);

  if (path === "/execute" && req.method === "POST") {
    const body = await req.json();
    const fn = handlers[body.capability];
    if (!fn) return jsonResponse({ text: null, data: null, error: `Unknown capability: ${body.capability}` });
    try {
      return jsonResponse(fn(body.params || {}, gw));
    } catch (e) {
      // Always return 200 — Chalie reads the error field, not the HTTP status.
      return jsonResponse({ text: null, data: null, error: e.message });
    }
  }

  if (["/index.html", "/bundle.js", "/icon.png"].includes(path)) {
    try {
      return await serveFile(req, join(frontendDir, path.slice(1)));
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  return new Response("Not found", { status: 404 });
}

console.log(`Starting ${INTERFACE_NAME} on port ${args.port}`);
serve(handler, { port: args.port });
