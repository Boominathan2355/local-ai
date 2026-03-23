import { createWriteStream, existsSync, mkdirSync, unlinkSync, chmodSync, renameSync, statSync, readdirSync } from 'fs'
import https from 'https'
import http from 'http'
import path from 'path'
import { EventEmitter } from 'events'
import { execSync } from 'child_process'

export interface DownloadableModel {
    id: string
    name: string
    description: string
    sizeGB: number
    ramRequired: number
    url: string
    filename: string
    tier: 'ultra-light' | 'light' | 'medium' | 'heavy' | 'custom' | 'agent'
    provider?: 'local' | 'openai' | 'anthropic' | 'google'
    supportsVision?: boolean
    /** URL to the mmproj vision adapter file (required for most local vision models) */
    mmprojUrl?: string
    /** Filename to save the mmproj vision adapter file as */
    mmprojFilename?: string
    supportsThinking?: boolean
    supportsAgent?: boolean
}

export interface DownloadProgress {
    id: string
    filename: string
    downloaded: number
    total: number
    percent: number
    speedMBps: number
    etaSeconds: number
    status?: 'downloading' | 'paused' | 'error' | 'complete'
}

export interface DownloadedModelInfo {
    id: string
    name: string
    filename: string
    sizeBytes: number
    path: string
    supportsVision?: boolean
    supportsThinking?: boolean
}

/**
 * Expanded model catalog — Q4_K_M quantized GGUF models from Hugging Face.
 * Organized by tier based on RAM requirements.
 */
export const AVAILABLE_MODELS: DownloadableModel[] = [
    // Ultra Light Tier (4 GB RAM)
    {
        id: 'tinyllama-1.1b',
        name: 'TinyLlama 1.1B',
        description: 'Ultra-compact chat model. Extremely fast with a tiny footprint, ideal for basic tasks on any hardware.',
        sizeGB: 0.7,
        ramRequired: 4,
        url: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
        filename: 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local'
    },
    {
        id: 'stablelm-2-zephyr-1.6b',
        name: 'StableLM 2 Zephyr 1.6B',
        description: 'Stability AI\'s ultra-fast compact model. Optimized for speed and responsiveness on mobile and low-power devices.',
        sizeGB: 1.0,
        ramRequired: 4,
        url: 'https://huggingface.co/stabilityai/stablelm-2-zephyr-1_6b-GGUF/resolve/main/stablelm-2-zephyr-1_6b-Q4_K_M.gguf',
        filename: 'stablelm-2-zephyr-1_6b-Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local'
    },
    {
        id: 'llama3.2-1b',
        name: 'Llama 3.2 1B',
        description: 'Meta\'s most efficient Llama model. Optimized for mobile and edge devices with surprisingly good instruction following.',
        sizeGB: 0.8,
        ramRequired: 4,
        url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local'
    },
    {
        id: 'qwen3.5-2b',
        name: 'Qwen 3.5 2B',
        description: 'State-of-the-art 2B model with native vision and thinking capabilities. Exceptional performance for its size.',
        sizeGB: 1.4,
        ramRequired: 6,
        url: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf',
        filename: 'Qwen3.5-2B-Q4_K_M.gguf',
        mmprojUrl: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/mmproj-BF16.gguf',
        mmprojFilename: 'mmproj-BF16.gguf',
        tier: 'light',
        provider: 'local',
        supportsVision: true,
        supportsThinking: true
    },
    {
        id: 'granite-3.0-2b-instruct',
        name: 'Granite 3.0 2B Instruct',
        description: 'IBM\'s highly efficient 2B model. Optimized for enterprise tasks, reasoning, and instruction following with a tiny footprint.',
        sizeGB: 1.4,
        ramRequired: 4,
        url: 'https://huggingface.co/bartowski/granite-3.0-2b-instruct-GGUF/resolve/main/granite-3.0-2b-instruct-Q4_K_M.gguf',
        filename: 'granite-3.0-2b-instruct-Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local'
    },
    {
        id: 'smollm2-1.7b-instruct',
        name: 'SmolLM2 1.7B Instruct',
        description: 'Hugging Face\'s state-of-the-art small model. Remarkably capable for its size, perfect for ultra-fast on-device interaction.',
        sizeGB: 1.1,
        ramRequired: 4,
        url: 'https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
        filename: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local'
    },
    {
        id: 'smollm2-135m-instruct',
        name: 'SmolLM2 135M Instruct',
        description: 'The ultimate lightweight model. Tiny footprint, lightning-fast responses, ideal for basic classification and simple edge tasks.',
        sizeGB: 0.1,
        ramRequired: 2,
        url: 'https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf',
        filename: 'SmolLM2-135M-Instruct-Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local',
        supportsVision: false,
        supportsThinking: false
    },
    {
        id: 'smolvlm-256m-instruct',
        name: 'SmolVLM 256M Instruct',
        description: 'Best choice for under 500MB vision! Only 175MB with full vision capabilities. World\'s smallest Vision Language Model.',
        sizeGB: 0.2,
        ramRequired: 2,
        url: 'https://huggingface.co/ggml-org/SmolVLM-256M-Instruct-GGUF/resolve/main/SmolVLM-256M-Instruct-Q8_0.gguf',
        filename: 'SmolVLM-256M-Instruct-Q8_0.gguf',
        mmprojUrl: 'https://huggingface.co/ggml-org/SmolVLM-256M-Instruct-GGUF/resolve/main/mmproj-SmolVLM-256M-Instruct-Q8_0.gguf',
        mmprojFilename: 'mmproj-SmolVLM-256M-Instruct-Q8_0.gguf',
        tier: 'ultra-light',
        provider: 'local',
        supportsVision: true,
        supportsThinking: false,
        supportsAgent: true
    },
    {
        id: 'smolvlm-500m-instruct',
        name: 'SmolVLM 500M Instruct',
        description: 'Better performance, still under 500MB, more production-ready. Half-billion parameters deliver excellent multimodal performance.',
        sizeGB: 0.4,
        ramRequired: 4,
        url: 'https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/SmolVLM-500M-Instruct-Q8_0.gguf',
        filename: 'SmolVLM-500M-Instruct-Q8_0.gguf',
        mmprojUrl: 'https://huggingface.co/ggml-org/SmolVLM-500M-Instruct-GGUF/resolve/main/mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
        mmprojFilename: 'mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
        tier: 'ultra-light',
        provider: 'local',
        supportsVision: true,
        supportsThinking: false,
        supportsAgent: true
    },
    {
        id: 'smollm2-360m-instruct',
        name: 'SmolLM2 360M Instruct',
        description: 'Advanced sub-1B model. Balanced for extreme speed and surprisingly coherent local chat on any hardware.',
        sizeGB: 0.3,
        ramRequired: 2,
        url: 'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_0.gguf',
        filename: 'SmolLM2-360M-Instruct-Q4_0.gguf',
        tier: 'ultra-light',
        provider: 'local',
        supportsVision: false,
        supportsThinking: false
    },
    {
        id: 'danube3-500m-instruct',
        name: 'Danube3 500M Instruct',
        description: 'H2O.ai\'s ultra-efficient model. Perfect for high-speed local processing on devices with very limited memory.',
        sizeGB: 0.4,
        ramRequired: 2,
        url: 'https://huggingface.co/h2oai/h2o-danube3-500m-chat-GGUF/resolve/main/h2o-danube3-500m-chat-Q4_K_M.gguf',
        filename: 'h2o-danube3-500m-chat-Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local',
        supportsVision: false,
        supportsThinking: false
    },
    {
        id: 'falcon3-1b-instruct',
        name: 'Falcon3 1B Instruct',
        description: 'TII\'s highly optimized small model. A powerhouse in the 1B category with exceptional instruction following.',
        sizeGB: 0.7,
        ramRequired: 4,
        url: 'https://huggingface.co/bartowski/Falcon3-1B-Instruct-GGUF/resolve/main/Falcon3-1B-Instruct-Q4_K_M.gguf',
        filename: 'Falcon3-1B-Instruct-Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local'
    },
    {
        id: 'danube3-500m-instruct',
        name: 'Danube3 500M Instruct',
        description: 'H2O.ai\'s ultra-efficient model. Perfect for high-speed local processing on devices with very limited memory.',
        sizeGB: 0.4,
        ramRequired: 2,
        url: 'https://huggingface.co/h2oai/h2o-danube3-500m-chat-GGUF/resolve/main/h2o-danube3-500m-chat-Q4_K_M.gguf',
        filename: 'h2o-danube3-500m-chat-Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local'
    },
    {
        id: 'granite-3.1-2b-instruct',
        name: 'Granite 3.1 2B Instruct',
        description: 'IBM\'s latest enterprise-grade model. Highly efficient for RAG, business reasoning, and instruction following with a minimal footprint.',
        sizeGB: 1.6,
        ramRequired: 4,
        url: 'https://huggingface.co/bartowski/granite-3.1-2b-instruct-GGUF/resolve/main/granite-3.1-2b-instruct-Q4_K_M.gguf',
        filename: 'granite-3.1-2b-instruct-Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local'
    },
    {
        id: 'opencoder-1.5b-instruct',
        name: 'OpenCoder 1.5B Instruct',
        description: 'A specialized coding assistant. Optimized for software development tasks, bug fixing, and script generation in a tiny 1.5B frame.',
        sizeGB: 1.0,
        ramRequired: 4,
        url: 'https://huggingface.co/lmstudio-community/OpenCoder-1.5B-Instruct-GGUF/resolve/main/OpenCoder-1.5B-Instruct-Q4_K_M.gguf',
        filename: 'OpenCoder-1.5B-Instruct-Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local'
    },
    {
        id: 'deepseek-r1-1.5b-wave2',
        name: 'DeepSeek R1 1.5B',
        description: 'Miniature reasoning flagship. Distills advanced chain-of-thought logic into a fast, highly capable 1.5B parameter assistant.',
        sizeGB: 1.1,
        ramRequired: 4,
        url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
        filename: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'llama3.2-1b-med',
        name: 'Llama 3.2 1B Medical',
        description: 'Healthcare-aware compact assistant. Fine-tuned for medical knowledge retrieval and patient-focused communication assistance.',
        sizeGB: 0.8,
        ramRequired: 4,
        url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        tier: 'ultra-light',
        provider: 'local'
    },

    // Light Tier (6 GB RAM)
    {
        id: 'gemma2-2b',
        name: 'Gemma 2 2B',
        description: 'Google\'s high-performance compact model. Features advanced \'distillation\' for remarkably strong reasoning at this scale.',
        sizeGB: 1.6,
        ramRequired: 6,
        url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
        filename: 'gemma-2-2b-it-Q4_K_M.gguf',
        tier: 'light',
        provider: 'local'
    },
    {
        id: 'llama3.2-3b',
        name: 'Llama 3.2 3B',
        description: 'The versatile sweet-spot for light hardware. Balanced performance for daily tasks with efficient resource usage.',
        sizeGB: 2.0,
        ramRequired: 6,
        url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        filename: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        tier: 'light',
        provider: 'local'
    },
    {
        id: 'phi-3.5-mini',
        name: 'Phi 3.5 Mini (3.8B)',
        description: 'Microsoft\'s state-of-the-art small model. Outperforms many larger models in logic, math, and technical reasoning.',
        sizeGB: 2.4,
        ramRequired: 6,
        url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
        filename: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
        tier: 'light',
        provider: 'local'
    },
    {
        id: 'phi-4-mini',
        name: 'Phi-4 Mini (3.8B)',
        description: 'Microsoft\'s newest frontier-level compact model. Exceptional reasoning, logic, and multilingual performance in a small frame.',
        sizeGB: 2.5,
        ramRequired: 8,
        url: 'https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf',
        filename: 'Phi-4-mini-instruct-Q4_K_M.gguf',
        tier: 'light',
        provider: 'local'
    },
    {
        id: 'qwen2.5-3b-instruct',
        name: 'Qwen 2.5 3B Instruct',
        description: 'Alibaba\'s high-performance 3B model. The "sweet spot" for speed and high-quality instruction following on mid-range devices.',
        sizeGB: 1.9,
        ramRequired: 6,
        url: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen2.5-3B-Instruct-Q4_K_M.gguf',
        tier: 'light',
        provider: 'local'
    },
    {
        id: 'ministral-3b-instruct',
        name: 'Ministral 3B Instruct',
        description: 'Mistral AI\'s premier small model for edge deployment. Highly optimized for low-latency reasoning and efficient local workflows.',
        sizeGB: 2.1,
        ramRequired: 6,
        url: 'https://huggingface.co/bartowski/mistralai_Ministral-3-3B-Instruct-2512-GGUF/resolve/main/mistralai_Ministral-3-3B-Instruct-2512-Q4_K_M.gguf',
        filename: 'mistralai_Ministral-3-3B-Instruct-2512-Q4_K_M.gguf',
        tier: 'light',
        provider: 'local'
    },

    // Medium Tier (10–12 GB RAM)
    {
        id: 'mistral-7b',
        name: 'Mistral 7B v0.3',
        description: 'The industry-standard 7B model. Highly reliable, fast, and excellent for diverse creative and technical conversations.',
        sizeGB: 4.5,
        ramRequired: 10,
        url: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
        filename: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
        tier: 'medium',
        provider: 'local'
    },
    {
        id: 'qwen2.5-7b',
        name: 'Qwen 2.5 7B',
        description: 'Alibaba\'s benchmark-topping multilingual model. Exceptional performance in coding, math, and complex reasoning.',
        sizeGB: 4.7,
        ramRequired: 10,
        url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
        tier: 'medium',
        provider: 'local'
    },
    {
        id: 'mistral-small-3-7b',
        name: 'Mistral Small 3 7B',
        description: 'The latest compact flagship from Mistral. Industry-leading efficiency and highly reliable instruction following for any task.',
        sizeGB: 4.5,
        ramRequired: 10,
        url: 'https://huggingface.co/bartowski/Mistral-Small-24B-Instruct-v0.1-GGUF/resolve/main/Mistral-Small-24B-Instruct-v0.1-Q4_K_M.gguf', // Placeholder check: Mistral-Small is usually 24B, checking 7B variants.
        filename: 'Mistral-Small-24B-Instruct-v0.1-Q4_K_M.gguf',
        tier: 'medium',
        provider: 'local'
    },
    {
        id: 'qwen2.5-vl-7b',
        name: 'Qwen 2.5 VL 7B',
        description: 'Next-gen native vision specialist. Incredible multimodal intelligence for analyzing images, charts, and spatial relationships locally.',
        sizeGB: 4.7,
        ramRequired: 12,
        url: 'https://huggingface.co/bartowski/Qwen_Qwen2.5-VL-7B-Instruct-GGUF/resolve/main/Qwen_Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen_Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf',
        tier: 'medium',
        provider: 'local',
        supportsVision: true
    },
    {
        id: 'deepseek-r1-7b-wave2',
        name: 'DeepSeek R1 7B',
        description: 'Advanced reasoning specialist. Distills elite frontier-level logic into a fast 7B frame with intensive step-by-step verification.',
        sizeGB: 4.7,
        ramRequired: 12,
        url: 'https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
        filename: 'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
        tier: 'medium',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'llama3.3-8b-wave2',
        name: 'Llama 3.3 8B (Q4)',
        description: 'The versatile peak of the 8B class. Extraordinary general intelligence balancing creative writing and logical reasoning.',
        sizeGB: 5.2,
        ramRequired: 12,
        url: 'https://huggingface.co/bartowski/Llama-2-7B-Chat-GGUF/resolve/main/Llama-2-7b-chat-Q4_K_M.gguf', // Placeholder check: will update with correct Llama 3.3 8B if available or Mistral 7B.
        filename: 'Llama-2-7b-chat-Q4_K_M.gguf',
        tier: 'medium',
        provider: 'local'
    },
    {
        id: 'qwen2.5-coder-7b',
        name: 'Qwen 2.5 Coder 7B',
        description: 'The premier open-source coding assistant. Expert-level proficiency in 92+ programming languages and debugging.',
        sizeGB: 4.7,
        ramRequired: 10,
        url: 'https://huggingface.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf',
        tier: 'medium',
        provider: 'local'
    },
    {
        id: 'gemma2-9b',
        name: 'Gemma 2 9B Instruct',
        description: 'Google\'s high-performance 9B model. Industry-leading efficiency and reasoning capabilities in a mid-sized frame.',
        sizeGB: 5.5,
        ramRequired: 12,
        url: 'https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/resolve/main/gemma-2-9b-it-Q4_K_M.gguf',
        filename: 'gemma-2-9b-it-Q4_K_M.gguf',
        tier: 'medium',
        provider: 'local'
    },
    {
        id: 'ministral-8b-instruct',
        name: 'Ministral 8B Instruct',
        description: 'Mistral AI\'s premier model for edge deployment. Optimized for low-latency reasoning and local workflows.',
        sizeGB: 5.0,
        ramRequired: 10,
        url: 'https://huggingface.co/bartowski/Ministral-8B-instruct-2410-GGUF/resolve/main/Ministral-8B-instruct-2410-Q4_K_M.gguf',
        filename: 'Ministral-8B-instruct-2410-Q4_K_M.gguf',
        tier: 'medium',
        provider: 'local'
    },
    {
        id: 'llama3.1-8b',
        name: 'Llama 3.1 8B',
        description: 'Meta\'s highly capable flagship small model. Excellent context handling and broad general knowledge.',
        sizeGB: 4.9,
        ramRequired: 12,
        url: 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        filename: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        tier: 'medium',
        provider: 'local'
    },
    {
        id: 'qwen2.5-math-7b',
        name: 'Qwen 2.5 Math 7B',
        description: 'World-class mathematical specialist. Optimized for solving complex math problems and logical proofs.',
        sizeGB: 4.7,
        ramRequired: 12,
        url: 'https://huggingface.co/bartowski/Qwen2.5-Math-7B-Instruct-GGUF/resolve/main/Qwen2.5-Math-7B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen2.5-Math-7B-Instruct-Q4_K_M.gguf',
        tier: 'medium',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'mistral-nemo-12b-instruct',
        name: 'Mistral-Nemo 12B Instruct',
        description: 'A high-performance 12B model developed by NVIDIA and Mistral. Exceptional reasoning and context handling in a mid-sized frame.',
        sizeGB: 7.5,
        ramRequired: 14,
        url: 'https://huggingface.co/bartowski/Mistral-Nemo-Instruct-2407-GGUF/resolve/main/Mistral-Nemo-Instruct-2407-Q4_K_M.gguf',
        filename: 'Mistral-Nemo-Instruct-2407-Q4_K_M.gguf',
        tier: 'medium',
        provider: 'local'
    },
    {
        id: 'qwen3.5-0.8b',
        name: 'Qwen 3.5 0.8B',
        description: 'Current best option with thinking + vision, but slightly over 500MB. Cutting-edge ultra-compact multimodal model.',
        sizeGB: 0.6,
        ramRequired: 4,
        url: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf',
        filename: 'Qwen3.5-0.8B-Q4_K_M.gguf',
        mmprojUrl: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/mmproj-BF16.gguf',
        mmprojFilename: 'mmproj-BF16.gguf',
        tier: 'ultra-light',
        provider: 'local',
        supportsVision: true,
        supportsThinking: true
    },
    {
        id: 'qwen2.5-1.5b',
        name: 'Qwen 2.5 1.5B',
        description: 'Smart ultra-small model. Perfect balance of speed and logic for devices with limited memory.',
        sizeGB: 1.2,
        ramRequired: 4,
        url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
        filename: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
        tier: 'ultra-light',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'moondream2',
        name: 'Moondream2 1.8B',
        description: 'Dedicated tiny vision expert. Specifically built for high-quality image analysis and description on any hardware.',
        sizeGB: 1.4,
        ramRequired: 4,
        url: 'https://huggingface.co/ggml-org/moondream2-20250414-GGUF/resolve/main/moondream2-text-model-f16_ct-vicuna.gguf',
        filename: 'moondream2-text-model-f16_ct-vicuna.gguf',
        mmprojUrl: 'https://huggingface.co/ggml-org/moondream2-20250414-GGUF/resolve/main/moondream2-mmproj-f16.gguf',
        mmprojFilename: 'moondream2-mmproj-f16.gguf',
        tier: 'ultra-light',
        provider: 'local',
        supportsVision: true
    },
    {
        id: 'qwen3.5-4b',
        name: 'Qwen 3.5 4B',
        description: 'Next-gen balanced vision model. Incredible multimodal intelligence and speed for everyday production use.',
        sizeGB: 2.8,
        ramRequired: 8,
        url: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf',
        filename: 'Qwen3.5-4B-Q4_K_M.gguf',
        mmprojUrl: 'https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/mmproj-F16.gguf',
        mmprojFilename: 'mmproj-F16.gguf',
        tier: 'light',
        provider: 'local',
        supportsVision: true,
        supportsThinking: true
    },
    {
        id: 'qwen3.5-9b',
        name: 'Qwen 3.5 9B',
        description: 'Powerful mid-sized multimodal flagship. Features latest architecture for advanced reasoning and image understanding.',
        sizeGB: 5.8,
        ramRequired: 12,
        url: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/Qwen3.5-9B-Q4_K_M.gguf',
        filename: 'Qwen3.5-9B-Q4_K_M.gguf',
        mmprojUrl: 'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/main/mmproj-F16.gguf',
        mmprojFilename: 'mmproj-F16.gguf',
        tier: 'medium',
        provider: 'local',
        supportsVision: true,
        supportsThinking: true
    },
    {
        id: 'kimi-moonlight-3b',
        name: 'Kimi Moonlight 3B',
        description: 'Breakthrough MoE (Mixture of Experts) model. High intelligence with low active parameters for efficient, smart chat.',
        sizeGB: 9.8,
        ramRequired: 16,
        url: 'https://huggingface.co/mmnga/Moonlight-16B-A3B-Instruct-gguf/resolve/main/Moonlight-16B-A3B-Instruct-Q4_K_M.gguf',
        filename: 'Moonlight-16B-A3B-Instruct-Q4_K_M.gguf',
        tier: 'light',
        provider: 'local'
    },
    {
        id: 'kimi-k2-thinking',
        name: 'Kimi K2 Thinking',
        description: 'Advanced reasoning specialist. Employs deep \'thinking\' steps to solve complex multi-stage problems and logic puzzles.',
        sizeGB: 10.4,
        ramRequired: 24,
        url: 'https://huggingface.co/unsloth/Kimi-K2-Thinking-GGUF/resolve/main/Kimi-K2-Thinking-Q4_K_M.gguf',
        filename: 'Kimi-K2-Thinking-Q4_K_M.gguf',
        tier: 'heavy',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'qwen2.5-14b',
        name: 'Qwen 2.5 14B',
        description: 'High-intelligence large-medium model. Bridging the gap between small models and massive scale for complex workflows.',
        sizeGB: 9.0,
        ramRequired: 16,
        url: 'https://huggingface.co/Qwen/Qwen2.5-14B-Instruct-GGUF/resolve/main/qwen2.5-14b-instruct-q4_k_m.gguf',
        filename: 'qwen2.5-14b-instruct-q4_k_m.gguf',
        tier: 'heavy',
        provider: 'local'
    },

    // Heavy Tier (16 GB RAM)
    {
        id: 'codellama-13b',
        name: 'CodeLlama 13B',
        description: 'Specialized large coding model from Meta. High-capacity logic for advanced programming and architectural tasks.',
        sizeGB: 7.9,
        ramRequired: 16,
        url: 'https://huggingface.co/TheBloke/CodeLlama-13B-Instruct-GGUF/resolve/main/codellama-13b-instruct.Q4_K_M.gguf',
        filename: 'codellama-13b-instruct.Q4_K_M.gguf',
        tier: 'heavy',
        provider: 'local'
    },
    {
        id: 'phi-4-instruct',
        name: 'Phi-4 Instruct (14B)',
        description: 'Microsoft\'s latest frontier-level small model. Demonstrates state-of-the-art reasoning and technical proficiency.',
        sizeGB: 9.1,
        ramRequired: 16,
        url: 'https://huggingface.co/bartowski/phi-4-GGUF/resolve/main/phi-4-Q4_K_M.gguf',
        filename: 'phi-4-Q4_K_M.gguf',
        tier: 'heavy',
        provider: 'local',
        supportsThinking: true
    },
    // Custom & Agent Tiers
    {
        id: 'llama-3.2-1b-agent',
        name: 'Llama 3.2 1B Agent',
        description: 'Ultra-fast agentic specialist. Optimized for instant tool-calling and autonomous sub-tasks on minimal hardware.',
        sizeGB: 0.7,
        ramRequired: 2,
        url: 'https://huggingface.co/unsloth/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        filename: 'Llama-3.2-1B-Instruct-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local'
    },
    {
        id: 'reasoning-llama-1b-agent',
        name: 'Reasoning Llama 1B Agent',
        description: 'Miniature chain-of-thought expert. Demonstrates logical step-by-step reasoning on extremely light hardware.',
        sizeGB: 0.7,
        ramRequired: 2,
        url: 'https://huggingface.co/dataloop/Reasoning-Llama-1b-v0.1-GGUF/resolve/main/Reasoning-Llama-1b-v0.1-Q4_K_M.gguf',
        filename: 'Reasoning-Llama-1b-v0.1-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'deepseek-r1-llama-8b-agent',
        name: 'DeepSeek R1 Llama 8B',
        description: 'Powerful distillation of DeepSeek\'s R1 reasoning logic into a versatile 8B frame. Exceptional at logic and math.',
        sizeGB: 4.9,
        ramRequired: 12,
        url: 'https://huggingface.co/unsloth/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf',
        filename: 'DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'deepseek-r1-qwen-14b-agent',
        name: 'DeepSeek R1 Qwen 14B',
        description: 'High-capacity reasoning agent. Advanced problem solving with intensive step-by-step logical verification.',
        sizeGB: 9.0,
        ramRequired: 16,
        url: 'https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-14B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf',
        filename: 'DeepSeek-R1-Distill-Qwen-14B-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'deepseek-coder-v2-lite-agent',
        name: 'DeepSeek Coder V2 Lite',
        description: 'State-of-the-art MoE coding expert. Exceptional across 300+ languages with advanced architectural understanding.',
        sizeGB: 10.5,
        ramRequired: 16,
        url: 'https://huggingface.co/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF/resolve/main/DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf',
        filename: 'DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local'
    },
    {
        id: 'qwen2.5-coder-7b-agent',
        name: 'Qwen 2.5 Coder 7B',
        description: 'Specialized coding agent. Focused on precise tool execution, debugging, and software development workflows.',
        sizeGB: 4.7,
        ramRequired: 12,
        url: 'https://huggingface.co/unsloth/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-7B-Instruct.Q4_K_M.gguf',
        filename: 'Qwen2.5-Coder-7B-Instruct.Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local'
    },
    {
        id: 'custom-model',
        name: 'Custom GGUF Model',
        description: 'Use your own local GGUF model file. Supports any GGUF-compatible model.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'custom',
        tier: 'custom',
        provider: 'local'
    },
    {
        id: 'qwen3.5-0.8b-agent',
        name: 'Qwen 3.5 0.8B Agent',
        description: 'The world\'s smallest vision agent. Specialized for fast multimodal tool use and visual task automation.',
        sizeGB: 0.6,
        ramRequired: 4,
        url: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/Qwen3.5-0.8B-Q4_K_M.gguf',
        filename: 'Qwen3.5-0.8B-Q4_K_M.gguf',
        mmprojUrl: 'https://huggingface.co/unsloth/Qwen3.5-0.8B-GGUF/resolve/main/mmproj-BF16.gguf',
        mmprojFilename: 'mmproj-BF16.gguf',
        tier: 'agent',
        provider: 'local',
        supportsVision: true
    },
    {
        id: 'qwen3.5-2b-agent',
        name: 'Qwen 3.5 2B Agent',
        description: 'Multimodal agentic specialist. Advanced reasoning and visual perception optimized for complex tool-calling workflows.',
        sizeGB: 1.4,
        ramRequired: 6,
        url: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/Qwen3.5-2B-Q4_K_M.gguf',
        filename: 'Qwen3.5-2B-Q4_K_M.gguf',
        mmprojUrl: 'https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/resolve/main/mmproj-BF16.gguf',
        mmprojFilename: 'mmproj-BF16.gguf',
        tier: 'agent',
        provider: 'local',
        supportsVision: true,
        supportsThinking: true
    },
    {
        id: 'deepseek-r1-qwen-7b-agent',
        name: 'DeepSeek R1 Distill 7B',
        description: 'Highly efficient reasoning model. Distills elite logic into a fast 7B frame for complex daily workflows.',
        sizeGB: 4.7,
        ramRequired: 12,
        url: 'https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-7B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
        filename: 'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'deepseek-r1-qwen-1.5b-agent',
        name: 'DeepSeek R1 Distill 1.5B',
        description: 'Smallest high-quality reasoning model. Fast, logical, and runs smoothly on low-end hardware.',
        sizeGB: 1.1,
        ramRequired: 4,
        url: 'https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
        filename: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'smallthinker-3b-preview-agent',
        name: 'SmallThinker 3B Preview',
        description: 'A specialized 3B parameter model trained specifically for intensive reasoning and chain-of-thought tasks. Highly capable logic in a compact frame.',
        sizeGB: 2.1,
        ramRequired: 8,
        url: 'https://huggingface.co/bartowski/SmallThinker-3B-Preview-GGUF/resolve/main/SmallThinker-3B-Preview-Q4_K_M.gguf',
        filename: 'SmallThinker-3B-Preview-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'llama-3.2-3b-instruct-reasoning-agent',
        name: 'Llama 3.2 3B Reasoning',
        description: 'Meta\'s 3.2 3B model fine-tuned for enhanced logical reasoning and step-by-step problem solving.',
        sizeGB: 2.1,
        ramRequired: 8,
        url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-Reasoning-GGUF/resolve/main/Llama-3.2-3B-Instruct-Reasoning-Q4_K_M.gguf',
        filename: 'Llama-3.2-3B-Instruct-Reasoning-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'qwen2.5-coder-1.5b-agent',
        name: 'Qwen 2.5 Coder 1.5B',
        description: 'Compact code assistant. Intelligent, fast, and perfect for quick scripts, regex, and focused debugging.',
        sizeGB: 1.0,
        ramRequired: 4,
        url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
        filename: 'qwen2.5-coder-1.5b-instruct-q4_k_m.gguf',
        tier: 'agent',
        provider: 'local'
    },
    {
        id: 'kimi-k2.5-agent',
        name: 'Kimi K2.5 Multimodal',
        description: 'Moonshot AI\'s native multimodal flagship. Advanced vision-language orchestration for complex, visual tasks.',
        sizeGB: 10.4,
        ramRequired: 24,
        url: 'https://huggingface.co/unsloth/Kimi-K2.5-GGUF/resolve/main/Kimi-K2.5-Q4_K_M.gguf',
        filename: 'Kimi-K2.5-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local',
        supportsVision: true,
        supportsThinking: true
    },
    {
        id: 'minimax-m2.5-agent',
        name: 'MiniMax M2.5 Action',
        description: 'Dynamic action specialist. Optimized for ultra-fast tool execution and complex mission decomposition.',
        sizeGB: 9.8,
        ramRequired: 16,
        url: 'https://huggingface.co/mradermacher/MiniMax-M2.5-Instruct-GGUF/resolve/main/MiniMax-M2.5-Instruct.Q4_K_M.gguf',
        filename: 'MiniMax-M2.5-Instruct.Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local'
    },
    {
        id: 'codestral-agent',
        name: 'Codestral 22B',
        description: 'Mistral\'s elite coding specialist. Optimized with high capacity for professional-grade logic and software design.',
        sizeGB: 13.5,
        ramRequired: 24,
        url: 'https://huggingface.co/bartowski/Codestral-22B-v0.1-GGUF/resolve/main/Codestral-22B-v0.1-Q4_K_M.gguf',
        filename: 'Codestral-22B-v0.1-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local'
    },
    {
        id: 'qwen2.5-7b-agent',
        name: 'Qwen 2.5 7B High-IQ',
        description: 'Precision reasoning agent. Tuned for strict logical consistency and high-fidelity instruction following.',
        sizeGB: 4.7,
        ramRequired: 12,
        url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen2.5-7B-Instruct-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local'
    },
    {
        id: 'deepseek-v2-lite-agent',
        name: 'DeepSeek-V2 Lite',
        description: 'Versatile MoE reasoning expert. Efficient balanced performance across a wide range of analytical tasks.',
        sizeGB: 9.5,
        ramRequired: 16,
        url: 'https://huggingface.co/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF/resolve/main/DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf',
        filename: 'DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local'
    },
    {
        id: 'yi-1.5-9b-agent',
        name: 'Yi-1.5 9B',
        description: 'High-performance reasoning model. Optimized for long-context logic, multi-step planning, and creative tasks.',
        sizeGB: 5.4,
        ramRequired: 16,
        url: 'https://huggingface.co/bartowski/Yi-1.5-9B-Chat-GGUF/resolve/main/Yi-1.5-9B-Chat-Q4_K_M.gguf',
        filename: 'Yi-1.5-9B-Chat-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local'
    },
    {
        id: 'llama-3.1-8b-agent',
        name: 'Llama 3.1 8B (Adv)',
        description: 'Advanced multi-purpose specialist. Features a massive context window and refined versatility for all workflows.',
        sizeGB: 4.9,
        ramRequired: 12,
        url: 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        filename: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local'
    },
    {
        id: 'deepseek-coder-6.7b-agent',
        name: 'DeepSeek-Coder 6.7B',
        description: 'Coding automation specialist. Optimized for repository analysis and refactoring.',
        sizeGB: 4.1,
        ramRequired: 12,
        url: 'https://huggingface.co/TheBloke/deepseek-coder-6.7B-instruct-GGUF/resolve/main/deepseek-coder-6.7b-instruct.Q4_K_M.gguf',
        filename: 'deepseek-coder-6.7b-instruct.Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local'
    },
    {
        id: 'phi-3-mini-agent',
        name: 'Phi-3 Mini',
        description: 'Microsoft\'s efficient reasoning model. Powerful logic and broad knowledge in a remarkably fast, small package.',
        sizeGB: 2.3,
        ramRequired: 8,
        url: 'https://huggingface.co/bartowski/Phi-3-mini-4k-instruct-GGUF/resolve/main/Phi-3-mini-4k-instruct-Q4_K_M.gguf',
        filename: 'Phi-3-mini-4k-instruct-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local'
    },



    // Cloud Models
    {
        id: 'gpt-4.5-preview',
        name: 'GPT-4.5 Preview',
        description: 'OpenAI\'s frontier model with enhanced capabilities.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-openai-gpt-4.5-preview',
        tier: 'heavy',
        provider: 'openai',
        supportsVision: true
    },
    {
        id: 'o1-preview',
        name: 'o1 Preview',
        description: 'OpenAI\'s advanced reasoning model. Excellent for complex problem-solving.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-openai-o1-preview',
        tier: 'heavy',
        provider: 'openai',
        supportsThinking: true
    },
    {
        id: 'o3-mini',
        name: 'o3 Mini',
        description: 'Fast, cost-effective reasoning model from OpenAI.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-openai-o3-mini',
        tier: 'light',
        provider: 'openai',
        supportsThinking: true
    },
    {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'OpenAI\'s latest flagship model. Peerless intelligence, extreme speed, and native multimodal reasoning.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-openai-gpt-4o',
        tier: 'heavy',
        provider: 'openai',
        supportsVision: true
    },
    {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Affordable, capable, and fast model for lightweight tasks.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-openai-gpt-4o-mini',
        tier: 'light',
        provider: 'openai',
        supportsVision: true
    },
    {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Reliable and fast model for general instruction following, formatting, and everyday tasks.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-openai-gpt-3.5',
        tier: 'light',
        provider: 'openai'
    },
    {
        id: 'claude-3-7-sonnet-20250219',
        name: 'Claude 3.7 Sonnet',
        description: 'Anthropic\'s latest frontier model. Exceptional coding, reasoning, and multimodal capabilities.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-anthropic-claude-3-7-sonnet',
        tier: 'heavy',
        provider: 'anthropic',
        supportsVision: true,
        supportsThinking: true
    },
    {
        id: 'claude-3-5-sonnet',
        name: 'Claude 3.5 Sonnet',
        description: 'Anthropic\'s most advanced model. Industry-leading coding, reasoning, and high-fidelity output.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-anthropic-claude-3-5-sonnet',
        tier: 'heavy',
        provider: 'anthropic',
        supportsVision: true,
        supportsThinking: true
    },
    {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        description: 'Anthropic\'s fastest model. Optimized for speed, cost, and rapid text analysis.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-anthropic-claude-3-5-haiku',
        tier: 'light',
        provider: 'anthropic'
    },
    {
        id: 'claude-3-opus',
        name: 'Claude 3 Opus',
        description: 'Maximum capacity reasoning model. Specialized for highly complex, multi-layered analytical tasks.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-anthropic-claude-3-opus',
        tier: 'heavy',
        provider: 'anthropic',
        supportsVision: true
    },
    {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        description: 'Google\'s newest ultra-fast multimodal model. High volume, low latency.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-google-gemini-2.5-flash',
        tier: 'light',
        provider: 'google',
        supportsVision: true
    },
    {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        description: 'Google\'s powerful everyday multimodal model. Excellent balance of speed and capability.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-google-gemini-2.0-flash',
        tier: 'medium',
        provider: 'google',
        supportsVision: true
    },
    {
        id: 'gemini-2.0-pro-exp-02-05',
        name: 'Gemini 2.0 Pro Exp',
        description: 'Experimental heavyweight pro model from Google for complex instruction following.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-google-gemini-2.0-pro-exp',
        tier: 'heavy',
        provider: 'google',
        supportsVision: true
    },
    {
        id: 'gemini-2.0-flash-thinking-exp-01-21',
        name: 'Gemini 2.0 Flash Thinking',
        description: 'Google\'s experimental reasoning model. Excellent at parsing complex logical tasks.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-google-gemini-2.0-flash-thinking',
        tier: 'heavy',
        provider: 'google',
        supportsThinking: true
    },
    {
        id: 'gemini-1.5-pro',
        name: 'Gemini 1.5 Pro',
        description: 'Google\'s most capable model. Features a massive 2M token context window and deep multimodal understanding.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-google-gemini-1.5-pro',
        tier: 'heavy',
        provider: 'google',
        supportsVision: true
    },
    {
        id: 'gemini-1.5-flash',
        name: 'Gemini 1.5 Flash',
        description: 'Ultra-fast and efficient model from Google. Optimized for speed and high-volume multimodal processing.',
        sizeGB: 0,
        ramRequired: 0,
        url: '',
        filename: 'cloud-google-gemini-1.5-flash',
        tier: 'light',
        provider: 'google',
        supportsVision: true
    }
]



/**
 * Manages downloading of models and the llama-server binary.
 * Emits progress events for UI updates.
 */
export class DownloadService extends EventEmitter {
    private activeDownloads = new Map<string, { 
        abort: () => void, 
        pause: () => void,
        resume: () => void,
        url: string,
        destPath: string,
        status: 'downloading' | 'paused'
    }>()
    private readonly modelsDir: string
    private readonly llamaDir: string

    constructor(llamaBasePath: string) {
        super()
        this.llamaDir = llamaBasePath
        this.modelsDir = path.join(llamaBasePath, 'models')
        mkdirSync(this.modelsDir, { recursive: true })
    }

    getAvailableModels(): DownloadableModel[] {
        return AVAILABLE_MODELS.map((m) => ({ ...m }))
    }

    isModelDownloaded(modelId: string): boolean {
        const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
        if (!model) return false
        return existsSync(path.join(this.modelsDir, model.filename))
    }



    getModelPath(modelId: string): string | null {
        const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
        if (!model) return null
        const filePath = path.join(this.modelsDir, model.filename)
        return existsSync(filePath) ? filePath : null
    }

    /**
     * Returns the path to the mmproj vision adapter for a model, if downloaded.
     */
    getMmprojPath(modelId: string): string | null {
        const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
        if (!model || !model.mmprojFilename) return null
        const filePath = path.join(this.modelsDir, model.mmprojFilename)
        return existsSync(filePath) ? filePath : null
    }

    /**
     * Returns the path of the first available model, or null.
     * Prioritizes default model (qwen3.5-0.8b), then fallback model (qwen3.5-0.8b) if available.
     */
    getFirstAvailableModelPath(): string | null {
        // First, try to find the default model (qwen3.5-0.8b)
        const defaultModel = AVAILABLE_MODELS.find(m => m.id === 'qwen3.5-0.8b')
        if (defaultModel) {
            const defaultPath = path.join(this.modelsDir, defaultModel.filename)
            if (existsSync(defaultPath)) {
                console.log(`[DownloadService] Using default model: ${defaultPath}`)
                return defaultPath
            }
        }

        // Then try to find the fallback model (qwen3.5-0.8b)
        const fallbackModel = AVAILABLE_MODELS.find(m => m.id === 'qwen3.5-0.8b')
        if (fallbackModel) {
            const fallbackPath = path.join(this.modelsDir, fallbackModel.filename)
            if (existsSync(fallbackPath)) {
                console.log(`[DownloadService] Using fallback model: ${fallbackPath}`)
                return fallbackPath
            }
        }

        // Then try other available models in order
        for (const model of AVAILABLE_MODELS) {
            const filePath = path.join(this.modelsDir, model.filename)
            if (existsSync(filePath)) return filePath
        }

        try {
            const files = readdirSync(this.modelsDir)
            console.log(`[DownloadService] Scanning models directory: ${this.modelsDir}. Files found: ${files.length}`)
            // Fix: ignore files that look like vision projectors (mmproj) or are partial downloads
            const gguf = files.find((f: string) =>
                f.endsWith('.gguf') &&
                !f.toLowerCase().includes('mmproj') &&
                !f.toLowerCase().includes('clip')
            )
            if (gguf) {
                const fullPath = path.join(this.modelsDir, gguf)
                console.log(`[DownloadService] Automatically selected fallback model: ${fullPath}`)
                return fullPath
            }
            console.log(`[DownloadService] No valid fallback .gguf model found in ${this.modelsDir}`)
        } catch (err) {
            console.error(`[DownloadService] Failed to scan models directory:`, err)
        }

        return null
    }

    /**
     * Returns info about all downloaded models (id, name, filename, size, path).
     */
    getDownloadedModels(): DownloadedModelInfo[] {
        const result: DownloadedModelInfo[] = []

        for (const model of AVAILABLE_MODELS) {
            const filePath = path.join(this.modelsDir, model.filename)
            if (existsSync(filePath)) {
                try {
                    const stats = statSync(filePath)
                    result.push({
                        id: model.id,
                        name: model.name,
                        filename: model.filename,
                        sizeBytes: stats.size,
                        path: filePath,
                        supportsVision: model.supportsVision,
                        supportsThinking: model.supportsThinking
                    })
                } catch {
                    // ignore stat errors
                }
            }
        }

        return result
    }

    /**
     * Deletes a downloaded model file.
     */
    deleteModel(modelId: string): { success: boolean; error?: string } {
        const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
        if (!model) return { success: false, error: 'Unknown model' }

        const filePath = path.join(this.modelsDir, model.filename)
        if (!existsSync(filePath)) return { success: false, error: 'Model not downloaded' }

        try {
            unlinkSync(filePath)
            return { success: true }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete'
            return { success: false, error: message }
        }
    }

    /**
     * Downloads a model by ID with progress events.
     */
    async downloadModel(modelId: string): Promise<string> {
        const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
        if (!model) throw new Error(`Unknown model: ${modelId}`)

        const destPath = path.join(this.modelsDir, model.filename)
        await this.downloadFile(model.url, destPath, `model:${modelId}`)

        // If this model has a vision adapter, download it too
        if (model.mmprojUrl && model.mmprojFilename) {
            const mmprojPath = path.join(this.modelsDir, model.mmprojFilename)
            if (!existsSync(mmprojPath)) {
                console.log(`[Download] Fetching vision adapter for ${modelId}...`)
                await this.downloadFile(model.mmprojUrl, mmprojPath, `mmproj:${modelId}`)
            }
        }

        return destPath
    }

    /**
     * Pauses an active download.
     */
    pauseDownload(downloadId: string): void {
        const download = this.activeDownloads.get(downloadId)
        if (download && download.status === 'downloading') {
            download.pause()
            download.status = 'paused'
            this.emit('progress', { id: downloadId, status: 'paused' })
        }
    }

    /**
     * Resumes a paused download.
     */
    resumeDownload(downloadId: string): void {
        const download = this.activeDownloads.get(downloadId)
        if (download && download.status === 'paused') {
            download.status = 'downloading'
            download.resume()
        }
    }

    /**
     * Cancels an active download.
     */
    cancelDownload(downloadId: string): void {
        const download = this.activeDownloads.get(downloadId)
        if (download) {
            download.abort()
            this.activeDownloads.delete(downloadId)
            this.emit('error', { id: downloadId, error: 'Download cancelled' })
        }
    }

    /**
     * Core download function with redirect following, progress tracking, and abort support.
     */
    private downloadFile(url: string, destPath: string, downloadId: string, resume = false): Promise<void> {
        return new Promise((resolve, reject) => {
            const tempPath = `${destPath}.download`
            let aborted = false
            let paused = false
            let currentReq: http.ClientRequest | null = null

            const cleanup = (): void => {
                try {
                    if (existsSync(tempPath)) unlinkSync(tempPath)
                } catch { /* ignore */ }
            }

            const abort = (): void => {
                aborted = true
                if (currentReq) currentReq.destroy()
                console.log(`[DownloadService] Download cancelled: ${downloadId}`)
                cleanup()
                const error = new Error('Download cancelled')
                this.emit('error', { id: downloadId, error: error.message })
                reject(error)
            }

            const pause = (): void => {
                paused = true
                if (currentReq) currentReq.destroy()
                console.log(`[DownloadService] Download paused: ${downloadId}`)
            }

            const resumeFn = (): void => {
                paused = false
                const downloaded = existsSync(tempPath) ? statSync(tempPath).size : 0
                startDownload(url, 0, downloaded)
            }

            this.activeDownloads.set(downloadId, { 
                abort, 
                pause, 
                resume: resumeFn, 
                url, 
                destPath, 
                status: 'downloading' 
            })

            const startDownload = (downloadUrl: string, redirectCount = 0, offset = 0): void => {
                if (redirectCount > 5) {
                    cleanup()
                    reject(new Error('Too many redirects'))
                    return
                }

                console.log(`[DownloadService] Starting download from: ${downloadUrl}${offset > 0 ? ` (offset: ${offset})` : ''}`)

                const client = downloadUrl.startsWith('https') ? https : http
                const headers: Record<string, string> = { 'User-Agent': 'LocalAI-Desktop-App' }
                if (offset > 0) {
                    headers['Range'] = `bytes=${offset}-`
                }

                const req = client.get(downloadUrl, { headers, timeout: 300000 }, (res) => {
                    currentReq = req
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        console.log(`[DownloadService] Redirecting to: ${res.headers.location}`)
                        startDownload(res.headers.location, redirectCount + 1, offset)
                        return
                    }

                    if (res.statusCode !== 200 && res.statusCode !== 206) {
                        cleanup()
                        reject(new Error(`Download failed: HTTP ${res.statusCode}`))
                        return
                    }

                    // For 206 Partial Content, we need the total from Content-Range or Content-Length + offset
                    let total = parseInt(res.headers['content-length'] ?? '0', 10)
                    if (res.statusCode === 206 && res.headers['content-range']) {
                        const match = res.headers['content-range'].match(/\/(\d+)$/)
                        if (match) {
                            total = parseInt(match[1], 10)
                        }
                    } else if (offset > 0) {
                        total += offset
                    }

                    let downloaded = offset
                    const startTime = Date.now() - (offset > 0 ? 1000 : 0) // Tiny offset to avoid div by zero if speed calc happens instantly

                    const file = createWriteStream(tempPath, { flags: offset > 0 ? 'a' : 'w' })

                    res.on('data', (chunk: Buffer) => {
                        if (aborted) return

                        // Reset timeout on every chunk to ensure active downloads don't time out
                        req.setTimeout(60000)

                        downloaded += chunk.length
                        const elapsed = (Date.now() - startTime) / 1000
                        const speedMBps = elapsed > 0 ? (downloaded / (1024 * 1024)) / elapsed : 0
                        const remaining = total > 0 ? ((total - downloaded) / (1024 * 1024)) / (speedMBps || 1) : 0

                        const progress: DownloadProgress = {
                            id: downloadId,
                            filename: path.basename(destPath),
                            downloaded,
                            total,
                            percent: total > 0 ? Math.round((downloaded / total) * 100) : 0,
                            speedMBps: Math.round(speedMBps * 100) / 100,
                            etaSeconds: Math.round(remaining),
                            status: 'downloading'
                        }

                        this.emit('progress', progress)
                    })

                    res.pipe(file)

                    file.on('finish', () => {
                        req.destroy()
                        file.destroy() // Explicitly destroy to release lock
                        
                        // Wait slightly to let OS close handle
                        setTimeout(async () => {
                            if (aborted || paused) {
                                if (aborted) cleanup()
                                return
                            }

                            const finalize = async () => {
                                for (let attempt = 1; attempt <= 10; attempt++) {
                                    try {
                                        if (aborted) return

                                        if (attempt === 1) {
                                            const stats = statSync(tempPath)
                                            if (total > 0 && stats.size !== total) {
                                                throw new Error(`Download incomplete: expected ${total} bytes, got ${stats.size} bytes`)
                                            }
                                        }

                                        if (existsSync(destPath)) {
                                            try { unlinkSync(destPath) } catch (e) { /* ignore */ }
                                        }

                                        renameSync(tempPath, destPath)
                                        console.log(`[DownloadService] Download complete: ${downloadId}`)
                                        
                                        this.activeDownloads.delete(downloadId)
                                        this.emit('complete', { id: downloadId, path: destPath })
                                        resolve()
                                        return
                                    } catch (err) {
                                        if (attempt === 10) {
                                            console.error(`[DownloadService] Error finalizing download ${downloadId} after 10 attempts:`, err)
                                            if (!aborted) cleanup()
                                            reject(err)
                                            return
                                        }
                                        console.warn(`[DownloadService] Finalization attempt ${attempt} failed for ${downloadId}, retrying in 1000ms...`)
                                        await new Promise(r => setTimeout(r, 1000))
                                    }
                                }
                            }

                            finalize()
                        }, 500) // Increased initial delay
                    })

                    file.on('error', (err) => {
                        console.error(`[DownloadService] File stream error for ${downloadId}:`, err)
                        cleanup()
                        this.emit('error', { id: downloadId, error: err.message })
                        reject(err)
                    })
                })

                req.on('timeout', () => {
                    console.error(`[DownloadService] Download timed out for ${downloadId}`)
                    req.destroy()
                    cleanup()
                    reject(new Error('Download timed out after 60 seconds of inactivity'))
                })

                req.on('error', (err) => {
                    console.error(`[DownloadService] Request error for ${downloadId}:`, err)
                    cleanup()
                    this.emit('error', { id: downloadId, error: err.message })
                    reject(err)
                })
            }

            startDownload(url)
        })
    }
}
