# Web Search Implementation Plan

Implement web search functionality for the local AI assistant, allowing users to toggle web search for their queries.

## User Review Required

> [!IMPORTANT]
> This feature requires a **Serper.dev API Key**. Users will need to add their API key in the settings panel to enable web searching.
> Web search is NOT fully offline; it requires an internet connection when toggled ON.

## Proposed Changes

### Configuration & Types

#### [MODIFY] [settings.types.ts](file:///home/bn/projects/local-ai/src/types/settings.types.ts)
* Add `serperApiKey` to `AppSettings` interface.
* Add `serperApiKey: ''` to `DEFAULT_SETTINGS`.

### Frontend Logic

#### [MODIFY] [MessageInput.tsx](file:///home/bn/projects/local-ai/src/components/chat/MessageInput.tsx)
* Add `isSearchEnabled` state.
* Update `onSend` signature to include `isSearchEnabled`.
* Implement toggle button with active state styling.

#### [MODIFY] [ChatWindow.tsx](file:///home/bn/projects/local-ai/src/components/chat/ChatWindow.tsx) & [App.tsx](file:///home/bn/projects/local-ai/src/App.tsx)
* Propagate the `isSearchEnabled` parameter from `MessageInput` to `useChat`.

#### [MODIFY] [useChat.ts](file:///home/bn/projects/local-ai/src/hooks/useChat.ts)
* Update `sendMessage` to accept `searchEnabled` and pass it to the IPC call.

#### [MODIFY] [SettingsPanel.tsx](file:///home/bn/projects/local-ai/src/components/settings/SettingsPanel.tsx)
* Add a field for entering the Serper API key.

### Backend (Electron)

#### [MODIFY] [preload/index.ts](file:///home/bn/projects/local-ai/electron/preload/index.ts)
* Update `sendMessage` signature in `LocalAIApi`.

#### [MODIFY] [ipc/handlers.ts](file:///home/bn/projects/local-ai/electron/ipc/handlers.ts)
* Update `CHAT_SEND_MESSAGE` handler to accept `searchEnabled`.
* Integrate `SearchService` to fetch results if enabled.

#### [NEW] [search.service.ts](file:///home/bn/projects/local-ai/electron/services/search.service.ts)
* Implement `SearchService` to fetch data from Serper.dev.

### Styling

#### [MODIFY] [chat.css](file:///home/bn/projects/local-ai/src/styles/chat.css)
* Add styling for `.chat__web-search--active`.

## Verification Plan

### Automated Tests
* Since there are no existing tests, I will rely on manual verification and console logging on the backend.

### Manual Verification
1. Open Settings and enter a valid Serper API key.
2. Go to chat and toggle "Web Search" ON.
3. Ask a question about recent events (e.g., "What is the current weather in New York?").
4. Verify that the assistant responds with up-to-date information (results should be visible in backend logs first).
5. Toggle "Web Search" OFF and ask the same; it should rely only on its internal knowledge.
