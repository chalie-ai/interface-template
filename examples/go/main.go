// Chalie Interface Daemon — Go Example
//
// A minimal HTTP server implementing the Chalie interface contract.
// Replace the echo capability with your own business logic.
//
// Usage:
//   go build -o daemon .
//   ./daemon --chalie-host=http://localhost:8081 --access-key=abc123 --port=4001 --data-dir=./data

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
// Chalie Client — handles all communication with Chalie backend
// ---------------------------------------------------------------------------

type ChalieClient struct {
	Host      string
	AccessKey string
}

func (c *ChalieClient) headers() map[string]string {
	return map[string]string{
		"Authorization": "Bearer " + c.AccessKey,
		"Content-Type":  "application/json",
	}
}

func (c *ChalieClient) doJSON(method, path string, body interface{}) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, c.Host+path, reader)
	if err != nil {
		return nil, err
	}
	for k, v := range c.headers() {
		req.Header.Set(k, v)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	return client.Do(req)
}

// PushSignal sends a signal to Chalie's world state (zero LLM cost).
func (c *ChalieClient) PushSignal(signalType, content string, energy float64, metadata map[string]interface{}) {
	payload := map[string]interface{}{
		"signal_type":       signalType,
		"content":           content,
		"source":            InterfaceID,
		"activation_energy": energy,
		"metadata":          metadata,
	}
	resp, err := c.doJSON("POST", "/api/signals", payload)
	if err != nil {
		log.Printf("Failed to push signal: %v", err)
		return
	}
	resp.Body.Close()
	log.Printf("Signal pushed: %s (status=%d)", signalType, resp.StatusCode)
}

// PushMessage sends a message to Chalie's reasoning loop (costs LLM tokens).
func (c *ChalieClient) PushMessage(text string, topic string, metadata map[string]interface{}) {
	payload := map[string]interface{}{
		"text":     text,
		"source":   InterfaceID,
		"topic":    topic,
		"metadata": metadata,
	}
	resp, err := c.doJSON("POST", "/api/messages", payload)
	if err != nil {
		log.Printf("Failed to push message: %v", err)
		return
	}
	resp.Body.Close()
}

// GetContext returns the user's current context (location, timezone, device).
func (c *ChalieClient) GetContext() map[string]interface{} {
	resp, err := c.doJSON("GET", "/api/query/context", nil)
	if err != nil {
		log.Printf("Failed to get context: %v", err)
		return nil
	}
	defer resp.Body.Close()
	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	return result
}

// ---------------------------------------------------------------------------
// Capability Handlers — REPLACE THESE with your business logic
// ---------------------------------------------------------------------------

func handleEcho(params map[string]interface{}, chalie *ChalieClient) map[string]interface{} {
	text, _ := params["text"].(string)
	return map[string]interface{}{
		"text":  fmt.Sprintf("Echo: %s", text),
		"data":  map[string]interface{}{"original": text, "length": len(text)},
		"error": nil,
	}
}

var handlers = map[string]func(map[string]interface{}, *ChalieClient) map[string]interface{}{
	"echo": handleEcho,
}

// ---------------------------------------------------------------------------
// Background Worker — REPLACE with your polling/monitoring logic
// ---------------------------------------------------------------------------

func backgroundWorker(chalie *ChalieClient, dataDir string) {
	log.Println("Background worker started")
	for {
		ctx := chalie.GetContext()
		location := "unknown"
		if ctx != nil {
			if loc, ok := ctx["location"].(map[string]interface{}); ok {
				if name, ok := loc["name"].(string); ok {
					location = name
				}
			}
		}
		chalie.PushSignal(
			"example_update",
			fmt.Sprintf("Example interface is running. User location: %s", location),
			0.2,
			nil,
		)
		time.Sleep(1 * time.Hour) // Your schedule — change as needed
	}
}

// ---------------------------------------------------------------------------
// HTTP Server — implements the Chalie interface contract
// ---------------------------------------------------------------------------

func main() {
	chalieHost := flag.String("chalie-host", "", "Chalie backend URL")
	accessKey := flag.String("access-key", "", "Chalie access key")
	port := flag.Int("port", 4001, "Port for this daemon")
	dataDir := flag.String("data-dir", "./data", "Persistent data directory")
	flag.Parse()

	if *chalieHost == "" || *accessKey == "" {
		log.Fatal("--chalie-host and --access-key are required")
	}
	os.MkdirAll(*dataDir, 0755)

	chalie := &ChalieClient{Host: *chalieHost, AccessKey: *accessKey}

	// Resolve frontend directory (relative to examples/)
	frontendDir := filepath.Join("..", "..", "frontend")

	// Start background worker
	go backgroundWorker(chalie, *dataDir)

	// Routes
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{
			"status": "ok", "name": InterfaceName, "version": InterfaceVersion,
		})
	})

	http.HandleFunc("/capabilities", func(w http.ResponseWriter, r *http.Request) {
		caps := []map[string]interface{}{
			{
				"name":        "echo",
				"description": "Echo back the input text (demo capability)",
				"parameters": []map[string]interface{}{
					{"name": "text", "type": "string", "required": true, "description": "Text to echo back"},
				},
				"returns": map[string]string{"type": "object", "description": "The echoed text"},
			},
		}
		json.NewEncoder(w).Encode(caps)
	})

	http.HandleFunc("/meta", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":            InterfaceID,
			"name":          InterfaceName,
			"version":       InterfaceVersion,
			"description":   InterfaceDesc,
			"author":        InterfaceAuthor,
			"signals":       []string{"example_update"},
			"config_schema": map[string]interface{}{},
		})
	})

	http.HandleFunc("/execute", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Capability string                 `json:"capability"`
			Params     map[string]interface{} `json:"params"`
		}
		json.NewDecoder(r.Body).Decode(&body)

		handler, ok := handlers[body.Capability]
		if !ok {
			w.WriteHeader(404)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"text": nil, "data": nil, "error": "Unknown capability: " + body.Capability,
			})
			return
		}
		result := handler(body.Params, chalie)
		json.NewEncoder(w).Encode(result)
	})

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
