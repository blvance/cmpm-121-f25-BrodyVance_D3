// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images (starter helper)
import "./_leafletWorkaround.ts";

// Deterministic luck helper
import luck from "./_luck.ts";

/* -----------------------
   Constants & UI setup
   ----------------------- */

// UI containers
// control panel left for future controls (not yet used) — removed to avoid unused var

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

// Gameplay constants
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4; // cell size in degrees ~ size of a house
const INTERACT_RADIUS = 3; // in cells (Chebyshev distance); player can only interact with cells within this range
const TARGET_VALUE = 1024; // value to trigger victory
const VIEWPORT_BUFFER = 2; // extra cells beyond viewport to draw

// Visual constants (extracted magic numbers)
const TOKEN_SPAWN_THRESHOLD = 0.96;
const TOKEN_VALUE_16_THRESHOLD = 0.997;
const TOKEN_VALUE_8_THRESHOLD = 0.99;
const TOKEN_VALUE_4_THRESHOLD = 0.975;
const CELL_FILL_OPACITY_WITH_TOKEN = 0.35;
const CELL_FILL_OPACITY_EMPTY = 0.06;
const CELL_COLOR_WITH_TOKEN = "#2a9d8f";
const CELL_COLOR_EMPTY = "#aaa";
const CELL_COLOR_INVALID = "#e76f51";
const CELL_WEIGHT_IN_RANGE = 2;
const CELL_WEIGHT_OUT_OF_RANGE = 1;
const CELL_WEIGHT_HOVER = 3;
const CELL_DASH_OUT_OF_RANGE = "3";
const FLASH_DURATION_MS = 300;
const NOTIFICATION_DURATION_MS = 2500;
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

/* -----------------------
   Map initialization
   ----------------------- */

const map = leaflet.map(mapDiv, {
  // Center on Null Island (0,0) — player spawn
  center: leaflet.latLng(0, 0),
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

statusPanelDiv.innerHTML = `
  <div id="inventoryDisplay">Inventory: empty</div>
  <div id="statusIndicators">
    <span id="movementModeIndicator" class="indicator">🎮 Button Mode</span>
    <span id="geolocationIndicator" class="indicator">📡 GPS Off</span>
    <span id="saveIndicator" class="indicator">💾 No saves yet</span>
  </div>
`;

/* -----------------------
   State & helpers
   ----------------------- */

type Token = { value: number } | null;
type CellKey = string;
type Cell = { i: number; j: number };

// Memento stored for modified cells (Flyweight + Memento pattern)
type CellMemento = { token?: Token | null; timestamp?: number | undefined };

/* -----------------------
   LocalStorage Persistence
   ----------------------- */

interface GameState {
  playerPosition: { lat: number; lng: number };
  inventory: Token;
  modifiedCells: Array<[string, CellMemento]>;
  timestamp: number;
}

const SAVE_KEY = "geocoin_game_state";
const SAVE_DEBOUNCE_MS = 1000;

let saveTimeout: number | null = null;

function saveGameState(): void {
  try {
    const state: GameState = {
      playerPosition: {
        lat: cellToLatLng(playerCell).lat,
        lng: cellToLatLng(playerCell).lng,
      },
      inventory,
      modifiedCells: Array.from(modifiedCells.entries()),
      timestamp: Date.now(),
    };

    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    lastSaveTime = Date.now();
    updateStatusIndicators();
  } catch (error) {
    if (error instanceof Error && error.name === "QuotaExceededError") {
      showNotification("Storage quota exceeded - save failed");
    } else {
      console.error("Failed to save game state:", error);
    }
  }
}

function debouncedSave(): void {
  if (saveTimeout !== null) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveGameState();
    saveTimeout = null;
  }, SAVE_DEBOUNCE_MS);
}

function loadGameState(): boolean {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (!saved) return false;

    const state = JSON.parse(saved) as GameState;

    // Validate state structure
    if (
      !state.playerPosition ||
      typeof state.playerPosition.lat !== "number" ||
      typeof state.playerPosition.lng !== "number" ||
      !Array.isArray(state.modifiedCells)
    ) {
      console.warn("Invalid save state structure");
      return false;
    }

    // Restore player position
    playerCell = latLngToCell(
      state.playerPosition.lat,
      state.playerPosition.lng,
    );

    // Restore inventory
    inventory = state.inventory;

    // Restore modified cells
    modifiedCells.clear();
    state.modifiedCells.forEach(([key, memento]) => {
      modifiedCells.set(key, memento);
    });

    return true;
  } catch (error) {
    console.error("Failed to load game state:", error);
    return false;
  }
}

function clearGameState(): void {
  localStorage.removeItem(SAVE_KEY);
}

/* -----------------------
   Movement Controller Interface (Facade Pattern)
   ----------------------- */

interface MovementController {
  enable(): void;
  disable(): void;
  onMove(callback: (lat: number, lng: number) => void): void;
}

// Button-based movement controller
class ButtonMovementController implements MovementController {
  private moveCallback: ((lat: number, lng: number) => void) | null = null;
  private buttonHandlers: Array<{ button: HTMLElement; handler: () => void }> =
    [];
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  onMove(callback: (lat: number, lng: number) => void): void {
    this.moveCallback = callback;
  }

  enable(): void {
    if (!this.moveCallback) return;

    // Create movement buttons
    const movementDiv = document.createElement("div");
    movementDiv.id = "movementControls";

    const movements = [
      { label: "↑", di: 1, dj: 0, gridArea: "up" },
      { label: "↓", di: -1, dj: 0, gridArea: "down" },
      { label: "→", di: 0, dj: 1, gridArea: "right" },
      { label: "←", di: 0, dj: -1, gridArea: "left" },
    ];

    movements.forEach(({ label, di, dj, gridArea }) => {
      const btn = document.createElement("button");
      btn.innerText = label;
      btn.style.gridArea = gridArea;
      const handler = () => {
        const newCell = {
          i: playerCell.i + di,
          j: playerCell.j + dj,
        };
        const newLatLng = cellToLatLng(newCell);
        this.moveCallback!(newLatLng.lat, newLatLng.lng);
      };
      btn.addEventListener("click", handler);
      this.buttonHandlers.push({ button: btn, handler });
      movementDiv.append(btn);
    });

    mapDiv.parentElement?.insertBefore(movementDiv, mapDiv);

    // Keyboard controls
    this.keyHandler = (e: KeyboardEvent) => {
      let di = 0, dj = 0;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          di = 1;
          break;
        case "ArrowDown":
        case "s":
        case "S":
          di = -1;
          break;
        case "ArrowRight":
        case "d":
        case "D":
          dj = 1;
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          dj = -1;
          break;
        default:
          return;
      }
      e.preventDefault();
      const newCell = { i: playerCell.i + di, j: playerCell.j + dj };
      const newLatLng = cellToLatLng(newCell);
      this.moveCallback!(newLatLng.lat, newLatLng.lng);
    };
    globalThis.addEventListener("keydown", this.keyHandler);
  }

  disable(): void {
    // Remove buttons
    const movementDiv = document.getElementById("movementControls");
    if (movementDiv) {
      movementDiv.remove();
    }
    this.buttonHandlers = [];

    // Remove keyboard listener
    if (this.keyHandler) {
      globalThis.removeEventListener("keydown", this.keyHandler);
      this.keyHandler = null;
    }
  }
}

// Geolocation-based movement controller
class GeolocationMovementController implements MovementController {
  private moveCallback: ((lat: number, lng: number) => void) | null = null;
  private watchId: number | null = null;

  onMove(callback: (lat: number, lng: number) => void): void {
    this.moveCallback = callback;
  }

  enable(): void {
    if (!this.moveCallback) return;

    if (!navigator.geolocation) {
      showNotification("Geolocation not supported by browser");
      geolocationStatus = "error";
      updateStatusIndicators();
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        geolocationStatus = "active";
        updateStatusIndicators();
        this.moveCallback!(latitude, longitude);
      },
      (error) => {
        let message = "Geolocation error";
        geolocationStatus = "error";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = "Location permission denied";
            break;
          case error.POSITION_UNAVAILABLE:
            message = "Location unavailable";
            break;
          case error.TIMEOUT:
            message = "Location request timeout";
            break;
        }
        showNotification(message);
        updateStatusIndicators();
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  }

  disable(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
      geolocationStatus = "disabled";
      updateStatusIndicators();
    }
  }
}

let playerCell: Cell = latLngToCell(
  CLASSROOM_LATLNG.lat,
  CLASSROOM_LATLNG.lng,
);
// Create marker at player position
const playerMarker = leaflet.marker(cellToLatLng(playerCell)).addTo(map);
playerMarker.bindTooltip("You are here", { permanent: false });
let inventory: Token = null;

// Track player-made modifications (key -> small memento). Only modified cells are stored.
const modifiedCells = new Map<CellKey, CellMemento>();

// Track drawn layers so we can update/remove them efficiently
const cellLayers = new Map<CellKey, leaflet.Rectangle>();

// Movement mode tracking
let currentMovementMode: "buttons" | "geolocation" = "buttons";
let geolocationStatus: "disabled" | "active" | "error" = "disabled";
let lastSaveTime: number | null = null;

/* -----------------------
   Status Indicators
   ----------------------- */

function updateStatusIndicators() {
  const modeIndicator = document.getElementById("movementModeIndicator");
  const geoIndicator = document.getElementById("geolocationIndicator");
  const saveIndicator = document.getElementById("saveIndicator");

  if (modeIndicator) {
    modeIndicator.textContent = currentMovementMode === "buttons"
      ? "🎮 Button Mode"
      : "📍 GPS Mode";
    modeIndicator.className = "indicator active";
  }

  if (geoIndicator) {
    if (geolocationStatus === "active") {
      geoIndicator.textContent = "📡 GPS Active";
      geoIndicator.className = "indicator active";
    } else if (geolocationStatus === "error") {
      geoIndicator.textContent = "❌ GPS Error";
      geoIndicator.className = "indicator error";
    } else {
      geoIndicator.textContent = "📡 GPS Off";
      geoIndicator.className = "indicator";
    }
  }

  if (saveIndicator && lastSaveTime) {
    const elapsed = Math.floor((Date.now() - lastSaveTime) / 1000);
    if (elapsed < 5) {
      saveIndicator.textContent = "💾 Saved just now";
      saveIndicator.className = "indicator active";
    } else if (elapsed < 60) {
      saveIndicator.textContent = `💾 Saved ${elapsed}s ago`;
      saveIndicator.className = "indicator";
    } else {
      saveIndicator.textContent = `💾 Saved ${Math.floor(elapsed / 60)}m ago`;
      saveIndicator.className = "indicator";
    }
  }
}

/* -----------------------
   Coordinate & token logic
   ----------------------- */

function latLngToCell(lat: number, lng: number): Cell {
  // Use floor so negative coordinates map consistently
  const i = Math.floor(lat / TILE_DEGREES);
  const j = Math.floor(lng / TILE_DEGREES);
  return { i, j };
}

function cellToLatLng(cell: Cell): leaflet.LatLng {
  // Convert cell coordinates back to lat/lng (center of cell)
  const lat = (cell.i + 0.5) * TILE_DEGREES;
  const lng = (cell.j + 0.5) * TILE_DEGREES;
  return leaflet.latLng(lat, lng);
}

function cellKey(i: number, j: number): CellKey {
  return `${i},${j}`;
}

function initialTokenForCell(i: number, j: number): Token {
  // Deterministic pseudo-random per cell
  const r = luck([i, j, "token"].toString()); // 0..1
  if (r < TOKEN_SPAWN_THRESHOLD) return null; // no token
  // Map rarer values to higher r
  if (r > TOKEN_VALUE_16_THRESHOLD) return { value: 16 };
  if (r > TOKEN_VALUE_8_THRESHOLD) return { value: 8 };
  if (r > TOKEN_VALUE_4_THRESHOLD) return { value: 4 };
  return { value: 2 };
}

function getCellToken(i: number, j: number): Token {
  const key = cellKey(i, j);
  if (modifiedCells.has(key)) {
    // modifiedCells stores a small memento; memento.token can be Token or null
    const m = modifiedCells.get(key) as CellMemento | undefined;
    return m?.token ?? null;
  }
  return initialTokenForCell(i, j);
}

// Step 4: Check if a cell is within interaction range of the player's current position
function isInRange(i: number, j: number, radius = INTERACT_RADIUS) {
  const dx = Math.abs(i - playerCell.i);
  const dy = Math.abs(j - playerCell.j);
  // Chebyshev distance: max of absolute differences ensures square interaction zone
  return Math.max(dx, dy) <= radius;
}

function movePlayerToLatLng(lat: number, lng: number) {
  // Update player cell from lat/lng coordinates
  playerCell = latLngToCell(lat, lng);

  // Update marker position
  const newLatLng = leaflet.latLng(lat, lng);
  playerMarker.setLatLng(newLatLng);

  // Center map on player
  map.panTo(newLatLng, { animate: false });

  // Redraw grid to show new in-range cells
  drawVisibleGrid();

  // Save state after movement
  debouncedSave();
}

/* -----------------------
   Drawing & UI functions
   ----------------------- */

// Grid rendering
function drawVisibleGrid() {
  // Compute cell ranges that cover the current viewport
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  // Compute integer cell coordinates for SW and NE corners once
  const swCell = latLngToCell(sw.lat, sw.lng);
  const neCell = latLngToCell(ne.lat, ne.lng);
  const minI = swCell.i;
  const maxI = neCell.i;
  const minJ = swCell.j;
  const maxJ = neCell.j;

  // Step 5: State persistence (cells forget off-screen)
  // When cells leave visibility range, clear their modifiedCells entries
  // so they revert to initial deterministic state on re-entry.
  const visibleKeys = computeVisibleKeys(
    minI,
    maxI,
    minJ,
    maxJ,
    VIEWPORT_BUFFER,
  );

  // Remove layers and clear state for cells no longer visible
  pruneInvisibleCells(visibleKeys);

  // Draw visible cells
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      drawOrUpdateCell({ i, j });
    }
  }
}

function drawOrUpdateCell(cell: Cell) {
  const key = cellKey(cell.i, cell.j);
  removeCellLayer(key);

  // Compute bounds for this cell
  const bounds = getCellBounds(cell.i, cell.j);

  // Determine token and style
  const token = getCellToken(cell.i, cell.j);
  const inRange = isInRange(cell.i, cell.j);
  const { color, fillOpacity } = getCellVisuals(token, inRange);

  const rect = leaflet.rectangle(bounds, {
    color,
    weight: inRange ? CELL_WEIGHT_IN_RANGE : CELL_WEIGHT_OUT_OF_RANGE,
    fillOpacity,
    interactive: true,
  });

  rect.addTo(map);

  // Show token value as a permanent centered tooltip if present
  if (token) {
    rect.bindTooltip(`${token.value}`, {
      permanent: true,
      direction: "center",
      className: "cell-label",
    });
  } else {
    rect.unbindTooltip?.();
  }

  // Clickable handler
  rect.on("click", () => onCellClick(cell.i, cell.j));

  // Hover effects for in-range hints
  rect.on("mouseover", () => applyCellHoverStyle(rect, inRange, true));
  rect.on("mouseout", () => applyCellHoverStyle(rect, inRange, false));

  cellLayers.set(key, rect);
}

// Inventory UI
function updateInventoryUI() {
  const inventoryDisplay = document.getElementById("inventoryDisplay");
  if (inventoryDisplay) {
    inventoryDisplay.innerText = inventory
      ? `Inventory: ${inventory.value}`
      : "Inventory: empty";
  }
}

// Layer management
function removeCellLayer(key: CellKey) {
  const layer = cellLayers.get(key);
  if (layer) {
    map.removeLayer(layer);
    cellLayers.delete(key);
  }
}

// Cell visuals & styling
function getCellBounds(i: number, j: number): leaflet.LatLngBounds {
  const south = i * TILE_DEGREES;
  const west = j * TILE_DEGREES;
  return leaflet.latLngBounds(
    [south, west],
    [south + TILE_DEGREES, west + TILE_DEGREES],
  );
}

/**
 * Compute cell visuals. If the cell is out of range we dim the fillOpacity
 * to indicate it is currently unreachable by the player.
 */
function getCellVisuals(
  token: Token,
  inRange: boolean,
): { color: string; fillOpacity: number } {
  const baseColor = token ? CELL_COLOR_WITH_TOKEN : CELL_COLOR_EMPTY;
  const baseOpacity = token
    ? CELL_FILL_OPACITY_WITH_TOKEN
    : CELL_FILL_OPACITY_EMPTY;
  // Reduce opacity when out of range so the player knows it's not interactable
  const fillOpacity = inRange ? baseOpacity : baseOpacity * 0.5;
  return { color: baseColor, fillOpacity };
}

// Helper: compute the set of cell keys that should remain visible
function computeVisibleKeys(
  minI: number,
  maxI: number,
  minJ: number,
  maxJ: number,
  buffer = VIEWPORT_BUFFER,
) {
  const keys = new Set<string>();
  for (let i = minI - buffer; i <= maxI + buffer; i++) {
    for (let j = minJ - buffer; j <= maxJ + buffer; j++) {
      keys.add(cellKey(i, j));
    }
  }
  return keys;
}

// Helper: remove layers and clear modified state for cells not in the visible set
function pruneInvisibleCells(visibleKeys: Set<string>) {
  for (const key of Array.from(cellLayers.keys())) {
    if (!visibleKeys.has(key)) {
      removeCellLayer(key);
    }
  }
}

/**
 * Apply a state change to a cell and refresh visuals + UI.
 * Avoids repeating the common mutation -> UI -> redraw steps.
 */
function applyCellChange(cell: Cell, token: Token | null) {
  const key = cellKey(cell.i, cell.j);
  modifiedCells.set(key, { token, timestamp: Date.now() });
  updateInventoryUI();
  drawOrUpdateCell(cell);
  debouncedSave(); // Save state after cell modification
}

function applyCellHoverStyle(
  rect: leaflet.Rectangle,
  inRange: boolean,
  isHovering: boolean,
): void {
  if (isHovering) {
    rect.setStyle({
      weight: inRange ? CELL_WEIGHT_HOVER : CELL_WEIGHT_OUT_OF_RANGE,
      dashArray: inRange ? undefined : CELL_DASH_OUT_OF_RANGE,
    });
  } else {
    rect.setStyle({
      weight: inRange ? CELL_WEIGHT_IN_RANGE : CELL_WEIGHT_OUT_OF_RANGE,
      dashArray: undefined,
    });
  }
}

/* -----------------------
   Interaction logic
   ----------------------- */

// Cell click handling
function onCellClick(i: number, j: number) {
  if (!isInRange(i, j)) {
    // Out of range — do nothing (could show a small toast)
    flashCell(i, j);
    return;
  }

  const cellToken = getCellToken(i, j);

  // Pickup
  if (inventory == null && cellToken != null) {
    inventory = cellToken;
    // Mark cell as emptied: store memento with token=null and timestamp
    applyCellChange({ i, j }, null);
    return;
  }

  // Place into empty cell
  if (inventory != null && cellToken == null) {
    // Persist the placed token as a compact memento
    const tokenToPlace = inventory;
    inventory = null; // clear inventory before UI update
    applyCellChange({ i, j }, tokenToPlace);
    return;
  }

  // Craft (equal values)
  if (
    inventory != null && cellToken != null &&
    inventory.value === cellToken.value
  ) {
    const newValue = inventory.value * 2;
    // Store crafted token in memento
    inventory = null;
    applyCellChange({ i, j }, { value: newValue });
    // Step 6: Check for victory at TARGET_VALUE (1024)
    if (newValue >= TARGET_VALUE) {
      showVictory();
    } else {
      showNotification(`Crafted ${newValue}!`);
    }
    return;
  }

  // Otherwise: either inventory full and trying to pick, or mismatch — no action
  // Optionally show a subtle UI hint
  flashCell(i, j);
}

/* -----------------------
   Small UI helpers
   ----------------------- */

// Visual feedback
function flashCell(i: number, j: number) {
  const key = cellKey(i, j);
  const layer = cellLayers.get(key);
  if (!layer) return;
  layer.setStyle({ color: CELL_COLOR_INVALID });
  setTimeout(() => {
    // Revert by redrawing with consistent style
    drawOrUpdateCell({ i, j });
  }, FLASH_DURATION_MS);
}

// Victory overlay
function showVictory() {
  const victoryOverlay = document.createElement("div");
  victoryOverlay.id = "victoryOverlay";

  const victoryBox = document.createElement("div");
  victoryBox.innerText = `🎉 Victory! You crafted ${TARGET_VALUE}! 🎉`;

  victoryOverlay.append(victoryBox);
  document.body.append(victoryOverlay);
}

// Notification
function showNotification(text: string) {
  const notification = document.createElement("div");
  notification.className = "notification";
  notification.innerText = text;
  document.body.append(notification);
  setTimeout(() => notification.remove(), NOTIFICATION_DURATION_MS);
}

/* -----------------------
   Startup wiring
   ----------------------- */

// Map event listeners
map.on("moveend", () => drawVisibleGrid());

// Load saved game state if available
const stateLoaded = loadGameState();

// Update marker and map if state was loaded
if (stateLoaded) {
  const startLatLng = cellToLatLng(playerCell);
  playerMarker.setLatLng(startLatLng);
  map.setView(startLatLng, GAMEPLAY_ZOOM_LEVEL);
}

// Initialize movement controllers
const buttonController = new ButtonMovementController();
const geoController = new GeolocationMovementController();
let activeController: MovementController = buttonController;

// Set up movement callback for both controllers
buttonController.onMove((lat: number, lng: number) => {
  movePlayerToLatLng(lat, lng);
});

geoController.onMove((lat: number, lng: number) => {
  movePlayerToLatLng(lat, lng);
});

// Function to switch between movement modes
function switchMovementMode(mode: "buttons" | "geolocation") {
  if (mode === currentMovementMode) return;

  // Disable current controller
  activeController.disable();

  // Switch to new controller
  if (mode === "geolocation") {
    activeController = geoController;
    currentMovementMode = "geolocation";
  } else {
    activeController = buttonController;
    currentMovementMode = "buttons";
    geolocationStatus = "disabled";
  }

  // Enable new controller
  activeController.enable();
  updateStatusIndicators();
}

// Check for query string parameter to set initial mode
const urlParams = new URLSearchParams(globalThis.location.search);
const movementParam = urlParams.get("movement");
if (movementParam === "geolocation") {
  currentMovementMode = "geolocation";
  activeController = geoController;
} else {
  currentMovementMode = "buttons";
  activeController = buttonController;
}

activeController.enable();

// Create movement mode toggle button
const toggleModeBtn = document.createElement("button");
toggleModeBtn.innerText = "📍 Toggle GPS";
toggleModeBtn.addEventListener("click", () => {
  const newMode = currentMovementMode === "buttons" ? "geolocation" : "buttons";
  switchMovementMode(newMode);
});
controlPanelDiv.append(toggleModeBtn);

// Create "New Game" button
const newGameBtn = document.createElement("button");
newGameBtn.innerText = "🔄 New Game";
newGameBtn.addEventListener("click", () => {
  if (confirm("Start a new game? This will reset all progress.")) {
    clearGameState();
    location.reload();
  }
});
controlPanelDiv.append(newGameBtn);

// Initialize game state
map.panTo(cellToLatLng(playerCell), { animate: false });
drawVisibleGrid();
updateInventoryUI();
updateStatusIndicators();

// Update save indicator periodically
setInterval(updateStatusIndicators, 10000); // Update every 10 seconds
