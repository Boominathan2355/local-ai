# Local AI Assistant – Electron Desktop Architecture

**Target Machine:** i5-10210U, 12GB RAM
**OS:** Ubuntu 64-bit
**Inference Engine:** llama.cpp (CPU-only)
**Model Size:** 7B–8B (Q4_K_M)

---

# 1. System Architecture

This design builds a fully offline, desktop AI assistant similar to ChatGPT.

## High-Level Flow

```
Electron (Renderer UI)
        ↓ IPC
Electron Main Process
        ↓ HTTP
llama.cpp Server
        ↓
GGUF Model (7B Q4_K_M)
```

---

# 2. Why Electron?

Electron allows you to:

* Build cross-platform desktop apps (Linux, Windows, macOS)
* Bundle local AI runtime
* Provide real-time streaming UI
* Ship a private offline assistant

It is heavier than a web app, but suitable for desktop AI tools.

---

# 3. Component Breakdown

## 3.1 llama.cpp (Inference Engine)

### Responsibilities

* Load GGUF model
* Generate tokens
* Stream responses

### Recommended Launch Command

```
./server -m model.gguf \
  -t 6 \
  -c 2048 \
  -ngl 0
```

### Why These Settings?

| Parameter  | Value  | Reason                     |
| ---------- | ------ | -------------------------- |
| Threads    | 6      | Leave 2 threads free       |
| Context    | 2048   | Safe for 12GB RAM          |
| Quant      | Q4_K_M | Best speed/quality balance |
| GPU Layers | 0      | No GPU available           |

---

## 3.2 Electron Main Process

Responsibilities:

* Start llama.cpp server as child process
* Manage lifecycle
* Handle IPC from renderer
* Forward requests to local LLM server
* Stream tokens back

Example process management (conceptual):

```js
spawn("./server", ["-m", "model.gguf", "-t", "6", "-c", "2048"])
```

Important:

* Kill process on app exit
* Handle crash recovery

---

## 3.3 Renderer Process (UI)

Responsibilities:

* Chat interface
* Streaming token display
* Session history
* System prompt editor
* Token counter

UI Modules:

* Chat Window
* Conversation Sidebar
* Settings Panel
* Model Status Indicator

---

# 4. Project Structure

```
local-ai-app/
│
├── electron/
│   ├── main.js
│   ├── preload.js
│
├── renderer/
│   ├── App.jsx
│   ├── ChatWindow.jsx
│   ├── Sidebar.jsx
│
├── llama/
│   ├── server (compiled binary)
│   ├── models/
│       └── model.gguf
│
├── package.json
└── LOCAL_AI_ELECTRON_ARCHITECTURE.md
```

---

# 5. Conversation Memory Strategy

You cannot send entire history every time.

Use:

* SQLite (local DB)
* Keep last 6–8 exchanges
* Trim to fit 2048 token limit

### Rolling Context Method

1. Save full history locally.
2. Send only:

   * System prompt
   * Recent messages
3. Drop older tokens dynamically.

---

# 6. Streaming Implementation

Use:

* Fetch with ReadableStream
  OR
* Server-Sent Events (SSE)

Streaming improves UX significantly.

Expected on your CPU:

* 12–20 tokens/sec
* First response ~2–4 sec

---

# 7. Optional Advanced Features

## 7.1 RAG (Document Chat)

Add:

```
Document Upload
      ↓
Chunking
      ↓
Embeddings Model (CPU)
      ↓
FAISS Vector Store
      ↓
Top-K Retrieval
      ↓
Prompt Injection
```

Keep embedding model lightweight.

---

## 7.2 System Prompt Editor

Allow:

* Custom assistant personality
* Coding mode
* Debug mode
* Strict reasoning mode

---

## 7.3 Tool Calling (Advanced)

Possible but heavy on CPU.
Recommended only if necessary.

---

# 8. Performance Reality on Your Machine

| Model     | Usability     |
| --------- | ------------- |
| 7B Q4_K_M | Smooth        |
| 8B Q4_K_M | Good          |
| 13B Q4    | Slow          |
| 30B+      | Not practical |

Recommended:
**7B Q4_K_M**

---

# 9. Production Hardening

### Add:

* Process monitoring
* CPU usage guard
* Single active generation limit
* Graceful shutdown
* Crash recovery

---

# 10. Security

* Bind llama.cpp to localhost only
* Disable remote access
* Validate user inputs
* Sanitize document uploads
* Prevent prompt injection in RAG

---

# 11. Packaging

Use Electron Builder:

```
electron-builder --linux
```

Distribute as:

* AppImage
* .deb package

---

# 12. Limitations

This system will NOT match:

* GPT-4 reasoning
* Large enterprise deployments
* 70B model performance

It IS suitable for:

* Personal AI assistant
* Coding helper
* Offline private AI tool
* SaaS prototype

---

# Final Recommendation for Your Hardware

Use:

* llama.cpp
* 7B Q4_K_M model
* 6 threads
* 2048 context
* Electron + React frontend

This configuration is optimal for 12GB RAM CPU-only laptop.

---
