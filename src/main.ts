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
const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const INTERACT_RADIUS = 3;
const TARGET_VALUE = 1024;
const VIEWPORT_BUFFER = 2;

// Visual styling constants
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
const STATUS_UPDATE_INTERVAL_MS = 10000;
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

/* -----------------------
   Map initialization
   ----------------------- */

const map = leaflet.map(mapDiv, {
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

// Create status panel elements
const inventoryDisplay = document.createElement("div");
inventoryDisplay.id = "inventoryDisplay";
inventoryDisplay.innerText = "Inventory: empty";

const statusIndicators = document.createElement("div");
statusIndicators.id = "statusIndicators";

const movementModeIndicator = document.createElement("span");
movementModeIndicator.id = "movementModeIndicator";
movementModeIndicator.className = "indicator";
movementModeIndicator.textContent = "🎮 Button Mode";

const geolocationIndicator = document.createElement("span");
geolocationIndicator.id = "geolocationIndicator";
geolocationIndicator.className = "indicator";
geolocationIndicator.textContent = "📡 GPS Off";

const saveIndicator = document.createElement("span");
saveIndicator.id = "saveIndicator";
saveIndicator.className = "indicator";
saveIndicator.textContent = "💾 No saves yet";

statusIndicators.append(
  movementModeIndicator,
  geolocationIndicator,
  saveIndicator,
);
statusPanelDiv.append(inventoryDisplay, statusIndicators);

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
        if (!this.moveCallback) return;
        const newCell = {
          i: playerCell.i + di,
          j: playerCell.j + dj,
        };
        const newLatLng = cellToLatLng(newCell);
        this.moveCallback(newLatLng.lat, newLatLng.lng);
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
      if (!this.moveCallback) return;
      const newCell = { i: playerCell.i + di, j: playerCell.j + dj };
      const newLatLng = cellToLatLng(newCell);
      this.moveCallback(newLatLng.lat, newLatLng.lng);
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
        if (!this.moveCallback) return;
        const { latitude, longitude } = position.coords;
        geolocationStatus = "active";
        updateStatusIndicators();
        this.moveCallback(latitude, longitude);
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
const playerMarker = leaflet.marker(cellToLatLng(playerCell)).addTo(map);
playerMarker.bindTooltip("You are here", { permanent: false });
let inventory: Token = null;

const modifiedCells = new Map<CellKey, CellMemento>();
const cellLayers = new Map<CellKey, leaflet.Rectangle>();

// Movement state
let currentMovementMode: "buttons" | "geolocation" = "buttons";
let geolocationStatus: "disabled" | "active" | "error" = "disabled";
let lastSaveTime: number | null = null;

/* -----------------------
   Status Indicators
   ----------------------- */

function updateStatusIndicators() {
  movementModeIndicator.textContent = currentMovementMode === "buttons"
    ? "🎮 Button Mode"
    : "📍 GPS Mode";
  movementModeIndicator.className = "indicator active";

  if (geolocationStatus === "active") {
    geolocationIndicator.textContent = "📡 GPS Active";
    geolocationIndicator.className = "indicator active";
  } else if (geolocationStatus === "error") {
    geolocationIndicator.textContent = "❌ GPS Error";
    geolocationIndicator.className = "indicator error";
  } else {
    geolocationIndicator.textContent = "📡 GPS Off";
    geolocationIndicator.className = "indicator";
  }

  if (lastSaveTime) {
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
  const i = Math.floor(lat / TILE_DEGREES);
  const j = Math.floor(lng / TILE_DEGREES);
  return { i, j };
}

function cellToLatLng(cell: Cell): leaflet.LatLng {
  const lat = (cell.i + 0.5) * TILE_DEGREES;
  const lng = (cell.j + 0.5) * TILE_DEGREES;
  return leaflet.latLng(lat, lng);
}

function cellKey(i: number, j: number): CellKey {
  return `${i},${j}`;
}

function initialTokenForCell(i: number, j: number): Token {
  const r = luck([i, j, "token"].toString());
  if (r < TOKEN_SPAWN_THRESHOLD) return null;
  if (r > TOKEN_VALUE_16_THRESHOLD) return { value: 16 };
  if (r > TOKEN_VALUE_8_THRESHOLD) return { value: 8 };
  if (r > TOKEN_VALUE_4_THRESHOLD) return { value: 4 };
  return { value: 2 };
}

function getCellToken(i: number, j: number): Token {
  const key = cellKey(i, j);
  const memento = modifiedCells.get(key);
  if (memento) {
    return memento.token ?? null;
  }
  return initialTokenForCell(i, j);
}

function isInRange(i: number, j: number, radius = INTERACT_RADIUS) {
  const dx = Math.abs(i - playerCell.i);
  const dy = Math.abs(j - playerCell.j);
  return Math.max(dx, dy) <= radius;
}

function movePlayerToLatLng(lat: number, lng: number) {
  playerCell = latLngToCell(lat, lng);
  const newLatLng = leaflet.latLng(lat, lng);
  playerMarker.setLatLng(newLatLng);
  map.panTo(newLatLng, { animate: false });
  drawVisibleGrid();
  debouncedSave();
}

/* -----------------------
   Drawing & UI functions
   ----------------------- */

function drawVisibleGrid() {
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const swCell = latLngToCell(sw.lat, sw.lng);
  const neCell = latLngToCell(ne.lat, ne.lng);
  const minI = swCell.i;
  const maxI = neCell.i;
  const minJ = swCell.j;
  const maxJ = neCell.j;

  const visibleKeys = computeVisibleKeys(
    minI,
    maxI,
    minJ,
    maxJ,
    VIEWPORT_BUFFER,
  );

  pruneInvisibleCells(visibleKeys);

  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      drawOrUpdateCell({ i, j });
    }
  }
}

function createCellRectangle(
  cell: Cell,
  token: Token,
  inRange: boolean,
): leaflet.Rectangle {
  const bounds = getCellBounds(cell.i, cell.j);
  const { color, fillOpacity } = getCellVisuals(token, inRange);

  const rect = leaflet.rectangle(bounds, {
    color,
    weight: inRange ? CELL_WEIGHT_IN_RANGE : CELL_WEIGHT_OUT_OF_RANGE,
    fillOpacity,
    interactive: true,
  });

  return rect;
}

function attachCellTooltip(rect: leaflet.Rectangle, token: Token): void {
  if (token) {
    rect.bindTooltip(`${token.value}`, {
      permanent: true,
      direction: "center",
      className: "cell-label",
    });
  } else {
    rect.unbindTooltip?.();
  }
}

function attachCellHandlers(
  rect: leaflet.Rectangle,
  cell: Cell,
  inRange: boolean,
): void {
  rect.on("click", () => onCellClick(cell.i, cell.j));
  rect.on("mouseover", () => applyCellHoverStyle(rect, inRange, true));
  rect.on("mouseout", () => applyCellHoverStyle(rect, inRange, false));
}

function drawOrUpdateCell(cell: Cell) {
  const key = cellKey(cell.i, cell.j);
  removeCellLayer(key);

  const token = getCellToken(cell.i, cell.j);
  const inRange = isInRange(cell.i, cell.j);

  const rect = createCellRectangle(cell, token, inRange);
  rect.addTo(map);

  attachCellTooltip(rect, token);
  attachCellHandlers(rect, cell, inRange);

  cellLayers.set(key, rect);
}

function updateInventoryUI() {
  inventoryDisplay.innerText = inventory
    ? `Inventory: ${inventory.value}`
    : "Inventory: empty";
}

function removeCellLayer(key: CellKey) {
  const layer = cellLayers.get(key);
  if (layer) {
    map.removeLayer(layer);
    cellLayers.delete(key);
  }
}

function getCellBounds(i: number, j: number): leaflet.LatLngBounds {
  const south = i * TILE_DEGREES;
  const west = j * TILE_DEGREES;
  return leaflet.latLngBounds(
    [south, west],
    [south + TILE_DEGREES, west + TILE_DEGREES],
  );
}

function getCellVisuals(
  token: Token,
  inRange: boolean,
): { color: string; fillOpacity: number } {
  const color = token ? CELL_COLOR_WITH_TOKEN : CELL_COLOR_EMPTY;
  const baseOpacity = token
    ? CELL_FILL_OPACITY_WITH_TOKEN
    : CELL_FILL_OPACITY_EMPTY;
  const fillOpacity = inRange ? baseOpacity : baseOpacity * 0.5;
  return { color, fillOpacity };
}

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

function pruneInvisibleCells(visibleKeys: Set<string>) {
  for (const key of Array.from(cellLayers.keys())) {
    if (!visibleKeys.has(key)) {
      removeCellLayer(key);
    }
  }
}

function applyCellChange(cell: Cell, token: Token | null) {
  const key = cellKey(cell.i, cell.j);
  modifiedCells.set(key, { token, timestamp: Date.now() });
  updateInventoryUI();
  drawOrUpdateCell(cell);
  debouncedSave();
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

function onCellClick(i: number, j: number) {
  if (!isInRange(i, j)) {
    flashCell(i, j);
    return;
  }

  const cellToken = getCellToken(i, j);

  if (inventory == null && cellToken != null) {
    inventory = cellToken;
    applyCellChange({ i, j }, null);
    return;
  }

  if (inventory != null && cellToken == null) {
    const tokenToPlace = inventory;
    inventory = null;
    applyCellChange({ i, j }, tokenToPlace);
    return;
  }

  if (
    inventory != null && cellToken != null &&
    inventory.value === cellToken.value
  ) {
    const newValue = inventory.value * 2;
    inventory = null;
    applyCellChange({ i, j }, { value: newValue });
    if (newValue >= TARGET_VALUE) {
      showVictory();
    } else {
      showNotification(`Crafted ${newValue}!`);
    }
    return;
  }

  flashCell(i, j);
}

/* -----------------------
   Small UI helpers
   ----------------------- */

function flashCell(i: number, j: number) {
  const key = cellKey(i, j);
  const layer = cellLayers.get(key);
  if (!layer) return;
  layer.setStyle({ color: CELL_COLOR_INVALID });
  setTimeout(() => {
    drawOrUpdateCell({ i, j });
  }, FLASH_DURATION_MS);
}

function showVictory() {
  const victoryOverlay = document.createElement("div");
  victoryOverlay.id = "victoryOverlay";

  const victoryBox = document.createElement("div");
  victoryBox.innerText = `🎉 Victory! You crafted ${TARGET_VALUE}! 🎉`;

  victoryOverlay.append(victoryBox);
  document.body.append(victoryOverlay);
}

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

map.on("moveend", () => drawVisibleGrid());

const stateLoaded = loadGameState();

if (stateLoaded) {
  const startLatLng = cellToLatLng(playerCell);
  playerMarker.setLatLng(startLatLng);
  map.setView(startLatLng, GAMEPLAY_ZOOM_LEVEL);
}

const buttonController = new ButtonMovementController();
const geoController = new GeolocationMovementController();
let activeController: MovementController = buttonController;

const handleMovement = (lat: number, lng: number) => {
  movePlayerToLatLng(lat, lng);
};

buttonController.onMove(handleMovement);
geoController.onMove(handleMovement);

function switchMovementMode(mode: "buttons" | "geolocation") {
  if (mode === currentMovementMode) return;

  activeController.disable();

  if (mode === "geolocation") {
    activeController = geoController;
    currentMovementMode = "geolocation";
  } else {
    activeController = buttonController;
    currentMovementMode = "buttons";
    geolocationStatus = "disabled";
  }

  activeController.enable();
  updateStatusIndicators();
}

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

const toggleModeBtn = document.createElement("button");
toggleModeBtn.innerText = "📍 Toggle GPS";
toggleModeBtn.addEventListener("click", () => {
  const newMode = currentMovementMode === "buttons" ? "geolocation" : "buttons";
  switchMovementMode(newMode);
});
controlPanelDiv.append(toggleModeBtn);

const newGameBtn = document.createElement("button");
newGameBtn.innerText = "🔄 New Game";
newGameBtn.addEventListener("click", () => {
  if (confirm("Start a new game? This will reset all progress.")) {
    clearGameState();
    location.reload();
  }
});
controlPanelDiv.append(newGameBtn);

map.panTo(cellToLatLng(playerCell), { animate: false });
drawVisibleGrid();
updateInventoryUI();
updateStatusIndicators();

setInterval(updateStatusIndicators, STATUS_UPDATE_INTERVAL_MS);
