# Local AI Model Download System Documentation

The Local AI application provides a comprehensive, resumeable download system for AI models, powered by Electron and Node.js. This document outlines the key features, technical implementation, and available model catalog.

## Available Model Catalog

The system supports 60+ models organized into tiers based on RAM requirements:

### Ultra-Light Tier (2-4 GB RAM)
- **SmolLM2 135M** (0.1 GB) - Ultimate lightweight model for basic tasks
- **SmolLM2 360M** (0.3 GB) - Advanced sub-1B model for fast chat
- **Danube3 500M** (0.4 GB) - Ultra-efficient model for limited memory
- **TinyLlama 1.1B** (0.7 GB) - Ultra-compact chat model
- **Llama 3.2 1B** (0.8 GB) - Meta's most efficient Llama model
- **Falcon3 1B** (0.7 GB) - TII's highly optimized small model
- **SmolLM2 1.7B** (1.1 GB) - State-of-the-art small model
- **DeepSeek R1 1.5B** (1.1 GB) - Miniature reasoning flagship
- **OpenCoder 1.5B** (1.0 GB) - Specialized coding assistant
- **Qwen 2.5 1.5B** (1.2 GB) - Smart ultra-small model with thinking
- **Qwen 3.5 0.8B** (0.6 GB) - Ultra-compact vision model
- **Qwen 3.5 2B** (1.4 GB) - State-of-the-art 2B with vision & thinking
- **Granite 3.0/3.1 2B** (1.4-1.6 GB) - IBM's enterprise-grade models
- **StableLM 2 Zephyr 1.6B** (1.0 GB) - Stability AI's ultra-fast model
- **Moondream2** (1.4 GB) - Dedicated tiny vision expert

### Light Tier (6-8 GB RAM)
- **Gemma 2 2B** (1.6 GB) - Google's high-performance compact model
- **Llama 3.2 3B** (2.0 GB) - Versatile sweet-spot for light hardware
- **Phi 3.5 Mini** (2.4 GB) - Microsoft's state-of-the-art small model
- **Phi-4 Mini** (2.5 GB) - Microsoft's newest compact frontier model
- **Qwen 2.5 3B** (1.9 GB) - Alibaba's high-performance 3B model
- **Ministral 3B** (2.1 GB) - Mistral AI's premier small model
- **Qwen 3.5 4B** (2.8 GB) - Next-gen balanced vision model
- **Kimi Moonlight 3B** (9.8 GB) - Breakthrough MoE model

### Medium Tier (10-16 GB RAM)
- **Mistral 7B v0.3** (4.5 GB) - Industry-standard 7B model
- **Qwen 2.5 7B** (4.7 GB) - Alibaba's benchmark-topping multilingual model
- **Mistral Small 3 7B** (4.5 GB) - Latest compact flagship from Mistral
- **Qwen 2.5 VL 7B** (4.7 GB) - Next-gen native vision specialist
- **DeepSeek R1 7B** (4.7 GB) - Advanced reasoning specialist
- **Llama 3.1/3.3 8B** (4.9-5.2 GB) - Meta's highly capable flagship
- **Qwen 2.5 Coder 7B** (4.7 GB) - Premier open-source coding assistant
- **Gemma 2 9B** (5.5 GB) - Google's high-performance 9B model
- **Ministral 8B** (5.0 GB) - Mistral AI's premier edge model
- **Qwen 2.5 Math 7B** (4.7 GB) - World-class mathematical specialist
- **Mistral-Nemo 12B** (7.5 GB) - NVIDIA-Mistral high-performance 12B
- **Qwen 3.5 9B** (5.8 GB) - Powerful mid-sized multimodal flagship
- **Qwen 2.5 14B** (9.0 GB) - High-intelligence large-medium model

### Heavy Tier (16+ GB RAM)
- **CodeLlama 13B** (7.9 GB) - Specialized large coding model from Meta
- **Phi-4 Instruct** (9.1 GB) - Microsoft's latest frontier-level model
- **Kimi K2 Thinking** (10.4 GB) - Advanced reasoning specialist
- **Kimi K2.5 Multimodal** (10.4 GB) - Moonshot AI's native multimodal flagship
- **MiniMax M2.5 Action** (9.8 GB) - Dynamic action specialist
- **Codestral 22B** - Mistral's elite coding specialist

### Agent Tier (Specialized Models)
- **Llama 3.2 1B/3B Agent** (0.7-2.1 GB) - Ultra-fast agentic specialists
- **Reasoning Llama 1B Agent** (0.7 GB) - Miniature chain-of-thought expert
- **DeepSeek R1 Distill 1.5B/7B/14B** (1.1-9.0 GB) - High-capacity reasoning agents
- **DeepSeek Coder V2 Lite** (10.5 GB) - State-of-the-art MoE coding expert
- **Qwen 2.5 Coder 1.5B/7B Agent** (1.0-4.7 GB) - Specialized coding agents
- **Qwen 3.5 0.8B/2B Agent** (0.6-1.4 GB) - World's smallest vision agents
- **SmallThinker 3B Preview** (2.1 GB) - Specialized reasoning model
- **Custom Model** - Support for user-provided GGUF files

## Model Features

### Vision Support
Models with `supportsVision: true` include multimodal project files (.mmproj) for image processing:
- Qwen 3.5 series (0.8B, 2B, 4B, 9B)
- Qwen 2.5 VL 7B
- Moondream2
- Kimi K2.5

### Thinking Capabilities
Models with `supportsThinking: true` provide enhanced reasoning:
- DeepSeek R1 series
- Qwen 3.5 series
- Qwen 2.5 Math 7B
- Phi-4 series
- SmallThinker 3B
- Kimi K2/K2.5

### Specialized Models
- **Coding**: OpenCoder, Qwen Coder series, CodeLlama, Codestral
- **Math**: Qwen 2.5 Math 7B
- **Vision**: Qwen 3.5 series, Qwen 2.5 VL, Moondream2
- **Reasoning**: DeepSeek R1 series, SmallThinker, Kimi K series

## Features

### 1. Pause & Resume
- **Pause**: When a user clicks "Pause", the active HTTP request is aborted, but the temporary file (`.download`) is preserved.
- **Resume**: When a user clicks "Resume", the system checks the size of the existing `.download` file and uses the HTTP `Range` header (`Range: bytes=X-`) to fetch only the remaining data from the server.
- **Reliability**: Resuming works even across application restarts, as long as the `.download` file remains in the temporary directory.

### 2. Cancellation
- **Cleanup**: Clicking "Cancel" aborts the download and immediately deletes the partial `.download` file to free up disk space.

### 3. Timeout Management
- **Extended Timeouts**: Download and extraction timeouts are set to **5 minutes (300,000ms)** to accommodate larger models and slower network conditions.
- **Data-Driven Timeouts**: The system monitors data flow; as long as chunks are being received, the download will not timeout.

### 4. UI Focus & Safety
- **Single Download Constraint**: To ensure system stability, the UI enters a "Focus Mode" where other model options are hidden or disabled while a download is in progress.
- **Strict Verification**: Each model download is keyed by a unique ID, ensuring that progress updates are correctly routed to the corresponding card in the UI.

## Technical Implementation

### Model Interface

All downloadable models implement the `DownloadableModel` interface:

```typescript
interface DownloadableModel {
    id: string                    // Unique identifier
    name: string                  // Display name
    description: string           // Model description
    sizeGB: number               // Download size in GB
    ramRequired: number           // Minimum RAM requirement
    url: string                  // Hugging Face download URL
    filename: string             // Local filename
    tier: ModelTier              // Performance tier
    provider: ModelProvider      // Model provider
    supportsVision?: boolean     // Vision capability
    mmprojUrl?: string          // Vision adapter URL
    mmprojFilename?: string     // Vision adapter filename
    supportsThinking?: boolean   // Reasoning capability
}
```

### Model Tiers
- **ultra-light**: 2-4 GB RAM (135M - 2B parameters)
- **light**: 6-8 GB RAM (2B - 4B parameters)  
- **medium**: 10-16 GB RAM (7B - 14B parameters)
- **heavy**: 16+ GB RAM (13B - 22B parameters)
- **agent**: Specialized for tool-calling and autonomous tasks
- **custom**: User-provided GGUF files

### Progress Tracking

Download progress is tracked via the `DownloadProgress` interface:

```typescript
interface DownloadProgress {
    id: string
    filename: string
    downloaded: number      // Bytes downloaded
    total: number          // Total file size
    percent: number        // Completion percentage
    speedMBps: number      // Current download speed
    etaSeconds: number     // Estimated time remaining
    status: DownloadStatus // Current state
}
```

### Download Status Types
- **downloading**: Active download in progress
- **paused**: Download paused by user
- **error**: Download failed due to network/server issues
- **complete**: Download successfully finished

### IPC Communication

The download system uses Electron's IPC (Inter-Process Communication) for coordination between main and renderer processes:

#### IPC Channels
- `DOWNLOAD_START_MODEL`: Triggers a new model download
- `DOWNLOAD_PAUSE`: Pauses a model download by ID
- `DOWNLOAD_RESUME`: Resumes a model download by ID  
- `DOWNLOAD_CANCEL`: Cancels and cleans up a download
- `DOWNLOAD_PROGRESS`: Broadcasts real-time stats (percent, speed, ETA)

#### Downloaded Model Information
Completed downloads are tracked via the `DownloadedModelInfo` interface:

```typescript
interface DownloadedModelInfo {
    id: string
    name: string
    filename: string
    sizeBytes: number
    path: string
    supportsVision?: boolean
    supportsThinking?: boolean
}
```

### File Structure
- **Target Path**: The final resting place of the model (e.g., `models/qwen2.5-3b.gguf`)
- **Temporary Path**: Data is downloaded to `[target].download` and only renamed to the final filename once the download is 100% complete and verified
- **Vision Models**: Models with vision support also download corresponding `.mmproj` files for multimodal processing

### Download Process Flow
1. **Validation**: Model ID and available disk space are verified
2. **Initialization**: HTTP/HTTPS connection established with Hugging Face
3. **Progress Tracking**: Real-time updates sent via IPC
4. **Range Requests**: Resume capability using HTTP `Range` headers
5. **Verification**: File integrity checked before final rename
6. **Completion**: Model registered in local model registry

## Model Usage in Application

### Local Models
Downloaded GGUF models are served via the integrated Llama.cpp server:
- Models are loaded from the `models/` directory
- Server configuration adapts based on model size and available RAM
- Vision models automatically load corresponding mmproj files

### Cloud Models
For cloud-based inference, the application supports:
- **OpenAI**: GPT models via API
- **Anthropic**: Claude models via API  
- **Google**: Gemini models via API
- **Local Models**: Downloaded GGUF files via local server

### Model Selection Logic
The application automatically selects models based on:
- Available system RAM
- User preferences (speed vs. capability)
- Task requirements (coding, vision, reasoning)
- Previous usage patterns

## Troubleshooting

### Common Issues
- **Stuck Downloads**: Try pausing and resuming to re-establish connection
- **Timeouts**: Check internet stability or try smaller models first
- **Insufficient RAM**: Use models from lower tiers
- **Vision Model Issues**: Ensure mmproj files are downloaded and accessible
- **Slow Performance**: Consider models optimized for your hardware tier

### Error Recovery
- **Network Errors**: Automatic retry with exponential backoff
- **Disk Space**: Clear partial downloads and free up space
- **Corrupted Downloads**: Automatic re-download on checksum failure
- **Server Issues**: Fallback to alternative model mirrors

### Performance Optimization
- **Parallel Downloads**: Limited to one active download for stability
- **Memory Management**: Efficient streaming to minimize RAM usage
- **Cache Optimization**: Reuse existing downloads when possible
- **Bandwidth Throttling**: Configurable download limits for network sharing
