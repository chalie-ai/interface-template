"""
Chalie Interface Daemon — Python Example

A minimal HTTP server implementing the Chalie interface contract.
Replace the echo capability with your own business logic.

Usage:
    pip install flask requests
    python daemon.py --gateway=http://localhost:3000 --port=4001 --data-dir=./data
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
# Gateway Client — handles all communication with Chalie via dashboard gateway
# ---------------------------------------------------------------------------

class GatewayClient:
    """Communicates with Chalie through the dashboard gateway.

    The gateway handles all authentication and scope enforcement.
    Your daemon never sees Chalie's host, port, or access key.
    """

    def __init__(self, gateway_url: str):
        self.gateway = gateway_url.rstrip("/")

    def push_signal(self, signal_type: str, content: str, activation_energy: float = 0.5, metadata: dict = None):
        """Push a signal to world state (zero LLM cost). Scope-gated by gateway."""
        import requests
        try:
            resp = requests.post(
                f"{self.gateway}/signals",
                json={
                    "signal_type": signal_type,
                    "content": content,
                    "activation_energy": activation_energy,
                    "metadata": metadata,
                },
                timeout=10,
            )
            if resp.status_code == 403:
                logger.info("Signal '%s' denied by scope — skipping", signal_type)
                return
            logger.debug("Signal pushed: %s (status=%d)", signal_type, resp.status_code)
        except Exception as e:
            logger.warning("Failed to push signal: %s", e)

    def push_message(self, text: str, topic: str = None, metadata: dict = None):
        """Push a message to reasoning loop (costs LLM tokens). Scope-gated by gateway."""
        import requests
        try:
            resp = requests.post(
                f"{self.gateway}/messages",
                json={"text": text, "topic": topic, "metadata": metadata},
                timeout=10,
            )
            if resp.status_code == 403:
                logger.info("Message denied by scope — skipping")
                return
            logger.debug("Message pushed (status=%d)", resp.status_code)
        except Exception as e:
            logger.warning("Failed to push message: %s", e)

    def get_context(self) -> dict:
        """Get user context (location, timezone, device). Filtered by approved scopes."""
        import requests
        try:
            resp = requests.get(f"{self.gateway}/context", timeout=10)
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

META = {
    "id": INTERFACE_ID,
    "name": INTERFACE_NAME,
    "version": INTERFACE_VERSION,
    "description": INTERFACE_DESCRIPTION,
    "author": INTERFACE_AUTHOR,
    "scopes": {
        "context": {
            "location": "Used to personalize responses based on your city",
            "timezone": "Used to display times in your local zone",
        },
        "signals": {
            "example_update": "Periodic status updates added to Chalie's awareness",
        },
        "messages": {},
    },
}


# ---------------------------------------------------------------------------
# Capability Handlers — REPLACE THESE with your business logic
# ---------------------------------------------------------------------------

def handle_echo(params: dict, gateway: GatewayClient) -> dict:
    """Example capability handler. Replace with your logic."""
    text = params.get("text", "")
    return {
        "text": f"Echo: {text}",
        "data": {"original": text, "length": len(text)},
        "error": None,
    }


HANDLERS = {
    "echo": handle_echo,
}


# ---------------------------------------------------------------------------
# Background Worker — REPLACE with your polling/monitoring logic
# ---------------------------------------------------------------------------

def background_worker(gateway: GatewayClient, data_dir: str):
    """Self-managed background loop. Runs on its own schedule.

    Replace with your own logic (weather checks, inbox monitoring, etc.)
    Handle denied scopes gracefully — if context is missing fields, adapt.
    """
    logger.info("Background worker started")
    while True:
        try:
            ctx = gateway.get_context()

            # Location may be missing if user denied the scope
            location = ctx.get("location", {}).get("name") if ctx.get("location") else None

            if location:
                content = f"Example running. User location: {location}"
            else:
                content = "Example running. Location not available."

            gateway.push_signal(
                signal_type="example_update",
                content=content,
                activation_energy=0.2,
            )
        except Exception as e:
            logger.warning("Background worker error: %s", e)

        time.sleep(3600)  # Your schedule — change as needed


# ---------------------------------------------------------------------------
# HTTP Server — implements the Chalie interface contract
# ---------------------------------------------------------------------------

app = Flask(__name__)

gateway_client: GatewayClient = None
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
    return jsonify(META)


@app.route("/execute", methods=["POST"])
def execute():
    body = request.get_json(silent=True) or {}
    capability = body.get("capability", "")
    params = body.get("params", {})

    handler = HANDLERS.get(capability)
    if not handler:
        return jsonify({"text": None, "data": None, "error": f"Unknown capability: {capability}"}), 404

    try:
        result = handler(params, gateway_client)
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
    global gateway_client, data_dir

    parser = argparse.ArgumentParser(description=f"{INTERFACE_NAME} — Chalie Interface Daemon")
    parser.add_argument("--gateway", required=True, help="Dashboard gateway URL")
    parser.add_argument("--port", type=int, default=4001, help="Port for this daemon")
    parser.add_argument("--data-dir", default="./data", help="Persistent data directory")
    args = parser.parse_args()

    data_dir = args.data_dir
    os.makedirs(data_dir, exist_ok=True)

    gateway_client = GatewayClient(args.gateway)

    worker = threading.Thread(target=background_worker, args=(gateway_client, data_dir), daemon=True)
    worker.start()

    logger.info("Starting %s on port %d", INTERFACE_NAME, args.port)
    app.run(host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
