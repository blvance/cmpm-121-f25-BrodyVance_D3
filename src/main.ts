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
const INTERACT_RADIUS = 100; // in cells (Chebyshev distance)
const TARGET_VALUE = 8; // value to trigger notification

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

const playerMarker = leaflet.marker(CLASSROOM_LATLNG).addTo(map);
playerMarker.bindTooltip("You are here", { permanent: false });

statusPanelDiv.innerText = "Inventory: empty";

/* -----------------------
   State & helpers
   ----------------------- */

type Token = { value: number } | null;
type CellKey = string;

const playerCell = latLngToCell(CLASSROOM_LATLNG.lat, CLASSROOM_LATLNG.lng);
let inventory: Token = null;

// Track player-made modifications (key -> Token or null for emptied)
const modifiedCells = new Map<CellKey, Token>();

// Track drawn layers so we can update/remove them efficiently
const cellLayers = new Map<CellKey, leaflet.Rectangle>();

/* -----------------------
   Coordinate & token logic
   ----------------------- */

function latLngToCell(lat: number, lng: number) {
  // Use floor so negative coordinates map consistently
  const i = Math.floor(lat / TILE_DEGREES);
  const j = Math.floor(lng / TILE_DEGREES);
  return { i, j };
}

function cellKey(i: number, j: number): CellKey {
  return `${i},${j}`;
}

function initialTokenForCell(i: number, j: number): Token {
  // Deterministic pseudo-random per cell
  const r = luck([i, j, "token"].toString()); // 0..1
  // Tune thresholds for reasonable spawn density
  if (r < 0.96) return null; // 4% chance of token
  // Map rarer values to higher r
  if (r > 0.997) return { value: 16 };
  if (r > 0.99) return { value: 8 };
  if (r > 0.975) return { value: 4 };
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
  const visibleKeys = new Set<string>();
  for (let i = minI - 1; i <= maxI + 1; i++) {
    for (let j = minJ - 1; j <= maxJ + 1; j++) {
      visibleKeys.add(cellKey(i, j));
    }
  }
  for (const key of Array.from(cellLayers.keys())) {
    if (!visibleKeys.has(key)) {
      const layer = cellLayers.get(key)!;
      map.removeLayer(layer);
      cellLayers.delete(key);
    }
  }

  // Draw visible cells
  for (let i = minI; i <= maxI; i++) {
    for (let j = minJ; j <= maxJ; j++) {
      drawOrUpdateCell(i, j);
    }
  }
}

function drawOrUpdateCell(i: number, j: number) {
  const key = cellKey(i, j);

  // If layer exists, remove it (we'll recreate with up-to-date visuals).
  if (cellLayers.has(key)) {
    const old = cellLayers.get(key)!;
    map.removeLayer(old);
    cellLayers.delete(key);
  }

  // Compute bounds for this cell
  const south = i * TILE_DEGREES;
  const west = j * TILE_DEGREES;
  const bounds = leaflet.latLngBounds(
    [south, west],
    [south + TILE_DEGREES, west + TILE_DEGREES],
  );

  // Determine token and style
  const token = getCellToken(i, j);
  const inRange = isInRange(i, j);
  const fillOpacity = token ? 0.35 : 0.06;
  const color = token ? "#2a9d8f" : "#aaa";

  const rect = leaflet.rectangle(bounds, {
    color,
    weight: inRange ? 2 : 1,
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
    // ensure no tooltip for empty
    rect.unbindTooltip?.();
  }

  // Clickable handler
  rect.on("click", () => {
    onCellClick(i, j);
  });

  // simple hover effect for in-range hints
  rect.on("mouseover", () => {
    if (isInRange(i, j)) {
      rect.setStyle({ weight: 3 });
    } else {
      rect.setStyle({ weight: 1, dashArray: "3" });
    }
  });
  rect.on("mouseout", () => {
    rect.setStyle({ weight: isInRange(i, j) ? 2 : 1, dashArray: undefined });
  });

  cellLayers.set(key, rect);
}

function updateInventoryUI() {
  statusPanelDiv.innerText = inventory
    ? `Inventory: ${inventory.value}`
    : "Inventory: empty";
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
    drawOrUpdateCell(i, j);
    return;
  }

  // Place into empty cell
  if (inventory != null && cellToken == null) {
    modifiedCells.set(key, inventory);
    inventory = null;
    updateInventoryUI();
    drawOrUpdateCell(i, j);
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
    drawOrUpdateCell(i, j);
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
  // Rectangle has setStyle available on its type
  layer.setStyle({ color: "#e76f51" });
  setTimeout(() => {
    // revert by redrawing once for consistent style
    drawOrUpdateCell(i, j);
  }, 300);
}

function showNotification(text: string) {
  const n = document.createElement("div");
  n.className = "notification";
  n.innerText = text;
  document.body.append(n);
  setTimeout(() => n.remove(), 2500);
}

/* -----------------------
   Startup wiring
   ----------------------- */

// Draw grid at start and on any map movement (but zoom is fixed)
map.on("moveend", () => drawVisibleGrid());

// Initial draw
drawVisibleGrid();

updateInventoryUI();
