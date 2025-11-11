# CMPM 121 D3 Project

Created the PLAN.md file and duplicated main file original code into reference.ts and then deleted all code in the main file.

## D3.a Progress Track

- A fresh `src/main.ts` implementation scaffold that implements the core mechanics for D3.a:
  - Leaflet map initialized and centered on the classroom location.
  - Grid overlay that covers the visible viewport; each cell is drawn as a Leaflet rectangle so the map looks tiled to the edges.
  - Deterministic token generation per cell using the existing `luck` helper (`initialTokenForCell`), producing token values (2, 4, 8, 16) with tuned probabilities.
  - Per-cell visuals: token values are shown as permanent tooltips on cells that contain tokens.
  - A single-slot inventory model with a simple overlay UI (the `statusPanelDiv`) showing the held token value or `empty`.
  - Interaction rules implemented on click: pickup (if inventory empty), place (if inventory holds a token and cell empty), and craft (placing a token onto an equal-value token doubles the value).
  - In-range checks so the player can only interact with cells within a configurable radius (~3 cells) from the classroom location.
  - Small hover/highlight behavior and a short notification system for events like crafting a target value.
  - Debug helpers exposed to the runtime (`globalThis._modifiedCells`, `globalThis._getCellToken`) to inspect current in-memory modifications.
  - TypeScript/lint fixes applied (no `any`, `dashArray` set to `undefined` to satisfy Leaflet typings).
