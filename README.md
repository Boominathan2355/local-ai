# 🤖 Local AI Assistant

**Your Private, Fully Offline Desktop AI Companion.**

Local AI Assistant is a powerful, privacy-first desktop application that brings the power of Large Language Models (LLMs) directly to your machine. It uses `llama.cpp` for high-performance CPU inference, ensuring your conversations stay on your hardware.

> **⚠️ Proprietary Software** — All rights reserved. See [License](#-license) below.

---

## ✨ Key Features

- **🏠 100% Local Inference** — Powered by `llama.cpp`, run GGUF models (7B, 8B, etc.) completely offline on CPU.
- **📚 Model Library** — Download, manage, and switch between multiple GGUF models directly within the app.
- **☁️ Cloud Integration** — Optional support for **OpenAI**, **Anthropic**, and **Google Gemini** for when you need extra reasoning power.
- **🌐 Web Search** — Integrated web search (via **Tavily** or **Serper.dev**) with AI-driven query refinement for up-to-date information.
- **🛠️ MCP Tool System** — Built-in Model Context Protocol tools for file operations, document generation, and terminal access — all with a sandboxed permission system.
- **📄 Document Export** — Export conversations and content to **PDF**, **DOCX**, **PPTX**, **Excel**, and **CSV**.
- **💬 Rich Chat Experience** — Markdown rendering with syntax highlighting, reasoning blocks, streaming responses, message versioning, and conversation management.
- **✏️ Custom System Prompts** — Configure system prompts per conversation for tailored AI behavior.
- **🎨 Premium UI** — A sleek, modern interface built with React and Electron, featuring dark mode, smooth animations, and Space Grotesk typography.
- **🔒 Privacy First** — Your data never leaves your machine unless you explicitly enable cloud models or web search.

---

## 🏗️ Architecture

Local AI Assistant uses a hybrid architecture to balance performance and privacy:

```
┌──────────────────────────────────────────────────┐
│  Renderer (React + TypeScript)                   │
│  ├── Chat Window & Message Bubbles               │
│  ├── Model Library & Switcher                    │
│  ├── MCP Tool Manager & Permission Cards         │
│  ├── Settings Panel & System Prompt Editor       │
│  ├── Sidebar & Conversation Management           │
│  └── Setup Wizard                                │
├──────────────────────────────────────────────────┤
│  Main Process (Electron + Node.js)               │
│  ├── IPC Handlers (Secure Channels)              │
│  ├── Cloud Model Service (OpenAI/Anthropic/Gemini)│
│  ├── Download Service (Model Management)         │
│  ├── Search Service (Tavily/Serper.dev)           │
│  ├── MCP Tools (File/Document/Terminal)          │
│  ├── Storage Service (SQLite/Settings)           │
│  └── Filesystem Service (Sandboxed Access)       │
├──────────────────────────────────────────────────┤
│  Local Engine (llama.cpp)                        │
│  └── llama-server (GGUF Model Inference)         │
└──────────────────────────────────────────────────┘
```

---

## 🛠️ Technology Stack

| Layer        | Technologies                                              |
|--------------|-----------------------------------------------------------|
| **Frontend** | React 18, TypeScript, Vite, Lucide Icons, Space Grotesk   |
| **Backend**  | Electron 33, Node.js, electron-vite                       |
| **Inference**| llama.cpp (GGUF support, CPU-optimized builds)            |
| **Export**   | PDFKit, docx, pptxgenjs, ExcelJS, csv-stringify           |
| **Markdown** | react-markdown, react-syntax-highlighter, remark-gfm      |
| **Styling**  | Vanilla CSS with modern design patterns                   |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** — Version 18 or higher
- **RAM** — 12 GB+ recommended for 7B/8B models
- **Storage** — Sufficient space for GGUF model files (typically 4–8 GB per model)

### Installation

1. **Install dependencies**:
    ```bash
    npm install
    ```

2. **Run in development mode**:
    ```bash
    npm run dev
    ```

### Building for Production

**Linux** (generates `.deb` package):
```bash
npm run dist:linux
```

**Windows** (generates NSIS installer):
```bash
npm run dist:win
```

### Docker Build (Linux)

Build and package using Docker for a consistent environment:

```bash
# Build the Docker image
docker build -t local-ai-assistant .

# Run the build — outputs to ./dist
docker run -v $(pwd)/dist:/app/dist local-ai-assistant
```

---

## ⚙️ Configuration

| Setting              | Description                                                                 |
|----------------------|-----------------------------------------------------------------------------|
| **Cloud API Keys**   | Add OpenAI, Anthropic, or Gemini keys in **Settings** to enable cloud models |
| **Search API Keys**  | Add Tavily (recommended) or Serper.dev keys for web search integration       |
| **System Prompts**   | Customize per-conversation AI behavior via the System Prompt Editor          |
| **Model Management** | Download and switch models from the **Model Library** tab                    |
| **MCP Tools**        | Enable/disable file, document, and terminal tools with sandboxed permissions |

---

## 🛡️ Privacy & Security

- **Local-First** — All chat history and settings are stored on your device.
- **No Analytics** — We do not track your usage or collect any personal data.
- **Secure IPC** — Communication between UI and backend uses secure Electron IPC channels.
- **Sandboxed Tools** — MCP file and terminal tools require explicit permission grants with path validation and rate limiting.
- **Sensitive Path Blocking** — System-critical paths are automatically blocked from tool access.

---

## 📄 License

This is **proprietary software**. All rights reserved.

Unauthorized copying, modification, distribution, or use of this software is strictly prohibited.

© 2026 Local AI. All rights reserved.
