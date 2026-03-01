# Add CPU and GPU bars to Model Library

Add visual usage bars for CPU and GPU in the Model Library's system capacity section to help users understand their system resources.

## Proposed Changes

### [Component: Electron Backend]

#### [MODIFY] [storage.service.ts](file:///home/bn/projects/local-ai/electron/services/storage.service.ts)
- Update `SystemInfo` interface to include `cpuUsagePercent`, `gpuName`, `gpuMemoryTotalMB`, and `gpuMemoryFreeMB`.
- Update `getSystemInfo()` to include CPU usage percentage and basic GPU information.

#### [MODIFY] [handlers.ts](file:///home/bn/projects/local-ai/electron/ipc/handlers.ts)
- Ensure `SYSTEM_GET_INFO` returns the updated `SystemInfo` object.

#### [MODIFY] [preload index.ts](file:///home/bn/projects/local-ai/electron/preload/index.ts)
- Update the `system.getInfo` return type to include the new fields.

### [Component: Frontend UI]

#### [MODIFY] [ModelLibrary.tsx](file:///home/bn/projects/local-ai/src/components/library/ModelLibrary.tsx)
- Update internal `SystemInfo` interface.
- Add an interval of 5 seconds to poll system info while the library is open.
- Add CPU usage bar to the `library__capacity` section.
- Add GPU usage/info section if data is available.

## Verification Plan

### Manual Verification
1. Open Model Library.
2. Observe the new CPU and GPU bars.
3. Verify that CPU usage reflects system load.
4. Verify GPU detects the correct hardware if possible.
