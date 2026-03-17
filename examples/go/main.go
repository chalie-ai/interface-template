// Chalie Interface Daemon — Go Example
//
// A minimal HTTP server implementing the Chalie interface contract.
// Replace the echo capability with your own business logic.
//
// Usage:
//   go build -o daemon .
//   ./daemon --gateway=http://localhost:3000 --port=4001 --data-dir=./data

package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

// ---------------------------------------------------------------------------
// Interface Configuration — CHANGE THESE for your interface
// ---------------------------------------------------------------------------

const (
	InterfaceID      = "example"
	InterfaceName    = "Example Interface"
	InterfaceVersion = "1.0.0"
	InterfaceDesc    = "A skeleton interface — replace with your own logic"
	InterfaceAuthor  = "Your Name"
)

// ---------------------------------------------------------------------------
// Gateway Client — communicates with Chalie via dashboard gateway
// ---------------------------------------------------------------------------

type GatewayClient struct {
	GatewayURL string
}

func (g *GatewayClient) postJSON(path string, body interface{}) (*http.Response, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest("POST", g.GatewayURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return (&http.Client{Timeout: 10 * time.Second}).Do(req)
}

func (g *GatewayClient) getJSON(path string) (map[string]interface{}, error) {
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Get(g.GatewayURL + path)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result, nil
}

// PushSignal sends a signal to world state (zero LLM cost). Scope-gated.
func (g *GatewayClient) PushSignal(signalType, content string, energy float64, metadata map[string]interface{}) {
	resp, err := g.postJSON("/signals", map[string]interface{}{
		"signal_type":       signalType,
		"content":           content,
		"activation_energy": energy,
		"metadata":          metadata,
	})
	if err != nil {
		log.Printf("Failed to push signal: %v", err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode == 403 {
		log.Printf("Signal '%s' denied by scope — skipping", signalType)
		return
	}
	log.Printf("Signal pushed: %s (status=%d)", signalType, resp.StatusCode)
}

// PushMessage sends a message to reasoning loop (costs tokens). Scope-gated.
func (g *GatewayClient) PushMessage(text, topic string, metadata map[string]interface{}) {
	resp, err := g.postJSON("/messages", map[string]interface{}{
		"text": text, "topic": topic, "metadata": metadata,
	})
	if err != nil {
		log.Printf("Failed to push message: %v", err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode == 403 {
		log.Printf("Message denied by scope — skipping")
	}
}

// GetContext returns user context filtered by approved scopes.
func (g *GatewayClient) GetContext() map[string]interface{} {
	result, err := g.getJSON("/context")
	if err != nil {
		log.Printf("Failed to get context: %v", err)
		return nil
	}
	return result
}

// ---------------------------------------------------------------------------
// Capability Handlers — REPLACE THESE with your business logic
// ---------------------------------------------------------------------------

func handleEcho(params map[string]interface{}, _ *GatewayClient) map[string]interface{} {
	text, _ := params["text"].(string)
	return map[string]interface{}{
		"text":  fmt.Sprintf("Echo: %s", text),
		"data":  map[string]interface{}{"original": text, "length": len(text)},
		"error": nil,
	}
}

var handlers = map[string]func(map[string]interface{}, *GatewayClient) map[string]interface{}{
	"echo": handleEcho,
}

// ---------------------------------------------------------------------------
// Background Worker — REPLACE with your polling/monitoring logic
// ---------------------------------------------------------------------------

func backgroundWorker(gw *GatewayClient, dataDir string) {
	log.Println("Background worker started")
	for {
		ctx := gw.GetContext()
		location := "not available"
		if ctx != nil {
			if loc, ok := ctx["location"].(map[string]interface{}); ok {
				if name, ok := loc["name"].(string); ok {
					location = name
				}
			}
		}

		content := fmt.Sprintf("Example running. User location: %s", location)
		gw.PushSignal("example_update", content, 0.2, nil)

		time.Sleep(1 * time.Hour) // Your schedule — change as needed
	}
}

// ---------------------------------------------------------------------------
// HTTP Server — implements the Chalie interface contract
// ---------------------------------------------------------------------------

func main() {
	gatewayURL := flag.String("gateway", "", "Dashboard gateway URL")
	port := flag.Int("port", 4001, "Port for this daemon")
	dataDir := flag.String("data-dir", "./data", "Persistent data directory")
	flag.Parse()

	if *gatewayURL == "" {
		log.Fatal("--gateway is required")
	}
	os.MkdirAll(*dataDir, 0755)

	gw := &GatewayClient{GatewayURL: *gatewayURL}
	frontendDir := filepath.Join("..", "..", "frontend")

	go backgroundWorker(gw, *dataDir)

	// Health
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status": "ok", "name": InterfaceName, "version": InterfaceVersion,
		})
	})

	// Capabilities
	http.HandleFunc("/capabilities", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]map[string]interface{}{
			{
				"name":        "echo",
				"description": "Echo back the input text (demo capability)",
				"parameters": []map[string]interface{}{
					{"name": "text", "type": "string", "required": true, "description": "Text to echo back"},
				},
				"returns": map[string]string{"type": "object", "description": "The echoed text"},
			},
		})
	})

	// Meta
	http.HandleFunc("/meta", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id": InterfaceID, "name": InterfaceName, "version": InterfaceVersion,
			"description": InterfaceDesc, "author": InterfaceAuthor,
			"scopes": map[string]interface{}{
				"context":  map[string]string{"location": "Used to personalize responses", "timezone": "Display times correctly"},
				"signals":  map[string]string{"example_update": "Periodic status updates"},
				"messages": map[string]string{},
			},
		})
	})

	// Execute
	http.HandleFunc("/execute", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Capability string                 `json:"capability"`
			Params     map[string]interface{} `json:"params"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		w.Header().Set("Content-Type", "application/json")

		fn, ok := handlers[body.Capability]
		if !ok {
			// Always return 200 — Chalie reads the error field, not the HTTP status.
			json.NewEncoder(w).Encode(map[string]interface{}{
				"text": nil, "data": nil, "error": "Unknown capability: " + body.Capability,
			})
			return
		}

		// Recover from panics so a bad handler doesn't crash the daemon.
		func() {
			defer func() {
				if r := recover(); r != nil {
					json.NewEncoder(w).Encode(map[string]interface{}{
						"text": nil, "data": nil, "error": fmt.Sprintf("handler panicked: %v", r),
					})
				}
			}()
			json.NewEncoder(w).Encode(fn(body.Params, gw))
		}()
	})

	// Frontend
	http.HandleFunc("/index.html", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(frontendDir, "index.html"))
	})
	http.HandleFunc("/bundle.js", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(frontendDir, "bundle.js"))
	})
	http.HandleFunc("/icon.png", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(frontendDir, "icon.png"))
	})

	addr := fmt.Sprintf("0.0.0.0:%d", *port)
	log.Printf("Starting %s on %s", InterfaceName, addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}
