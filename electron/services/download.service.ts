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
}

export interface DownloadProgress {
    id: string
    filename: string
    downloaded: number
    total: number
    percent: number
    speedMBps: number
    etaSeconds: number
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

    // Medium Tier (10–12 GB RAM)
    {
        id: 'mistral-7b',
        name: 'Mistral 7B v0.3',
        description: 'The industry-standard 7B model. Highly reliable, fast, and excellent for diverse creative and technical conversations.',
        sizeGB: 4.4,
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
        id: 'qwen3.5-0.8b',
        name: 'Qwen 3.5 0.8B',
        description: 'Cutting-edge ultra-compact vision model. Features the latest architecture for lightning-fast multimodal interaction.',
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
        sizeGB: 2.5,
        ramRequired: 8,
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
    {
        id: 'qwen2.5-32b',
        name: 'Qwen 2.5 32B',
        description: 'State-of-the-art large local model. Competitive with GPT-4 in many benchmarks while running entirely offline.',
        sizeGB: 19.8,
        ramRequired: 32,
        url: 'https://huggingface.co/bartowski/Qwen2.5-32B-Instruct-GGUF/resolve/main/Qwen2.5-32B-Instruct-Q4_K_M.gguf',
        filename: 'Qwen2.5-32B-Instruct-Q4_K_M.gguf',
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
        id: 'deepseek-r1-qwen-32b-agent',
        name: 'DeepSeek R1 Qwen 32B',
        description: 'Elite local reasoning powerhouse. Near-frontier levels of logic and math for high-stakes offline analysis.',
        sizeGB: 19.8,
        ramRequired: 32,
        url: 'https://huggingface.co/unsloth/DeepSeek-R1-Distill-Qwen-32B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf',
        filename: 'DeepSeek-R1-Distill-Qwen-32B-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local',
        supportsThinking: true
    },
    {
        id: 'deepseek-coder-v2-lite-agent',
        name: 'DeepSeek Coder V2 Lite',
        description: 'State-of-the-art MoE coding expert. Exceptional across 300+ languages with advanced architectural understanding.',
        sizeGB: 10.4,
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
        id: 'qwen3-coder-next-agent',
        name: 'Qwen 3 Coder Next',
        description: 'Next-generation software engineering flagship. Optimized for complex repo-level logic and advanced coding.',
        sizeGB: 2.5,
        ramRequired: 8,
        url: 'https://huggingface.co/unsloth/Qwen3-Coder-Next-GGUF/resolve/main/Qwen3-Coder-Next-Q4_K_M.gguf',
        filename: 'Qwen3-Coder-Next-Q4_K_M.gguf',
        tier: 'agent',
        provider: 'local'
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
        sizeGB: 11.2,
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
    private activeDownloads = new Map<string, { abort: () => void }>()
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
     */
    getFirstAvailableModelPath(): string | null {
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
     * Cancels an active download.
     */
    cancelDownload(downloadId: string): void {
        const download = this.activeDownloads.get(downloadId)
        if (download) {
            download.abort()
            this.activeDownloads.delete(downloadId)
        }
    }

    /**
     * Core download function with redirect following, progress tracking, and abort support.
     */
    private downloadFile(url: string, destPath: string, downloadId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const tempPath = `${destPath}.download`
            let aborted = false

            const cleanup = (): void => {
                try {
                    if (existsSync(tempPath)) unlinkSync(tempPath)
                } catch { /* ignore */ }
            }

            const abort = (): void => {
                aborted = true
                console.log(`[DownloadService] Download cancelled: ${downloadId}`)
                cleanup()
                reject(new Error('Download cancelled'))
            }

            this.activeDownloads.set(downloadId, { abort })

            const startDownload = (downloadUrl: string, redirectCount = 0): void => {
                if (redirectCount > 5) {
                    cleanup()
                    reject(new Error('Too many redirects'))
                    return
                }

                console.log(`[DownloadService] Starting download from: ${downloadUrl}`)

                const client = downloadUrl.startsWith('https') ? https : http
                const req = client.get(downloadUrl, { timeout: 60000 }, (res) => {
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        console.log(`[DownloadService] Redirecting to: ${res.headers.location}`)
                        startDownload(res.headers.location, redirectCount + 1)
                        return
                    }

                    if (res.statusCode !== 200) {
                        cleanup()
                        reject(new Error(`Download failed: HTTP ${res.statusCode}`))
                        return
                    }

                    console.log(`[DownloadService] First chunk received for ${downloadId}`)

                    const total = parseInt(res.headers['content-length'] ?? '0', 10)
                    let downloaded = 0
                    const startTime = Date.now()

                    const file = createWriteStream(tempPath)

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
                            etaSeconds: Math.round(remaining)
                        }

                        this.emit('progress', progress)
                    })

                    res.pipe(file)

                    file.on('finish', () => {
                        req.destroy()
                        file.destroy() // Explicitly destroy to release lock
                        
                        // Wait slightly to let OS close handle
                        setTimeout(async () => {
                            if (aborted) {
                                cleanup()
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
                    reject(err)
                })
            }

            startDownload(url)
        })
    }
}
