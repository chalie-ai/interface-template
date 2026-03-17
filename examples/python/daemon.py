"""
Chalie Interface Daemon — Python Example

A minimal HTTP server implementing the Chalie interface contract.
Replace the echo capability with your own business logic.

Usage:
    pip install flask requests
    python daemon.py --chalie-host=http://localhost:8081 --access-key=abc123 --port=4001 --data-dir=./data
"""

import argparse
import json
import logging
import os
import threading
import time

from flask import Flask, jsonify, request, send_from_directory

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("interface")

# ---------------------------------------------------------------------------
# Chalie Client — handles all communication with Chalie backend
# ---------------------------------------------------------------------------

class ChalieClient:
    """Helper for communicating with the Chalie backend."""

    def __init__(self, host: str, access_key: str):
        self.host = host.rstrip("/")
        self.access_key = access_key

    def _headers(self):
        return {"Authorization": f"Bearer {self.access_key}", "Content-Type": "application/json"}

    def push_signal(self, signal_type: str, content: str, activation_energy: float = 0.5, metadata: dict = None):
        """Push a signal to Chalie's world state (zero LLM cost)."""
        import requests
        try:
            resp = requests.post(
                f"{self.host}/api/signals",
                json={
                    "signal_type": signal_type,
                    "content": content,
                    "source": INTERFACE_ID,
                    "activation_energy": activation_energy,
                    "metadata": metadata,
                },
                headers=self._headers(),
                timeout=10,
            )
            logger.debug("Signal pushed: %s (status=%d)", signal_type, resp.status_code)
        except Exception as e:
            logger.warning("Failed to push signal: %s", e)

    def push_message(self, text: str, topic: str = None, metadata: dict = None):
        """Push a message to Chalie's reasoning loop (costs LLM tokens)."""
        import requests
        try:
            resp = requests.post(
                f"{self.host}/api/messages",
                json={
                    "text": text,
                    "source": INTERFACE_ID,
                    "topic": topic,
                    "metadata": metadata,
                },
                headers=self._headers(),
                timeout=10,
            )
            logger.debug("Message pushed (status=%d)", resp.status_code)
        except Exception as e:
            logger.warning("Failed to push message: %s", e)

    def get_context(self) -> dict:
        """Get the user's current context (location, timezone, device)."""
        import requests
        try:
            resp = requests.get(
                f"{self.host}/api/query/context",
                headers=self._headers(),
                timeout=10,
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            logger.warning("Failed to get context: %s", e)
        return {}


# ---------------------------------------------------------------------------
# Interface Configuration — CHANGE THESE for your interface
# ---------------------------------------------------------------------------

INTERFACE_ID = "example"
INTERFACE_NAME = "Example Interface"
INTERFACE_VERSION = "1.0.0"
INTERFACE_DESCRIPTION = "A skeleton interface — replace with your own logic"
INTERFACE_AUTHOR = "Your Name"

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
            }
        ],
        "returns": {"type": "object", "description": "The echoed text"},
    },
]

SIGNALS = ["example_update"]

CONFIG_SCHEMA = {
    "api_key": {"type": "string", "required": False, "label": "External API Key"},
}


# ---------------------------------------------------------------------------
# Capability Handlers — REPLACE THESE with your business logic
# ---------------------------------------------------------------------------

def handle_echo(params: dict, chalie: ChalieClient) -> dict:
    """Example capability handler. Replace with your logic."""
    text = params.get("text", "")
    return {
        "text": f"Echo: {text}",
        "data": {"original": text, "length": len(text)},
        "error": None,
    }


# Map capability names to handler functions
HANDLERS = {
    "echo": handle_echo,
}


# ---------------------------------------------------------------------------
# Background Worker — REPLACE with your polling/monitoring logic
# ---------------------------------------------------------------------------

def background_worker(chalie: ChalieClient, data_dir: str):
    """
    Self-managed background loop. Runs on its own schedule.
    Replace with your own polling logic (weather checks, inbox monitoring, etc.)
    """
    logger.info("Background worker started")
    while True:
        try:
            # Example: get user context and push a signal
            ctx = chalie.get_context()
            location = ctx.get("location", {}).get("name", "unknown")

            chalie.push_signal(
                signal_type="example_update",
                content=f"Example interface is running. User location: {location}",
                activation_energy=0.2,
            )
            logger.info("Background signal pushed")
        except Exception as e:
            logger.warning("Background worker error: %s", e)

        time.sleep(3600)  # Your schedule — change as needed


# ---------------------------------------------------------------------------
# HTTP Server — implements the Chalie interface contract
# ---------------------------------------------------------------------------

app = Flask(__name__)

# Resolved at startup from CLI args
chalie_client: ChalieClient = None
data_dir: str = None
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")


@app.route("/health")
def health():
    return jsonify({"status": "ok", "name": INTERFACE_NAME, "version": INTERFACE_VERSION})


@app.route("/capabilities")
def capabilities():
    return jsonify(CAPABILITIES)


@app.route("/meta")
def meta():
    return jsonify({
        "id": INTERFACE_ID,
        "name": INTERFACE_NAME,
        "version": INTERFACE_VERSION,
        "description": INTERFACE_DESCRIPTION,
        "author": INTERFACE_AUTHOR,
        "signals": SIGNALS,
        "config_schema": CONFIG_SCHEMA,
    })


@app.route("/execute", methods=["POST"])
def execute():
    body = request.get_json(silent=True) or {}
    capability = body.get("capability", "")
    params = body.get("params", {})

    handler = HANDLERS.get(capability)
    if not handler:
        return jsonify({"text": None, "data": None, "error": f"Unknown capability: {capability}"}), 404

    try:
        result = handler(params, chalie_client)
        return jsonify(result)
    except Exception as e:
        logger.error("Execute error for %s: %s", capability, e, exc_info=True)
        return jsonify({"text": None, "data": None, "error": str(e)}), 500


@app.route("/index.html")
def frontend_index():
    return send_from_directory(frontend_dir, "index.html")


@app.route("/bundle.js")
def frontend_bundle():
    return send_from_directory(frontend_dir, "bundle.js")


@app.route("/icon.png")
def frontend_icon():
    return send_from_directory(frontend_dir, "icon.png")


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

def main():
    global chalie_client, data_dir

    parser = argparse.ArgumentParser(description=f"{INTERFACE_NAME} — Chalie Interface Daemon")
    parser.add_argument("--chalie-host", required=True, help="Chalie backend URL")
    parser.add_argument("--access-key", required=True, help="Chalie access key")
    parser.add_argument("--port", type=int, default=4001, help="Port for this daemon")
    parser.add_argument("--data-dir", default="./data", help="Persistent data directory")
    args = parser.parse_args()

    data_dir = args.data_dir
    os.makedirs(data_dir, exist_ok=True)

    chalie_client = ChalieClient(args.chalie_host, args.access_key)

    # Start background worker
    worker = threading.Thread(target=background_worker, args=(chalie_client, data_dir), daemon=True)
    worker.start()

    logger.info("Starting %s on port %d", INTERFACE_NAME, args.port)
    app.run(host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
