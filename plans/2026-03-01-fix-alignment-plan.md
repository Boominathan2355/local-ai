# Fix Space Alignment in System Prompt Editor

The goal is to fix a large gap in the System Prompt Editor between the section description and the prompt presets. This gap is caused by the use of the `.settings-row__label` class inside a column layout, which results in an unintended fixed height.

## Proposed Changes

### Settings Panel Component

#### [MODIFY] [SettingsPanel.tsx](file:///home/bn/projects/local-ai/src/components/settings/SettingsPanel.tsx)

- Update the label container for the "System Prompt" section to use a different class (e.g., `settings-group__label-block`) or remove the `settings-row__label` class to prevent the unintended flex-basis height.

### Styling

#### [MODIFY] [settings.css](file:///home/bn/projects/local-ai/src/styles/settings.css)

- Refine the `.settings-row__label` rule to only apply `flex: 0 0 280px` when it is a direct child of `.settings-row`. This ensures that when the class is used elsewhere, it doesn't cause alignment issues.

## Verification Plan

### Manual Verification
- Open the Settings panel and navigate to the "AI Configuration" tab.
- Verify that the gap between the "System Prompt" description and the preset buttons is gone.
- Check other settings rows (e.g., Theme Mode, API Keys) to ensure their alignment is still correct.
