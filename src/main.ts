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
const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

// Classroom (player) location
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Gameplay constants
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4; // cell size in degrees ~ size of a house
const INTERACT_RADIUS = 3; // in cells (Chebyshev distance)
const TARGET_VALUE = 8; // value to trigger notification

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

/* -----------------------
   Map initialization
   ----------------------- */

const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
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

statusPanelDiv.innerText = "Inventory: empty";

/* -----------------------
   State & helpers
   ----------------------- */

type Token = { value: number } | null;
type CellKey = string;
type Cell = { i: number; j: number };

// Player starts at Null Island (0, 0)
// deno-lint-ignore prefer-const
let playerCell: Cell = { i: 0, j: 0 };

// Create marker at player position
// deno-lint-ignore prefer-const
let playerMarker = leaflet.marker(cellToLatLng(playerCell)).addTo(map);
playerMarker.bindTooltip("You are here", { permanent: false });
let inventory: Token = null;

// Track player-made modifications (key -> Token or null for emptied)
const modifiedCells = new Map<CellKey, Token>();

// Track drawn layers so we can update/remove them efficiently
const cellLayers = new Map<CellKey, leaflet.Rectangle>();

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
    // modifiedCells stores Token | null; if null, the cell has been emptied
    return modifiedCells.get(key) ?? null;
  }
  return initialTokenForCell(i, j);
}

function isInRange(i: number, j: number, radius = INTERACT_RADIUS) {
  const dx = Math.abs(i - playerCell.i);
  const dy = Math.abs(j - playerCell.j);
  return Math.max(dx, dy) <= radius;
}

function movePlayer(di: number, dj: number) {
  // Move player by delta cells
  playerCell.i += di;
  playerCell.j += dj;

  // Update marker position
  const newLatLng = cellToLatLng(playerCell);
  playerMarker.setLatLng(newLatLng);

  // Center map on player
  map.panTo(newLatLng, { animate: false });

  // Redraw grid to show new in-range cells
  drawVisibleGrid();
}

/* -----------------------
   Drawing & UI functions
   ----------------------- */

function drawVisibleGrid() {
  // Compute cell ranges that cover the current viewport
  const bounds = map.getBounds();
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  const { i: minI } = latLngToCell(sw.lat, sw.lng);
  const { i: maxI } = latLngToCell(ne.lat, ne.lng);
  const { j: minJ } = latLngToCell(sw.lat, sw.lng);
  const { j: maxJ } = latLngToCell(ne.lat, ne.lng);

  // Remove layers for cells no longer visible
  // Step 2 already completed
  const visibleKeys = new Set<string>();
  for (let i = minI - 2; i <= maxI + 2; i++) {
    for (let j = minJ - 2; j <= maxJ + 2; j++) {
      visibleKeys.add(cellKey(i, j));
    }
  }

  for (const key of cellLayers.keys()) {
    if (!visibleKeys.has(key)) {
      removeCellLayer(key);
    }
  }

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

function updateInventoryUI() {
  statusPanelDiv.innerText = inventory
    ? `Inventory: ${inventory.value}`
    : "Inventory: empty";
}

function removeCellLayer(key: CellKey) {
  if (cellLayers.has(key)) {
    const layer = cellLayers.get(key)!;
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
  _inRange: boolean,
): { color: string; fillOpacity: number } {
  return {
    color: token ? CELL_COLOR_WITH_TOKEN : CELL_COLOR_EMPTY,
    fillOpacity: token ? CELL_FILL_OPACITY_WITH_TOKEN : CELL_FILL_OPACITY_EMPTY,
  };
}

function applyCellHoverStyle(
  rect: leaflet.Rectangle,
  _inRange: boolean,
  isHovering: boolean,
): void {
  if (isHovering) {
    rect.setStyle({
      weight: _inRange ? CELL_WEIGHT_HOVER : CELL_WEIGHT_OUT_OF_RANGE,
      dashArray: _inRange ? undefined : CELL_DASH_OUT_OF_RANGE,
    });
  } else {
    rect.setStyle({
      weight: _inRange ? CELL_WEIGHT_IN_RANGE : CELL_WEIGHT_OUT_OF_RANGE,
      dashArray: undefined,
    });
  }
}

/* -----------------------
   Interaction logic
   ----------------------- */

function onCellClick(i: number, j: number) {
  const key = cellKey(i, j);
  if (!isInRange(i, j)) {
    // Out of range — do nothing (could show a small toast)
    flashCell(i, j);
    return;
  }

  const cellToken = getCellToken(i, j);

  // Pickup
  if (inventory == null && cellToken != null) {
    inventory = cellToken;
    // Mark cell as emptied
    modifiedCells.set(key, null);
    updateInventoryUI();
    drawOrUpdateCell({ i, j });
    return;
  }

  // Place into empty cell
  if (inventory != null && cellToken == null) {
    modifiedCells.set(key, inventory);
    inventory = null;
    updateInventoryUI();
    drawOrUpdateCell({ i, j });
    return;
  }

  // Craft (equal values)
  if (
    inventory != null && cellToken != null &&
    inventory.value === cellToken.value
  ) {
    const newValue = inventory.value * 2;
    modifiedCells.set(key, { value: newValue });
    inventory = null;
    updateInventoryUI();
    drawOrUpdateCell({ i, j });
    if (newValue >= TARGET_VALUE) {
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

// Movement control buttons
const movementDiv = document.createElement("div");
movementDiv.id = "movementControls";
movementDiv.style.cssText =
  "position: absolute; bottom: 20px; right: 20px; z-index: 1000; display: grid; grid-template-columns: repeat(3, 50px); gap: 4px; grid-template-areas: '. up .' 'left down right';";

const createButton = (
  label: string,
  callback: () => void,
  gridArea: string,
) => {
  const btn = document.createElement("button");
  btn.innerText = label;
  btn.style.cssText = `
    grid-area: ${gridArea};
    padding: 8px;
    font-size: 18px;
    font-weight: 600;
    cursor: pointer;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    transition: all 0.2s ease;
  `;
  btn.addEventListener("click", callback);
  btn.addEventListener("mouseover", () => {
    btn.style.transform = "scale(1.1)";
    btn.style.boxShadow = "0 6px 12px rgba(0, 0, 0, 0.3)";
  });
  btn.addEventListener("mouseout", () => {
    btn.style.transform = "scale(1)";
    btn.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2)";
  });
  return btn;
};

const moveNorthBtn = createButton("↑", () => movePlayer(1, 0), "up");
const moveSouthBtn = createButton("↓", () => movePlayer(-1, 0), "down");
const moveEastBtn = createButton("→", () => movePlayer(0, 1), "right");
const moveWestBtn = createButton("←", () => movePlayer(0, -1), "left");

movementDiv.append(moveNorthBtn, moveSouthBtn, moveEastBtn, moveWestBtn);
mapDiv.parentElement?.insertBefore(movementDiv, mapDiv);

// Draw grid on map move, player has finished moving the map:
map.on("moveend", () => drawVisibleGrid());

// Keyboard controls for player movement
globalThis.addEventListener("keydown", (e: KeyboardEvent) => {
  switch (e.key) {
    case "ArrowUp":
    case "w":
    case "W":
      movePlayer(1, 0);
      e.preventDefault();
      break;
    case "ArrowDown":
    case "s":
    case "S":
      movePlayer(-1, 0);
      e.preventDefault();
      break;
    case "ArrowRight":
    case "d":
    case "D":
      movePlayer(0, 1);
      e.preventDefault();
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      movePlayer(0, -1);
      e.preventDefault();
      break;
  }
});

// Initial map center on player at Null Island
map.panTo(cellToLatLng(playerCell), { animate: false });

// Initial draw
drawVisibleGrid();

updateInventoryUI();
