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

- Fixing Code Smells in D3.a
  Magic Numbers → Constants: Extracted all hardcoded values (colors, opacity, weights, durations) into named constants at the top. Makes maintenance and tuning much easier.

- Extracted Helper Functions (reduced duplication and improved readability):
  removeCellLayer(): Centralizes layer removal logic instead of repeating it
  getCellBounds(): Handles lat/lng→bounds conversion
  getCellVisuals(): Decouples cell styling logic
  applyCellHoverStyle(): Encapsulates hover state management

- Improved Variable Naming:
  n → notification (more descriptive)
  Removed unhelpful comments
  Removed Unnecessary Array Conversion: Changed Array.from(cellLayers.keys()) to just cellLayers.keys() for iteration (minor but cleaner).
  Better Code Organization: Constants are grouped, helper functions are placed logically near where they're used, and similar operations are consolidated.

## D3.b Progress Track

### Step 0: Player Movement & Coordinate System ✓

- Switched from fixed classroom location to Null Island (0°, 0°) as player spawn point.
- Converted `playerCell` to a mutable state variable (object with `i` and `j` properties) that updates as player moves.
- Added `cellToLatLng()` helper function to convert cell coordinates back to lat/lng for map positioning.
- Added `movePlayer(di, dj)` function to handle movement delta, update player marker position, pan map, and redraw the grid.
- Implemented **keyboard controls**:
  - Arrow keys (↑↓←→) for movement
  - WASD keys (W/A/S/D) for alternative control scheme
  - All keys preventDefault to avoid unwanted page scrolling
- Implemented **D-pad style movement buttons** in bottom-right corner with:
  - Grid layout positioning (up/down/left/right arrangement)
  - Purple gradient background with smooth hover effects
  - Scale animation on hover for visual feedback
  - Clean arrow-only labels (↑↓←→)
- Player marker (`playerMarker`) now displays at the player's current cell position and updates dynamically as they move.
- Map automatically pans to keep the player centered on screen after each movement.
- Grid cells redraw on movement to show new in-range interactions and maintain farmability (cells spawn/despawn as player moves).

### Step 1: Map Panning & Grid Updates ✓

- Made sure implemented `moveend` event listener that triggers `drawVisibleGrid()` whenever the player moves or the map pans.
- Cells now dynamically spawn and despawn as the player moves across the globe, keeping the screen full of interactive content.
- Extended grid buffer to ±2 cells beyond viewport edges (previously ±1) to ensure **zero blank areas** during fast panning and prevent visual gaps.
- Off-screen cells are efficiently removed from memory to maintain performance across large play sessions.
- Grid rendering is viewport-aware: only cells within the visible bounds + buffer are drawn, reducing memory usage and improving frame rate.

### Step 2: Cell Coordinate System (Refactor) ✓

- **Cell type:** Introduced a single `Cell` shape used throughout the code: `{ i: number; j: number }` representing integer cell coordinates independent of screen or Leaflet types.
- **latLngToCell:** Annotated `latLngToCell(lat, lng): Cell` to explicitly return the `Cell` type and to centralize continuous→cell conversion (uses `Math.floor` with `TILE_DEGREES`).
- **cellBounds:** Added `cellBounds(cell)` helper which returns simple, map-independent corner coordinates for a cell as `{ topLeft: [lat, lng], bottomRight: [lat, lng] }` (useful for logic/testing separate from Leaflet bounds).
- **drawOrUpdateCell:** Refactored to accept a `Cell` (`drawOrUpdateCell(cell: Cell)`) instead of separate `i, j` numeric args; internals now use `cell.i` / `cell.j` and the function uses `getCellBounds(cell.i, cell.j)` to produce Leaflet bounds.
- **Call sites updated:** All internal callers (grid drawing loop, interaction handlers, flash/redraw helpers) now pass a `Cell` object like `{ i, j }` to `drawOrUpdateCell`.

Notes:

- The new `cellBounds` helper is intentionally independent of Leaflet; the code still uses `getCellBounds(i, j)` where Leaflet `LatLngBounds` are required. `cellBounds` can be used for testing or non-visual logic.
- TypeScript/linters may warn that `cellBounds` is unused; prefix with an underscore (`_cellBounds`) or use it where appropriate to silence the warning.
