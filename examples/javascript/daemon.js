/**
 * Chalie Interface Daemon — JavaScript Example (Deno)
 *
 * A minimal HTTP server implementing the Chalie interface contract.
 * Replace the echo capability with your own business logic.
 *
 * Usage:
 *   deno run --allow-net --allow-read --allow-write daemon.js \
 *     --chalie-host=http://localhost:8081 --access-key=abc123 --port=4001 --data-dir=./data
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
// Chalie Client — handles all communication with Chalie backend
// ---------------------------------------------------------------------------

class ChalieClient {
  constructor(host, accessKey) {
    this.host = host.replace(/\/$/, "");
    this.accessKey = accessKey;
  }

  _headers() {
    return {
      Authorization: `Bearer ${this.accessKey}`,
      "Content-Type": "application/json",
    };
  }

  /** Push a signal to Chalie's world state (zero LLM cost). */
  async pushSignal(signalType, content, activationEnergy = 0.5, metadata = null) {
    try {
      const resp = await fetch(`${this.host}/api/signals`, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify({
          signal_type: signalType,
          content,
          source: INTERFACE_ID,
          activation_energy: activationEnergy,
          metadata,
        }),
      });
      console.log(`Signal pushed: ${signalType} (status=${resp.status})`);
    } catch (e) {
      console.warn(`Failed to push signal: ${e.message}`);
    }
  }

  /** Push a message to Chalie's reasoning loop (costs LLM tokens). */
  async pushMessage(text, topic = null, metadata = null) {
    try {
      await fetch(`${this.host}/api/messages`, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify({ text, source: INTERFACE_ID, topic, metadata }),
      });
    } catch (e) {
      console.warn(`Failed to push message: ${e.message}`);
    }
  }

  /** Get the user's current context (location, timezone, device). */
  async getContext() {
    try {
      const resp = await fetch(`${this.host}/api/query/context`, {
        headers: this._headers(),
      });
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

function handleEcho(params, _chalie) {
  const text = params.text || "";
  return {
    text: `Echo: ${text}`,
    data: { original: text, length: text.length },
    error: null,
  };
}

const handlers = {
  echo: handleEcho,
};

// ---------------------------------------------------------------------------
// Background Worker — REPLACE with your polling/monitoring logic
// ---------------------------------------------------------------------------

async function backgroundWorker(chalie, _dataDir) {
  console.log("Background worker started");
  while (true) {
    try {
      const ctx = await chalie.getContext();
      const location = ctx?.location?.name || "unknown";

      await chalie.pushSignal(
        "example_update",
        `Example interface is running. User location: ${location}`,
        0.2,
      );
      console.log("Background signal pushed");
    } catch (e) {
      console.warn(`Background worker error: ${e.message}`);
    }

    await new Promise((r) => setTimeout(r, 3600_000)); // Your schedule — change as needed
  }
}

// ---------------------------------------------------------------------------
// HTTP Server — implements the Chalie interface contract
// ---------------------------------------------------------------------------

const args = parse(Deno.args, {
  string: ["chalie-host", "access-key", "data-dir"],
  default: { port: 4001, "data-dir": "./data" },
});

if (!args["chalie-host"] || !args["access-key"]) {
  console.error("--chalie-host and --access-key are required");
  Deno.exit(1);
}

await Deno.mkdir(args["data-dir"], { recursive: true });

const chalie = new ChalieClient(args["chalie-host"], args["access-key"]);
const frontendDir = join(Deno.cwd(), "..", "..", "frontend");

// Start background worker
backgroundWorker(chalie, args["data-dir"]);

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
  signals: ["example_update"],
  config_schema: {},
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

  if (path === "/health" && req.method === "GET") {
    return jsonResponse({ status: "ok", name: INTERFACE_NAME, version: INTERFACE_VERSION });
  }

  if (path === "/capabilities" && req.method === "GET") {
    return jsonResponse(capabilities);
  }

  if (path === "/meta" && req.method === "GET") {
    return jsonResponse(meta);
  }

  if (path === "/execute" && req.method === "POST") {
    const body = await req.json();
    const fn = handlers[body.capability];
    if (!fn) {
      return jsonResponse({ text: null, data: null, error: `Unknown capability: ${body.capability}` }, 404);
    }
    try {
      const result = fn(body.params || {}, chalie);
      return jsonResponse(result);
    } catch (e) {
      return jsonResponse({ text: null, data: null, error: e.message }, 500);
    }
  }

  if (path === "/index.html" || path === "/bundle.js" || path === "/icon.png") {
    const filename = path.slice(1);
    try {
      return await serveFile(req, join(frontendDir, filename));
    } catch {
      return new Response("Not found", { status: 404 });
    }
  }

  return new Response("Not found", { status: 404 });
}

console.log(`Starting ${INTERFACE_NAME} on port ${args.port}`);
serve(handler, { port: args.port });
