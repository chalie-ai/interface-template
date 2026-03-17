"""Chalie Interface Daemon — Python Example.

A minimal daemon that implements the Chalie interface contract.
Copy this file, replace the echo handler with your business logic,
and you have a working interface.

Requirements:
    pip install flask requests

Run:
    python daemon.py --gateway=http://localhost:3000 --port=4001 --data-dir=./data
"""

import argparse
import json
import logging
import os
import threading
import time

import requests
from flask import Flask, jsonify, request, send_from_directory

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger("interface")


# =============================================================================
# Gateway Client
# =============================================================================
# Talks to Chalie through the dashboard gateway. The gateway handles auth,
# scope enforcement, and proxying. Your daemon never sees Chalie's real
# host or credentials.
# =============================================================================

class GatewayClient:
    """Client for the dashboard gateway.

    All methods are safe to call even if scopes are denied — denied
    requests return gracefully (empty data or False).

    Args:
        gateway_url: The dashboard gateway URL (e.g. "http://localhost:3000").
    """

    def __init__(self, gateway_url):
        self.url = gateway_url.rstrip("/")

    def push_signal(self, signal_type, content, energy=0.5, metadata=None):
        """Push a signal to Chalie's world state.

        Signals are passive background knowledge (zero LLM cost).
        Use for periodic updates that Chalie should be aware of
        but doesn't need to act on immediately.

        Args:
            signal_type: Category string matching a declared scope
                         (e.g. "forecast_update").
            content: Human-readable description of what happened.
            energy: Salience weight 0.0–1.0. Higher values stay
                    visible longer in world state. Defaults to 0.5.
            metadata: Optional dict of structured data.

        Returns:
            True if accepted, False if denied by scope or failed.
        """
        try:
            r = requests.post(f"{self.url}/signals", json={
                "signal_type": signal_type,
                "content": content,
                "activation_energy": energy,
                "metadata": metadata,
            }, timeout=10)
            if r.status_code == 403:
                log.info("Signal '%s' denied by scope", signal_type)
                return False
            return r.status_code == 202
        except Exception as e:
            log.warning("push_signal failed: %s", e)
            return False

    def push_message(self, text, topic=None, metadata=None):
        """Push a message to Chalie's reasoning loop.

        Messages are direct communication — Chalie will reason about
        them and may surface them to the user. Use sparingly; each
        message costs LLM tokens.

        Args:
            text: The message content.
            topic: Optional topic hint (e.g. "weather").
            metadata: Optional dict of structured context.

        Returns:
            True if accepted, False if denied by scope or failed.
        """
        try:
            r = requests.post(f"{self.url}/messages", json={
                "text": text,
                "topic": topic,
                "metadata": metadata,
            }, timeout=10)
            if r.status_code == 403:
                log.info("Message denied by scope")
                return False
            return r.status_code == 202
        except Exception as e:
            log.warning("push_message failed: %s", e)
            return False

    def get_context(self):
        """Get the user's current context.

        Returns location, timezone, device info, energy level, etc.
        Fields the user denied are omitted from the response.

        Returns:
            Dict with available context fields. May be empty if
            all scopes were denied or the gateway is unreachable.
        """
        try:
            r = requests.get(f"{self.url}/context", timeout=10)
            if r.status_code == 200:
                return r.json()
        except Exception as e:
            log.warning("get_context failed: %s", e)
        return {}


# =============================================================================
# Your Interface — EDIT EVERYTHING BELOW
# =============================================================================

# -- Identity ----------------------------------------------------------------

ID = "example"
NAME = "Example Interface"
VERSION = "1.0.0"
DESCRIPTION = "A skeleton interface — replace with your own logic"
AUTHOR = "Your Name"

# -- Scopes ------------------------------------------------------------------
# Declare what your interface needs. The user approves each one during install.
# Be specific in descriptions — vague text reduces trust.

SCOPES = {
    "context": {
        "location": "Shows personalized data based on your city",
        "timezone": "Displays times in your local zone",
    },
    "signals": {
        "example_update": "Periodic status updates in Chalie's awareness",
    },
    "messages": {
        # Uncomment if your interface needs to send direct messages:
        # "example_alert": "Important alerts delivered to you via chat",
    },
}

# -- Capabilities ------------------------------------------------------------
# Tools that Chalie can invoke. Each needs a handler function below.

CAPABILITIES = [
    {
        "name": "echo",
        "description": "Echo back the input text (demo capability)",
        "parameters": [
            {
                "name": "text",
                "type": "string",
                "required": True,
                "description": "Text to echo back",
            },
        ],
    },
]


# -- Handlers ----------------------------------------------------------------
# One function per capability. Receives params dict + gateway client.
# Return {"text": ..., "data": ..., "error": ...}.

def handle_echo(params, gw):
    """Echo the input text back.

    Args:
        params: {"text": "hello"} — the parameters from Chalie.
        gw: GatewayClient instance for calling the gateway if needed.

    Returns:
        Dict with text (for chat), data (for frontend), error (null on success).
    """
    text = params.get("text", "")
    return {
        "text": f"Echo: {text}",
        "data": {"original": text, "length": len(text)},
        "error": None,
    }


# Map capability names to handler functions.
HANDLERS = {
    "echo": handle_echo,
}


# -- Background Worker -------------------------------------------------------
# Runs on your own schedule. Push signals or messages as needed.
# Handle denied scopes gracefully — missing fields are normal.

def background_worker(gw, data_dir):
    """Periodic background task.

    This example pushes a status signal every hour. Replace with
    your own logic: weather polling, inbox checking, etc.

    Args:
        gw: GatewayClient instance.
        data_dir: Path to your writable data directory.
    """
    log.info("Background worker started")

    while True:
        # Get user context — location may be missing if scope was denied.
        ctx = gw.get_context()
        location_name = None
        if "location" in ctx and ctx["location"]:
            location_name = ctx["location"].get("name")

        if location_name:
            content = f"Example running. User is in {location_name}."
        else:
            content = "Example running. Location not available."

        gw.push_signal("example_update", content, energy=0.2)

        time.sleep(3600)  # Run every hour — set your own schedule.


# =============================================================================
# HTTP Server — you shouldn't need to edit below this line
# =============================================================================

app = Flask(__name__)
_gw = None
_data_dir = None
_frontend_dir = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")


@app.route("/health")
def health():
    """Health check — called by dashboard every 30 seconds."""
    return jsonify({"status": "ok", "name": NAME, "version": VERSION})


@app.route("/capabilities")
def capabilities():
    """Tool definitions — registered with Chalie on install."""
    return jsonify(CAPABILITIES)


@app.route("/meta")
def meta():
    """Interface metadata and scope declarations."""
    return jsonify({
        "id": ID, "name": NAME, "version": VERSION,
        "description": DESCRIPTION, "author": AUTHOR,
        "scopes": SCOPES,
    })


@app.route("/execute", methods=["POST"])
def execute():
    """Capability invocation — called by Chalie's reasoning loop."""
    body = request.get_json(silent=True) or {}
    name = body.get("capability", "")
    params = body.get("params", {})

    handler = HANDLERS.get(name)
    if not handler:
        return jsonify({"text": None, "data": None, "error": f"Unknown capability: {name}"})

    try:
        return jsonify(handler(params, _gw))
    except Exception as e:
        log.error("execute(%s) failed: %s", name, e, exc_info=True)
        # Always return 200 — Chalie reads the error field, not the HTTP status.
        return jsonify({"text": None, "data": None, "error": str(e)})


@app.route("/index.html")
def serve_index():
    """Full-screen app layout — loaded when user opens the interface."""
    return send_from_directory(_frontend_dir, "index.html")


@app.route("/bundle.js")
def serve_bundle():
    """Frontend logic — loaded alongside index.html."""
    return send_from_directory(_frontend_dir, "bundle.js")


@app.route("/icon.png")
def serve_icon():
    """Launcher icon."""
    return send_from_directory(_frontend_dir, "icon.png")


# =============================================================================
# Entry Point
# =============================================================================

def main():
    """Parse args, start background worker, run HTTP server."""
    global _gw, _data_dir

    p = argparse.ArgumentParser(description=f"{NAME} daemon")
    p.add_argument("--gateway", required=True, help="Dashboard gateway URL")
    p.add_argument("--port", type=int, default=4001, help="Daemon port")
    p.add_argument("--data-dir", default="./data", help="Data directory")
    args = p.parse_args()

    _data_dir = args.data_dir
    os.makedirs(_data_dir, exist_ok=True)

    _gw = GatewayClient(args.gateway)

    t = threading.Thread(target=background_worker, args=(_gw, _data_dir), daemon=True)
    t.start()

    log.info("Starting %s on port %d", NAME, args.port)
    app.run(host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
