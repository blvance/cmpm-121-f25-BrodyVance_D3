# D3: {World of Bits}

Game Design Vision

World of Bits is a lightweight map-based puzzle game where the player moves around a tiled world made of deterministic grid cells. Each cell may contain a token (numeric value). The player can pick up one token at a time, carry it in an inventory slot, and craft by placing a token onto an identical token to create a doubled-value token. The goal is to obtain high-value tokens through collection and crafting while interacting only with nearby cells.

Technologies

- TypeScript for game logic (all code lives under `src/`)
- Deno + Vite for building and local development
- Leaflet for map rendering and interaction
- Small deterministic "luck" helper (starter code) for stable token placement
- CSS collected in `style.css` for UI

Assignments

## D3.a: Core mechanics (token collection and crafting)

Summary

Implement the core map and token mechanics so a player can view an infinite-feeling tiled map, inspect cell contents at a glance, pick up one token, and craft by placing equal tokens together to double their value.

Key requirements (from the assignment)

- Software requirements
  - Use Leaflet to render an interactive map centered on the classroom location (player is fixed there).
  - Render a global grid of square cells (e.g., roughly 0.0001° per side) visible to the map edges so the world appears tiled everywhere.
  - Show the contents of each visible cell (token present and its value) without clicking—use text, sprites, or procedural canvas drawing.
  - Clicking a cell exercises game mechanics (pick up, place/craft).
  - Token spawning must be deterministic using a hashing/luck function so cell contents are consistent across page loads.

- Gameplay requirements
  - Player can see cells to map edges (no blank areas when not panning).
  - Player may only interact with cells near them (e.g., within ~3 cells radius).
  - Initial state of cells is consistent between page loads.
  - Inventory: hold at most one token; picking up removes token from the cell.
  - Inventory UI clearly shows whether the player holds a token and its value.
  - Crafting: placing a held token onto a cell with a token of equal value removes both and replaces them with a single token of double value in that cell.
  - The game detects reaching a target token value (e.g., 8 or 16) and can surface that event.

Implementation plan

Contract (concise):

- Inputs: current map center (fixed), deterministic luck function, click events on visible cells.
- Outputs: rendered Leaflet map with tile-grid overlay, cell visuals showing token values, inventory UI, click-handling that updates cell and inventory state deterministically.
- Error modes: cell outside interaction radius should ignore clicks; deterministic hashing should not mutate global RNG state.

Key edge cases

- Clicking out-of-range cell — should do nothing and optionally show a subtle UI hint.
- Attempting to pick up when inventory is full — should not allow pickup or should first require placing/dropping.
- Floating-point / coordinate rounding when mapping lat/lng to cell coordinates — use a stable integer grid mapping.
- Map zoom/resize — cell rendering must adapt so cells still appear to cover the visible area and keep consistent cell indices.

Development tasks (minimal, ordered)

1. Project scaffolding and contracts (small README update). Create clear constants for classroom lat/lng and grid cell size (0.0001° default).
2. Replace `src/main.ts` content (per assignment tip) with a fresh entry that:
   - Initializes Leaflet centered on the classroom location with a simple basemap.
   - Implements a cell index conversion: (lat, lng) -> (cellX, cellY) integer pair using floor(lat / cellSize), floor(lng / cellSize) or an equivalent stable mapping.
   - Renders a semi-transparent grid covering the visible map area using Leaflet Layer or canvas overlay so cells appear to tile to the map edges.
   - For each visible cell, calls the deterministic luck/hash function to determine whether a token exists and its value.
   - Draws per-cell visuals (text or small canvas/sprite) for token presence/value so players see tokens without clicking.
3. Implement deterministic token generation
   - Use provided `luck` helper to generate consistent per-cell token presence and value based on (cellX, cellY) and a global seed.
4. Interaction & game rules
   - Track player inventory (single slot). Render inventory UI in a fixed overlay element.
   - Allow clicks on visible cells. If in-range:
     - If inventory empty and cell has token: pick up token (remove from cell state) and update UI.
     - If inventory has token and cell empty: place token into cell (clear inventory).
     - If inventory has token and cell has token of equal value: craft — cell receives doubled token value, inventory clears, update visuals. If doubled token exceeds target, trigger win/notification.
   - If cell out-of-range: ignore clicks and optionally show a toast.
5. Nearby check
   - Convert "about three cells away" into an integer radius (3) using Manhattan or Chebyshev distance in cell coordinates.
6. Persistence and consistency
   - Do not persist mutable global state for cell contents — rely on deterministic generation for initial state and track player-made changes in a small in-memory map keyed by cell coords so modifications persist while the page is open. On reload the deterministic initial state is used again (as required). Optionally implement a localStorage layer for continued play if desired.
7. UI polish & tests
   - Ensure inventory is visible and updates instantly.
   - Add visual highlight for in-range cells on hover.
   - Add a small notification for reaching the target token value.

Milestones and timeline

- Read docs and sketch mapping math; set constants (classroom location, cell size).
- Leaflet initialization + stable grid rendering + deterministic token visual rendering.
- Interaction, inventory, crafting rules, in-range checks.
- Polish visuals, add small tests/manual checks, finalize acceptance criteria.

Acceptance criteria (what "done" looks like)

- Map loads centered on classroom location and shows a continuous grid of cells to the map edges.
- Each visible cell shows whether it contains a token and the token's value; this is visible without clicking.
- Clicking an in-range cell picks up a token into inventory (if empty) and removes it from the cell.
- Placing a token onto an equal-value token in a cell doubles the token and clears inventory.
- Initial state is deterministic across reloads (same cell yields same token presence/value before any player edits).
- Player can only interact with cells within ~3 cells of the classroom location.
- Inventory UI clearly shows the held token or empty state.

Testing and verification

- Manual tests to run after implementation:

      1. Reload page multiple times and confirm token layout is consistent for a few sample cells.
      2. Pick up token near player and confirm it disappears from the cell and appears in inventory.
      3. Try to pick up when inventory full — confirm not allowed.
      4. Place token onto matching token and confirm doubled token appears.
      5. Click an out-of-range cell and confirm nothing happens.
      6. Verify grid lines and per-cell visuals render correctly under common zoom levels.

- Small unit tests (optional): test cell coordinate conversion and a handful of deterministic luck outputs for fixed coords and seed.
