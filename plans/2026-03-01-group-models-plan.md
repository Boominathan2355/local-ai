# Group Models in Model Library

The goal is to restructure the Model Library UI to display models in three distinct groups: **Local**, **Cloud**, and **Agent**. Currently, models are grouped by their performance tiers (Ultra Light, Light, etc.).

## Proposed Changes

### Model Library Component

#### [MODIFY] [ModelLibrary.tsx](file:///home/bn/projects/local-ai/src/components/library/ModelLibrary.tsx)

- Redefine `groupedModels` to organize models into `local`, `cloud`, and `agent` categories.
- **Agent**: Models with `tier === 'agent'`.
- **Cloud**: Models where `provider` is not `'local'`.
- **Local**: Models where `provider === 'local'` (or undefined) and `tier !== 'agent'`.
- Update the rendering loop to use these new groups.
- Remove `TIER_ORDER`, `TIER_LABELS`, and `TIER_ICONS` if they are no longer needed for grouping, or repurpose them for badges within the cards.
- Update the section headers to use appropriate icons and labels for the new groups.

### Styling

#### [MODIFY] [model-library.css](file:///home/bn/projects/local-ai/src/styles/model-library.css)

- Add or update styles for the new group sections if necessary.
- Ensure the layout remains clean and responsive.

## Verification Plan

### Manual Verification
- Open the Model Library in the application.
- Verify that models are displayed in three sections: "Local Models", "Cloud Models", and "AI Agents".
- Ensure that the icons and labels for each section are correct.
- Verify that each model appears in the correct section.
- Test downloading a local model and ensure it stays in the "Local" section.
- Test switching to a cloud model and ensure it stays in the "Cloud" section.
