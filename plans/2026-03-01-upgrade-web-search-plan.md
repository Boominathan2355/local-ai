# Implementation Plan - Upgrade Web Search Effectiveness

The current web search implementation is limited to Google snippets (via Serper.dev) and uses the raw user prompt for searching. This often leads to suboptimal results. This plan upgrades the system to use AI-driven search query generation and adds support for Tavily, a search engine optimized for LLMs.

## User Review Required

> [!IMPORTANT]
> This upgrade introduces **Tavily** as a recommended search provider. Users will need to provide a Tavily API key for the best experience, though Serper.dev will remain supported as a fallback.

## Proposed Changes

### Core Logic & Services

#### [MODIFY] [settings.types.ts](file:///home/bn/projects/local-ai/src/types/settings.types.ts)
- Add `tavilyApiKey` to `AppSettings` interface.
- Add `tavilyApiKey` to `DEFAULT_SETTINGS`.

#### [MODIFY] [search.service.ts](file:///home/bn/projects/local-ai/electron/services/search.service.ts)
- Implement `searchTavily(query: string, apiKey: string)` method.
- Update `search` to check for available keys and prioritize Tavily if configured.

#### [MODIFY] [handlers.ts](file:///home/bn/projects/local-ai/electron/ipc/handlers.ts)
- Add a helper function `generateSearchQuery` that uses the current LLM to refine the user's prompt into a search-optimized query.
- Update `IPC_CHANNELS.CHAT_SEND_MESSAGE` to:
    1. Generate an optimized search query.
    2. Perform the search using the improved `SearchService`.
    3. Inject more detailed context into the model's prompt.

### UI Components

#### [MODIFY] [SettingsPanel.tsx](file:///home/bn/projects/local-ai/src/components/settings/SettingsPanel.tsx)
- Add a text input for `tavilyApiKey` in the "API Keys" section.
- Add descriptive text explaining that Tavily provides better results for AI agents.

## Verification Plan

### Automated Tests
- Create a scratch script `/tmp/test-search.js` to verify `SearchService` logic with mock responses for both Serper and Tavily.
- Run with `node /tmp/test-search.js`.

### Manual Verification
1. Open Settings -> API Keys and enter a Tavily API key.
2. Enable "Web Search" in the chat input.
3. Ask a question requiring real-time info (e.g., "Current stock price of NVIDIA").
4. Verify in the logs that a refined query was generated (e.g., "NVIDIA stock price current").
5. Verify the assistant's response incorporates the search results accurately.
