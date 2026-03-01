# 🤖 Local AI Assistant

**Your Private, Fully Offline Desktop AI Companion.**

Local AI Assistant is a powerful, privacy-first desktop application that brings the power of Large Language Models (LLMs) directly to your machine. It uses `llama.cpp` for high-performance CPU inference, ensuring your conversations stay on your hardware.

---

## ✨ Key Features

- **🏠 100% Local Inference**: Powered by `llama.cpp`, run GGUF models (7B, 8B, etc.) completely offline.
- **📚 Model Library**: Download and manage multiple models directly within the app.
- **☁️ Cloud Integration**: Optional support for OpenAI, Anthropic, and Google Gemini for when you need extra reasoning power.
- 🌐 **Web Search**: Integrated web search (via Tavily or Serper.dev) with AI-driven query refinement to provide the most relevant and up-to-date information.
- **🎨 Premium UI**: A sleek, responsive interface built with React and Electron, featuring dark mode and smooth animations.
- **🔒 Privacy First**: Your data never leaves your machine unless you explicitly enable cloud models or web search.

---

## 🏗️ How It Works

Local AI Assistant uses a hybrid architecture to balance performance and privacy:

1.  **Renderer (React)**: Handles the user interface, message streaming, and state management.
2.  **Main Process (Electron)**: Manages the application lifecycle and secure IPC communication.
3.  **Local Engine (llama.cpp)**: A dedicated child process running `llama.cpp` server to handle GGUF model inference.
4.  **Services**: Specialized backend services for model downloading, local storage (SQLite/Settings), and optional cloud API integrations.

---

## 🛠️ Technology Stack

- **Frontend**: React, TypeScript, Vite, Lucide Icons.
- **Backend**: Electron, Node.js.
- **Inference**: llama.cpp (GGUF support).
- **Styling**: Vanilla CSS with modern design patterns.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: Version 18 or higher.
- **RAM**: 12GB+ recommended for 7B/8B models.
- **Storage**: Sufficient space for GGUF model files (usually 4GB - 8GB per model).

### Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/local-ai-assistant/local-ai.git
    cd local-ai
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Run in development mode**:
    ```bash
    npm run dev
    ```

### Building for Production

To create a distributable package for Linux:
```bash
npm run dist:linux
```
This will generate an AppImage and a `.deb` package in the `dist` folder.

---

## ⚙️ Configuration

- **API Keys**: Add your OpenAI, Anthropic, Gemini, Tavily (Primary), or Serper.dev (Secondary) keys in the **Settings Panel** to enable cloud and search features. (Tavily is recommended for the best AI-search experience).
- **Model Path**: Models are stored locally; you can manage them via the **Model Library** tab.

---

## 🛡️ Privacy & Security

- **Local-First**: All local chat history and settings are stored on your device.
- **No Analytics**: We do not track your usage or collect any personal data.
- **Secure IPC**: Communication between the UI and the backend is handled through secure Electron IPC channels.

---

## 📄 License

This project is licensed under the MIT License.
