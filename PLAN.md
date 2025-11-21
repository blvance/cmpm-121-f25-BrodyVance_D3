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
2. Replace `src/main.ts` content with a fresh entry that:
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

Code Smells and Clean up

- Don't change the games gameplay features, just ensure code quality is good
  1. Free of distracting smells
  2. Problematic repition
  3. Remove debbugging code

- Check deployment after cleaning code

---

## D3.b: Globe-spanning Gameplay

Expand the game to support player movement across the map and an earth-spanning coordinate system anchored at Null Island (0°, 0°).

### Core checklist

- 1.[x ] Player movement & coordinate system
  - [x ] Add movement simulation controls (north/south/east/west buttons or keyboard)
  - [x ] Switch from fixed classroom location to earth-spanning coordinates anchored at Null Island (0, 0)
  - [x ] Update player position state and marker as movement occurs

- 2.[x] Map panning & grid updates
  - [x] Implement `moveend` event listener to trigger grid re-rendering when player pans
  - [x] Ensure cells spawn/despawn dynamically as player moves to keep screen full
  - [x] Cells should remain visible to map edges (no blank areas)

- 3.[x ] Cell coordinate system (refactor)
  - [x ] Define `Cell` interface/type: `{ i: number; j: number }` (independent of screen representation)
  - [x ] Create function `latLngToCell(lat, lng): Cell` for continuous→cell conversion
  - [x ] Create function `cellBounds(cell): { topLeft: [lat, lng], bottomRight: [lat, lng] }` for cell→bounds conversion
  - [ x] Update `drawOrUpdateCell` to use new `Cell` type throughout

- 4.[ x] Interaction radius & in-range checks
  - [ x] Update `isInRange` to check against player's current cell position (not fixed classroom)
  - [ x] Player can only interact with cells within ~3 cells of their current position

- 5.[x ] State persistence (cells forget off-screen)
  - [x ] Ensure `modifiedCells` map is cleared/reset when cells leave visibility range
  - [x ] Verify cells show initial deterministic state on re-entry (farming behavior)
  - [x ] Document this temporary behavior (will be fixed in D3.c)

- 6.[ x] Crafting & victory
  - [x ] Update `TARGET_VALUE` to a higher threshold (e.g., 16 or 32)
  - [x ] Declare victory when player reaches the new target
  - [ x] Display victory message or UI element

- 7.[ x] Manual testing
  - [x ] Move player in all directions and confirm cells spawn/despawn correctly
  - [x ] Verify player can only interact with nearby cells
  - [x ] Confirm cells reset state when they re-enter visibility (farming)
  - [x ] Test crafting to new target value and victory declaration

- 8.[x ] Code Refactoring and code smells
  - [x ] Remove any unused variables or dead code
  - [x ] Ensure all linting errors are resolved (deno lint passes)
  - [x ] Check TypeScript types are correct and no `any` types remain
  - [x ] Consolidate repeated logic into helper functions
  - [x ] Add clear comments/documentation for complex sections
  - [x ] Verify all console.log or debug statements are removed

### Acceptance criteria (quick)

- Player can move character or pan map; cells always fill the viewport
- Cells use earth-spanning coordinates anchored at Null Island
- Player can only interact with cells near their current position
- Cells reset state when off-screen; farmable by moving in/out of range
- Victory declared when new (higher) target token value is reached

### Implementation notes

- Use Leaflet's `map.on('moveend', ...)` to detect when panning/movement finishes and trigger grid update
- Separate cell identity (i, j pair) from visual representation (Leaflet rectangle)
- Consider storing player position as `playerCell: Cell` to simplify in-range checks
- Optional: add keyboard shortcuts (arrow keys) or buttons for movement simulation

---

## D3.C: — Object Persistence

Goal: Ensure that cells on the map persist their state even after scrolling off-screen, while minimizing memory usage.

### Flyweight Cell Representation

- The base grid is not stored as a full matrix.
- Unmodified cells are implicit and require no memory.
- A JavaScript Map will store only modified cells.
- Key: a string or tuple representing cell coordinates (i, j)
- Value: a token object or cell-state object
- This allows large areas of unexplored/unchanged map to consume zero memory.

### Memento-Style State Saving

- When a cell is modified (token collected, changed, etc.), create a “memento” object capturing its state.
- Store this memento in the modifiedCells Map.
- When the cell scrolls off-screen, nothing visible needs to be updated—its state is already saved.

### Restoring State on Re-Render

- During map movement, clear the visible layer.
- Recompute the set of visible cells based on the player’s fixed position and the map offset.
- For each visible cell:
  If (i,j) exists in modifiedCells, restore its saved state.
  Otherwise, render the default unmodified version.

### Benefits of This Approach

- Memory efficient because only modified cells are stored.
- Simple redraw logic: no need to track moving DOM elements.
- Prepares for D3.d since persisting a single Map will be straightforward.

---

## D3.d: Gameplay Across Real-world Space and Time

Implement geolocation-based movement and persistent game state to enable real-world gameplay.

### Software Requirements

1. **Geolocation API Integration**
   - [x] Use browser Geolocation API to control player movement
   - [x] Player position updates based on real-world device location
   - [x] Handle geolocation permissions and errors gracefully

2. **Movement Control Abstraction (Facade Pattern)**
   - [x] Create a movement controller interface/facade
   - [x] Implement button-based movement controller (existing)
   - [x] Implement geolocation-based movement controller (new)
   - [x] Game logic should not depend on specific movement implementation
   - [x] Clean separation between movement input and game state updates

3. **LocalStorage Persistence**
   - [x] Save game state to browser localStorage
   - [x] Persist: player position, inventory, modified cells
   - [x] Load saved state on page load
   - [x] Handle missing/corrupted save data gracefully

### Gameplay Requirements

1. **Real-world Movement**
   - [ ] Player character moves as device moves in physical space
   - [ ] Map follows player's GPS coordinates
   - [ ] Cell interactions based on real-world proximity

2. **Session Persistence**
   - [x] Game state persists across page reloads
   - [x] Player can close and reopen the page without losing progress
   - [x] Modified cells remain modified after reload
   - [x] Inventory contents preserved

3. **New Game Option**
   - [x] Provide UI control to reset game state
   - [x] Clear localStorage and reinitialize to default state
   - [x] Confirm action to prevent accidental resets

4. **Movement Mode Toggle**
   - [ ] Allow switching between button-based and geolocation movement
   - [ ] Implementation options:
     - Runtime control (on-screen toggle button)
     - Query string parameter (`?movement=geolocation` vs `?movement=buttons`)
   - [ ] Display current movement mode to user

### Implementation Plan

#### Step 1: Movement Abstraction (Facade Pattern) ✓

1. **Define Movement Controller Interface** ✓

   Created an interface that abstracts movement input:
   - `enable()`: Start listening for movement
   - `disable()`: Stop listening for movement
   - `onMove(callback)`: Register callback for position updates

2. **Implement Button Controller** ✓
   - Wrapped existing button-based movement into class
   - Converts button clicks to lat/lng updates
   - Maintains keyboard control support (arrow keys + WASD)
   - Can be cleanly enabled/disabled

3. **Implement Geolocation Controller** ✓
   - Requests geolocation permissions on enable
   - Watches position changes with `navigator.geolocation.watchPosition()`
   - Converts GPS coords directly to game coordinates
   - Handles errors (denied permissions, unavailable, timeout)
   - High accuracy mode enabled

4. **Integrate with Game Logic** ✓
   - Refactored to `movePlayerToLatLng()` accepting lat/lng directly
   - Movement controller triggers position updates via callback
   - Game code completely agnostic to movement source
   - Clean separation between input and game state

#### Step 2: LocalStorage Persistence ✓

1. **Define Save State Schema** ✓

   Created a serializable game state structure containing:
   - Player position (lat/lng) ✓
   - Inventory contents ✓
   - Modified cells map ✓
   - Save timestamp ✓

2. **Implement Save/Load Functions** ✓
   - `saveGameState()`: serialize state to JSON, write to localStorage ✓
   - `loadGameState()`: read from localStorage, deserialize, validate ✓
   - Save on state changes (debounced to avoid excessive writes) ✓
   - Load on page initialization ✓

3. **State Synchronization** ✓
   - Save after: inventory changes, cell modifications, movement ✓
   - Use debouncing to limit localStorage writes ✓
   - Handle quota exceeded errors ✓

#### Step 3: UI Controls

1. **Movement Mode Selector**
   - Add toggle button or detect query string
   - Switch between controllers at runtime
   - Display current mode indicator

2. **New Game Button**
   - Add prominent "Reset Game" button
   - Show confirmation dialog
   - Clear localStorage and reinitialize state

3. **Status Indicators**
   - Show geolocation status (enabled/disabled/error)
   - Display save state timestamp
   - Indicate when auto-save occurs

### Edge Cases & Error Handling

- **Geolocation unavailable**: Fall back to button controls, show message
- **Permission denied**: Display instructions, enable button mode
- **Position timeout**: Retry with exponential backoff
- **LocalStorage full**: Notify user, attempt cleanup of old data
- **Corrupted save data**: Log error, start fresh game
- **Invalid coordinates**: Validate lat/lng ranges, clamp if needed

### Testing Checklist

- [ ] Geolocation updates player position correctly
- [ ] Button mode still works when selected
- [ ] State persists after page reload
- [ ] New game resets all state properly
- [ ] Movement mode toggle works without errors
- [ ] Handles geolocation denial gracefully
- [ ] Works on mobile devices (primary target)
- [ ] LocalStorage quota not exceeded during normal play

### Acceptance Criteria

- Player can move by physically moving their device (when geolocation enabled)
- Game state fully persists across browser sessions
- Player can start a fresh game via UI control
- Player can switch between button and geolocation modes
- All gameplay from D3.c still functions correctly
- Graceful degradation when geolocation unavailable
