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

### Step 1: Player Movement & Coordinate System ✓

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

### Step 2: Map Panning & Grid Updates ✓

- Made sure implemented `moveend` event listener that triggers `drawVisibleGrid()` whenever the player moves or the map pans.
- Cells now dynamically spawn and despawn as the player moves across the globe, keeping the screen full of interactive content.
- Extended grid buffer to ±2 cells beyond viewport edges (previously ±1) to ensure **zero blank areas** during fast panning and prevent visual gaps.
- Off-screen cells are efficiently removed from memory to maintain performance across large play sessions.
- Grid rendering is viewport-aware: only cells within the visible bounds + buffer are drawn, reducing memory usage and improving frame rate.

### Step 3: Cell Coordinate System (Refactor) ✓

- **Cell type:** Introduced a single `Cell` shape used throughout the code: `{ i: number; j: number }` representing integer cell coordinates independent of screen or Leaflet types.
- **latLngToCell:** Annotated `latLngToCell(lat, lng): Cell` to explicitly return the `Cell` type and to centralize continuous→cell conversion (uses `Math.floor` with `TILE_DEGREES`).
- **cellBounds:** Added `cellBounds(cell)` helper which returns simple, map-independent corner coordinates for a cell as `{ topLeft: [lat, lng], bottomRight: [lat, lng] }` (useful for logic/testing separate from Leaflet bounds).
- **drawOrUpdateCell:** Refactored to accept a `Cell` (`drawOrUpdateCell(cell: Cell)`) instead of separate `i, j` numeric args; internals now use `cell.i` / `cell.j` and the function uses `getCellBounds(cell.i, cell.j)` to produce Leaflet bounds.
- **Call sites updated:** All internal callers (grid drawing loop, interaction handlers, flash/redraw helpers) now pass a `Cell` object like `{ i, j }` to `drawOrUpdateCell`.

Notes:

- The new `cellBounds` helper is intentionally independent of Leaflet; the code still uses `getCellBounds(i, j)` where Leaflet `LatLngBounds` are required. `cellBounds` can be used for testing or non-visual logic.
- TypeScript/linters may warn that `cellBounds` is unused; prefix with an underscore (`_cellBounds`) or use it where appropriate to silence the warning.

### Step 4: Interaction radius & in-range checks

Already complete:

- isInRange function (line ~149) — checks against playerCell.i and playerCell.j (the player's current cell position, not a fixed classroom location).
- Chebyshev distance check — Math.max(dx, dy) <= radius ensures only cells within ~3 cells of the player can be interacted with.
- INTERACT_RADIUS = 3 constant — configurable and used throughout.

### Step 5: State persistence (cells forget off-screen) ✓

- **Temporary behavior:** When cells leave the visibility range (viewport + buffer), their entries in `modifiedCells` are cleared.
- **Re-entry behavior:** When a cell comes back into view, it reverts to its initial deterministic state (as if freshly generated).
- **Farming gameplay note:** This creates a "farming" loop where players can revisit areas and find newly generated tokens (useful for gathering resources).
- **Future D3.c:** This temporary memory-efficient approach will be replaced with persistent world state in D3.c, allowing cells to maintain modifications indefinitely across the globe.
- **Implementation:** `drawVisibleGrid()` now deletes `modifiedCells` entries for cells outside the visibility range, triggering `getCellToken()` to return the initial deterministic value on re-entry.

### Step 6: Crafting & victory ✓

- **Victory target:** Updated `TARGET_VALUE` from 8 to **1024** — the ultimate crafting goal.
- **Victory UI:** When the player crafts a token with value ≥ 1024, a full-screen victory overlay appears with a celebratory message and purple gradient background.
- **Victory function:** New `showVictory()` displays a centered, prominently styled message: `🎉 Victory! You crafted 1024! 🎉`
- **Gameplay loop:** Players must craft tokens repeatedly (2→4→8→16→32→64→128→256→512→1024) by collecting and combining equal-value tokens, creating a satisfying progression.

### Step 7: Grid rendering refactor ✓

- **Named buffer:** Introduced `VIEWPORT_BUFFER` to replace the hardcoded `2` cell buffer; this makes the buffer configurable and documents intent.
- **Single cell computation:** `drawVisibleGrid()` now computes SW/NE corner cells once (via `latLngToCell`) and reuses those integer coordinates, avoiding duplicate work and clarifying intent.
- **Helper extraction:** Repeated logic was consolidated into two helper functions:
  - `computeVisibleKeys(minI, maxI, minJ, maxJ, buffer)` — builds a `Set` of keys that should remain visible (viewport + buffer).
  - `pruneInvisibleCells(visibleKeys)` — removes Leaflet layers for keys not in the visible set and clears their `modifiedCells` entries (the current temporary persistence behavior).
- **Readability & maintainability:** The refactor reduces duplicated loops and centralizes the visibility/pruning policy so future changes (like persistence or culling strategies) can be made in one place.

## D3.C - Object persistence

Notes:

- This refactor is intentionally small and behavior-preserving; the visible buffer and pruning semantics remain the same but are clearer and easier to modify.

These are the practical changes applied to the codebase while implementing D3.c and the recent refactors:

- **Flyweight + Memento storage:** `modifiedCells` now stores compact `CellMemento` objects (token + timestamp) so only player-modified cells consume memory. Unmodified cells remain implicit and are generated deterministically.
- **Persist modified state while page is open:** Pruning no longer evicts modified-cell mementos — a modified cell retains its saved memento when scrolled off-screen and is restored when it returns to view.
- **Serialization helpers:** `_exportModifiedCells()` and `_importModifiedCells()` were added to produce/consume a JSON-friendly snapshot of the modified-cells Map (prepares for D3.d persistent storage).
- **Grid rendering refactor recap:** `VIEWPORT_BUFFER` and helpers `computeVisibleKeys(...)` / `pruneInvisibleCells(...)` were introduced; `drawVisibleGrid()` now computes SW/NE cells once and rebuilds visible layers from the deterministic generator plus `modifiedCells` lookups.
- **Victory update:** `TARGET_VALUE` raised to `1024` and a `showVictory()` overlay was added to surface the win condition when the player crafts that value.

Notes:

- These edits implement the D3.c design (Flyweight + Memento) and make it straightforward to add full persistence in a following assignment. The modified-cells Map is the authoritative source of modified state while the visible Leaflet layers are rebuilt on each draw.

## Code Quality Improvements

### Recent Code Smell Fixes

1. **CSS Styling Externalized**
   - Moved all inline CSS styles from JavaScript to `style.css`
   - Created dedicated CSS classes for:
     - `#movementControls` - D-pad button container and styling
     - `#victoryOverlay` - Full-screen victory display
     - `.notification` - Temporary notification popups
   - Improved separation of concerns and maintainability

2. **Movement Controls Refactored**
   - Replaced verbose button creation with array-driven approach
   - Used `movementButtons` array with label/callback/gridArea properties
   - Reduced code duplication and improved readability
   - Made it easier to add/modify movement controls

3. **Magic Numbers Eliminated**
   - Replaced magic number `3` with `INTERACT_RADIUS` constant
   - Replaced magic number `2` with `VIEWPORT_BUFFER` constant
   - All numeric literals now have descriptive constant names
   - Improved code maintainability and documentation

4. **Error Handling Improved**
   - Removed non-null assertion operator (`!`) in `removeCellLayer()`
   - Changed from `has()` + `get()!` pattern to simple truthiness check
   - More defensive code that handles edge cases gracefully
   - Follows TypeScript best practices without unnecessary assertions

5. **Unused Variables Check**
   - Ran comprehensive linting scan
   - Confirmed no unused variables in codebase
   - All declared variables are actively used
   - Code follows strict TypeScript and Deno linting rules

## D3.d - Gameplay Across Real-world Space and Time

### Step 1: Movement Abstraction (Facade Pattern) ✓

**Implementation Complete:**

1. **MovementController Interface** ✓
   - Defined interface with `enable()`, `disable()`, and `onMove(callback)` methods
   - Provides clean contract for all movement implementations
   - Allows game logic to remain agnostic to input source

2. **ButtonMovementController** ✓
   - Encapsulates existing button and keyboard controls
   - Creates D-pad buttons dynamically on `enable()`
   - Supports arrow keys and WASD for keyboard input
   - Converts cell-based deltas to lat/lng coordinates
   - Can be cleanly disabled, removing all UI elements and listeners

3. **GeolocationMovementController** ✓
   - Uses `navigator.geolocation.watchPosition()` for real-time GPS tracking
   - Handles permission requests and errors gracefully
   - Provides user-friendly error messages for:
     - Permission denied
     - Position unavailable
     - Timeout errors
   - High accuracy mode enabled for precise location tracking
   - Properly cleans up watch on `disable()`

4. **Game Logic Integration** ✓
   - Refactored to `movePlayerToLatLng(lat, lng)` accepting coordinates directly
   - Removed cell-delta based movement from core game logic
   - Movement controllers trigger position updates via callback
   - Complete separation between input source and game state
   - Ready for runtime controller switching

**Current State:**

- Button-based movement active by default
- Geolocation controller ready to be enabled via mode toggle
- All game functionality preserved and working correctly

### Step 2: LocalStorage Persistence

**Implementation Complete:**

1. **GameState Interface**
   - Defined serializable state schema with:
     - `playerPosition` (lat/lng coordinates)
     - `inventory` (current held token)
     - `modifiedCells` (array of modified cell entries)
     - `timestamp` (save time for tracking)

2. **Save/Load Functions**
   - `saveGameState()`: Serializes current state to JSON and writes to localStorage
   - `loadGameState()`: Reads from localStorage, validates structure, and restores state
   - `clearGameState()`: Removes saved data for fresh starts
   - Error handling for storage quota exceeded and corrupted data

3. **Debounced Auto-Save**
   - `debouncedSave()`: 1-second debounce to limit localStorage writes
   - Integrated with `applyCellChange()` to save after cell modifications
   - Integrated with `movePlayerToLatLng()` to save after player movement
   - Prevents performance issues from excessive writes

4. **State Restoration**
   - Game loads saved state on page initialization
   - Player position, inventory, and modified cells fully restored
   - Validation ensures corrupted data doesn't break the game
   - Falls back to default state if no save found

5. **New Game Button** ✓ - Added "🔄 New Game" button to control panel
   - Confirmation dialog prevents accidental resets
   - Clears localStorage and reloads page for clean state
   - Styled via CSS (no inline styles)

**Current State:**

- Complete persistence system working correctly
- State survives page reloads and browser restarts
- Auto-save triggers efficiently without performance impact
- New Game functionality tested and working

### Step 3: UI Controls ✓

**Implementation Complete:**

1. **Movement Mode Toggle** ✓
   - Added " Toggle GPS" button to control panel
   - Runtime switching between button-based and geolocation movement
   - Query string support: `?movement=geolocation` to start in GPS mode
   - Clean controller lifecycle management (proper enable/disable)

2. **Status Indicators** ✓
   - **Movement Mode Indicator**: Shows current mode (Button Mode / GPS Mode)
   - **Geolocation Status**: Real-time GPS state (GPS Off / GPS Active / GPS Error)
   - **Save Timestamp**: Displays last save time with relative formatting
     - "Saved just now" (< 5 seconds)
     - "Saved Xs ago" (< 60 seconds)
     - "Saved Xm ago" (> 60 seconds)
   - Auto-updates every 10 seconds for freshness
   - Color-coded indicators (green for active, red for errors)

3. **Controller Architecture** ✓
   - Removed underscore prefix from `GeolocationMovementController` (now actively used)
   - Both controllers instantiated at startup and ready to switch
   - Shared movement callback ensures consistent game behavior
   - Status indicators update automatically on all state changes

4. **Error Handling** ✓
   - Geolocation not supported: Shows error notification and indicator
   - Permission denied: Updates status to error state with message
   - Position unavailable: Displays appropriate error message
   - Timeout errors: Handles gracefully with user feedback
   - All geolocation errors reflected in real-time UI

**Current State:**

- Complete D3.d implementation finished
- Movement mode toggle working between buttons and GPS
- Real-time status indicators providing user feedback
- Geolocation integration fully functional with error handling
- All gameplay features from previous steps preserved

### Code Quality Improvements - Refactoring and Code Smell Fixes

Following the D3.d implementation, a comprehensive code quality pass was performed to eliminate code smells and improve maintainability:

1. **Magic Numbers Eliminated**
   - Extracted `STATUS_UPDATE_INTERVAL_MS` constant for status update interval

2. **Duplicate Code Removed**
   - Extracted shared `handleMovement()` callback to eliminate duplication
   - Both movement controllers now use the same callback reference

3. **Long Functions Refactored**
   - Split `drawOrUpdateCell()` into smaller, focused functions:
     - `createCellRectangle()` - Rectangle creation and styling
     - `attachCellTooltip()` - Tooltip binding logic
     - `attachCellHandlers()` - Event handler attachment
   - Each function now has a single, clear responsibility

4. **Performance Optimizations**
   - Cached DOM references for status indicators at initialization
   - Eliminated repeated `getElementById()` calls in frequently-executed code
   - Significant performance improvement for UI updates

5. **Type Safety Improvements**
   - Removed redundant type assertions and unnecessary casts
   - Replaced non-null assertion operators (`!`) with proper null checks
   - More defensive and type-safe code throughout

6. **Code Consistency**
   - Replaced `innerHTML` with `createElement()` and `append()` for consistency
   - Standardized DOM manipulation patterns across codebase
   - Uniform coding style throughout

7. **Comment Cleaning**
   - Removed obsolete planning phase comments (e.g., "Step 4:", "Step 6:")
   - Eliminated redundant comments that just restate the code
   - Removed obvious single-line comments
   - Kept only high-level section dividers and technically valuable comments
   - Code is now self-documenting through clear naming and structure

**Benefits:**

- Improved code readability and maintainability
- Better performance through optimized DOM access
- Reduced duplication and improved reusability
- More defensive programming with proper null checks
- Cleaner, more professional codebase ready for production

### Visual Enhancements - Color-Coded Token Display

Following code quality improvements, visual polish was added to enhance gameplay clarity and aesthetics:

**Implementation:**

- Color-coded token labels based on value for instant visual identification
- Bold text formatting for improved readability at all zoom levels
- CSS-based styling using dynamic class names (`cell-value-{value}`)
- Progressive color palette from cool to warm tones as values increase
- Special gradient effect with glow for the highest value (1024)

**Technical Details:**

- Tooltip HTML uses `<strong>` tags for bold numbers
- Dynamic CSS classes applied via `className: cell-value-${token.value}`
- High contrast text colors ensure accessibility
- Box shadow and border radius for polished appearance
- Special glow effect for 1024 value using `box-shadow`

**Benefits:**

- Players can instantly identify token values by color without reading
- Enhanced visual appeal and professional game aesthetics
- Improved UX for quick scanning of available tokens on the map
- Maintains accessibility with proper contrast ratios
- Creates visual progression that reinforces crafting goals

### CSS Refactoring

Comprehensive CSS refactoring to improve maintainability and performance:

**Changes:**

- Added CSS custom properties (variables) for colors, spacing, typography, shadows, and z-index
- Organized file structure with clear section comments (Variables, Layout, Buttons, Controls, Overlays, Map)
- Removed all `!important` declarations by using `.leaflet-tooltip.cell-label` for proper specificity
- Extracted shared values into reusable variables (e.g., `--space-sm`, `--color-primary`, `--transition-fast`)
- Touch-friendly button sizes (44px minimum) for mobile devices

**Benefits:**

- Easier to maintain and update design tokens
- Reduced code duplication through CSS variables
- Better performance with GPU-accelerated animations
- Mobile-friendly responsive design
- More flexible for future theming and customization
