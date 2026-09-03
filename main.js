/* DDRR Bronx static MapLibre map. No build step is required. */

const BRONX_BOUNDS = [
  [-73.933, 40.785],
  [-73.748, 40.918],
];
const INITIAL_CENTER = [-73.8405, 40.8515];
const INITIAL_ZOOM = 10.1;
const FIT_OPTIONS = { padding: 36, duration: 0, maxZoom: 12 };
const NEIGHBORHOODS_SOURCE_ID = "neighborhoods-source";
const NEIGHBORHOODS_LABEL_SOURCE_ID = "neighborhoods-label-source";
const NEIGHBORHOODS_FILL_LAYER_ID = "neighborhoods-fill";
const NEIGHBORHOODS_OUTLINE_LAYER_ID = "neighborhoods-outline";
const NEIGHBORHOODS_LABEL_LAYER_ID = "neighborhoods-label";
const NEIGHBORHOODS_CLICK_FILL_LAYER_ID = "neighborhoods-click-fill";
// Neighborhood name label size. Edit these zoom stops to make labels larger/smaller.
const NEIGHBORHOOD_LABEL_TEXT_SIZE = ["interpolate", ["linear"], ["zoom"], 9, 9, 11, 11, 13, 14];
const NEIGHBORHOOD_LABEL_FONT_STACK = ["Noto Sans Regular"];
const SIGHTINGS_SOURCE_ID = "sightings-source";
const SIGHTINGS_HEATMAP_LAYER_ID = "confirmed-sightings-heatmap";
const SIGHTINGS_LAYER_ID = "confirmed-sightings";
const SIGHTINGS_HIT_LAYER_ID = "confirmed-sightings-interaction";
const SIGHTINGS_POINT_RADIUS = ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7, 18, 10];
const SIGHTINGS_INTERACTION_RADIUS = ["interpolate", ["linear"], ["zoom"], 10, 8, 14, 11, 18, 14];
const SCHOOLS_SOURCE_ID = "schools-source";
const SCHOOLS_LAYER_ID = "schools";
const SCHOOLS_HIT_LAYER_ID = "schools-interaction";
const SCHOOLS_FILL_COLOR = "#1d4ed8";
const SCHOOLS_STROKE_COLOR = "#1d4ed8";
// SCHOOL POINT SIZE: same values used by the main DDRR map.
const SCHOOLS_CIRCLE_RADIUS = ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 3];
// SCHOOL TAP TARGET SIZE: larger invisible radius used for click/tap interactions.
const SCHOOLS_INTERACTION_RADIUS = ["interpolate", ["linear"], ["zoom"], 10, 10, 14, 16];

let map;
let currentBasemap = "streets";
let flashingNeighborhoodName = "";
let neighborhoodFlashTimeout = null;
let neighborhoodsData = null;
let neighborhoodLabelPointsData = null;
let neighborhoodHandlersInstalledForStyle = false;
let sightingHandlersInstalledForStyle = false;
let schoolHandlersInstalledForStyle = false;

class HomeControl {
  constructor(onClick) {
    this.onClick = onClick;
  }

  onAdd() {
    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group maplibregl-ctrl-home";

    this.button = document.createElement("button");
    this.button.type = "button";
    this.button.title = "Show the full Bronx";
    this.button.setAttribute("aria-label", "Show the full Bronx");
    this.button.textContent = "⌂";
    this.button.addEventListener("click", this.onClick);

    this.container.appendChild(this.button);
    return this.container;
  }

  onRemove() {
    this.button?.removeEventListener("click", this.onClick);
    this.container?.remove();
  }
}

initializeApp().catch((error) => {
  console.error("Map initialization failed:", error);
  showMapError("Unable to initialize map. Check console and network access.");
});

async function initializeApp() {
  if (!window.maplibregl) {
    showMapError("MapLibre did not load. Check your internet connection or browser console.");
    return;
  }

  neighborhoodsData = await loadNeighborhoodsData();
  neighborhoodLabelPointsData = buildNeighborhoodLabelPoints(neighborhoodsData);

  map = new maplibregl.Map({
    container: "map",
    style: getBasemapStyle("streets"),
    center: INITIAL_CENTER,
    zoom: INITIAL_ZOOM,
    attributionControl: true,
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new HomeControl(fitToBronx), "top-right");

  map.on("error", (event) => {
    console.error("MapLibre runtime error:", event?.error || event);
  });

  map.on("load", () => {
    fitToBronx(false);
    installNeighborhoodLayers();
    installSightingsLayer();
    installSchoolsLayer();
    updateNeighborhoodLabelPaint();
    moveSchoolsBelowNeighborhoodLabels();
    moveNeighborhoodLabelsToTop();
  });

  document.querySelectorAll('input[name="basemap"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      switchBasemap(radio.value);
    });
  });

  document.getElementById("toggleNeighborhoods")?.addEventListener("change", () => {
    applyNeighborhoodVisibility();
    applyNeighborhoodLabelVisibility();
  });
  document.getElementById("toggleNeighborhoodLabels")?.addEventListener("change", applyNeighborhoodLabelVisibility);
  document.getElementById("toggleSightings")?.addEventListener("change", applySightingsVisibility);
  document.getElementById("toggleSchools")?.addEventListener("change", applySchoolsVisibility);
}


async function loadNeighborhoodsData() {
  const response = await fetch(`./data/bronx_neighborhoods.geojson?v=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load Bronx neighborhoods: ${response.status}`);
  const data = await response.json();
  return {
    ...data,
    features: (data.features || []).map((feature) => {
      const properties = feature.properties || {};
      const name = String(properties.Name || "");
      return {
        ...feature,
        properties: {
          ...properties,
          // Precompute wrapped labels instead of relying on a MapLibre string replace expression.
          LabelName: name.replaceAll("-", "\n"),
        },
      };
    }),
  };
}

function buildNeighborhoodLabelPoints(neighborhoodsGeoJson) {
  const features = [];

  (neighborhoodsGeoJson?.features || []).forEach((feature, index) => {
    const props = feature?.properties || {};
    const name = String(props.Name || "").trim();
    if (!name) return;

    const coordinates = getNeighborhoodLabelPointFromGeometry(feature?.geometry);
    if (!coordinates) return;

    features.push({
      type: "Feature",
      id: `neighborhood-label-${index + 1}`,
      properties: {
        Name: name,
        LabelName: String(props.LabelName || name).trim(),
      },
      geometry: { type: "Point", coordinates },
    });
  });

  return { type: "FeatureCollection", features };
}

function getNeighborhoodLabelPointFromGeometry(geometry) {
  if (!geometry) return null;

  if (geometry.type === "Polygon") {
    return getPolygonLabelPoint(geometry.coordinates);
  }

  if (geometry.type === "MultiPolygon") {
    const polygons = Array.isArray(geometry.coordinates) ? geometry.coordinates : [];
    let largest = null;
    let maxArea = -Infinity;

    polygons.forEach((polygon) => {
      const outerRing = Array.isArray(polygon) ? polygon[0] : null;
      const area = Array.isArray(outerRing) ? Math.abs(getRingSignedArea(outerRing)) : 0;
      if (area > maxArea) {
        maxArea = area;
        largest = polygon;
      }
    });

    return largest ? getPolygonLabelPoint(largest) : null;
  }

  return null;
}

function getPolygonLabelPoint(polygonCoordinates) {
  const outerRing = Array.isArray(polygonCoordinates) ? polygonCoordinates[0] : null;
  if (!Array.isArray(outerRing) || outerRing.length < 4) return null;

  const centroid = getRingCentroid(outerRing);
  if (centroid) return centroid;
  return getRingAveragePoint(outerRing);
}

function getRingSignedArea(ring) {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function getRingCentroid(ring) {
  let signedAreaTimes2 = 0;
  let cxAccumulator = 0;
  let cyAccumulator = 0;

  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const cross = x1 * y2 - x2 * y1;
    signedAreaTimes2 += cross;
    cxAccumulator += (x1 + x2) * cross;
    cyAccumulator += (y1 + y2) * cross;
  }

  if (Math.abs(signedAreaTimes2) < 1e-12) return null;
  return [cxAccumulator / (3 * signedAreaTimes2), cyAccumulator / (3 * signedAreaTimes2)];
}

function getRingAveragePoint(ring) {
  if (!Array.isArray(ring) || ring.length < 2) return null;

  const end = ring.length - 1;
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (let i = 0; i < end; i += 1) {
    const [x, y] = ring[i];
    sumX += x;
    sumY += y;
    count += 1;
  }

  if (!count) return null;
  return [sumX / count, sumY / count];
}

function moveNeighborhoodLabelsToTop() {
  if (!map?.getLayer(NEIGHBORHOODS_LABEL_LAYER_ID)) return;
  map.moveLayer(NEIGHBORHOODS_LABEL_LAYER_ID);
}

function switchBasemap(nextBasemap) {
  if (!map || nextBasemap === currentBasemap) return;
  currentBasemap = nextBasemap;
  neighborhoodHandlersInstalledForStyle = false;
  sightingHandlersInstalledForStyle = false;
  schoolHandlersInstalledForStyle = false;
  map.setStyle(getBasemapStyle(nextBasemap), { diff: false });

  // Match the working DDRR pattern: after each new basemap style loads,
  // reinstall local overlay sources/layers and reapply toggle visibility.
  map.once("style.load", () => {
    installNeighborhoodLayers();
    installSightingsLayer();
    installSchoolsLayer();
    applyNeighborhoodVisibility();
    applyNeighborhoodLabelVisibility();
    updateNeighborhoodLabelPaint();
    applySightingsVisibility();
    applySchoolsVisibility();
    moveSchoolsBelowNeighborhoodLabels();
    moveNeighborhoodLabelsToTop();
  });
}

function moveSchoolsBelowNeighborhoodLabels() {
  if (!map?.getLayer(SCHOOLS_LAYER_ID)) return;
  const beforeLayerId = map.getLayer(NEIGHBORHOODS_LABEL_LAYER_ID) ? NEIGHBORHOODS_LABEL_LAYER_ID : undefined;
  if (map.getLayer(SCHOOLS_HIT_LAYER_ID)) map.moveLayer(SCHOOLS_HIT_LAYER_ID, beforeLayerId);
  map.moveLayer(SCHOOLS_LAYER_ID, beforeLayerId);
}


function installNeighborhoodLayers() {
  if (!map.getSource(NEIGHBORHOODS_SOURCE_ID)) {
    map.addSource(NEIGHBORHOODS_SOURCE_ID, {
      type: "geojson",
      data: neighborhoodsData,
      promoteId: "Name",
    });
  }

  if (!map.getSource(NEIGHBORHOODS_LABEL_SOURCE_ID)) {
    map.addSource(NEIGHBORHOODS_LABEL_SOURCE_ID, {
      type: "geojson",
      data: neighborhoodLabelPointsData,
    });
  }

  if (!map.getLayer(NEIGHBORHOODS_FILL_LAYER_ID)) {
    map.addLayer({
      id: NEIGHBORHOODS_FILL_LAYER_ID,
      type: "fill",
      source: NEIGHBORHOODS_SOURCE_ID,
      paint: {
        "fill-color": ["coalesce", ["get", "FillColor"], "#43db31"],
        "fill-opacity": ["case", ["==", ["get", "Name"], ["literal", flashingNeighborhoodName]], 0.62, 0.22],
        "fill-outline-color": "rgba(0, 0, 0, 0)",
      },
    });
  }

  if (!map.getLayer(NEIGHBORHOODS_OUTLINE_LAYER_ID)) {
    map.addLayer({
      id: NEIGHBORHOODS_OUTLINE_LAYER_ID,
      type: "line",
      source: NEIGHBORHOODS_SOURCE_ID,
      paint: {
        "line-color": currentBasemap === "satellite" ? "#ffffff" : "#000000",
        "line-width": 1.4,
        "line-opacity": 0.9,
      },
    });
  }

  if (!map.getLayer(NEIGHBORHOODS_CLICK_FILL_LAYER_ID)) {
    map.addLayer({
      id: NEIGHBORHOODS_CLICK_FILL_LAYER_ID,
      type: "fill",
      source: NEIGHBORHOODS_SOURCE_ID,
      paint: { "fill-color": "#000000", "fill-opacity": 0 },
    });
  }

  if (!map.getLayer(NEIGHBORHOODS_LABEL_LAYER_ID)) {
    map.addLayer({
      id: NEIGHBORHOODS_LABEL_LAYER_ID,
      type: "symbol",
      source: NEIGHBORHOODS_LABEL_SOURCE_ID,
      layout: {
        "text-field": ["get", "LabelName"],
        "text-size": NEIGHBORHOOD_LABEL_TEXT_SIZE,
        "text-font": NEIGHBORHOOD_LABEL_FONT_STACK,
        "text-anchor": "center",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: getNeighborhoodLabelPaint(),
    });
  }

  installNeighborhoodHandlers();
  applyNeighborhoodLabelVisibility();
  applyNeighborhoodVisibility();
}

function installNeighborhoodHandlers() {
  if (neighborhoodHandlersInstalledForStyle || !map.getLayer(NEIGHBORHOODS_CLICK_FILL_LAYER_ID)) return;
  neighborhoodHandlersInstalledForStyle = true;
  map.on("mouseenter", NEIGHBORHOODS_CLICK_FILL_LAYER_ID, () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", NEIGHBORHOODS_CLICK_FILL_LAYER_ID, () => { map.getCanvas().style.cursor = ""; });
  map.on("click", NEIGHBORHOODS_CLICK_FILL_LAYER_ID, (event) => {
    const feature = event.features?.[0];
    flashNeighborhoodFill(feature?.properties?.Name || "");
  });
}

function flashNeighborhoodFill(name) {
  if (!map?.getLayer(NEIGHBORHOODS_FILL_LAYER_ID) || !name) return;
  flashingNeighborhoodName = name;
  updateNeighborhoodFlashStyle();

  if (neighborhoodFlashTimeout) window.clearTimeout(neighborhoodFlashTimeout);
  neighborhoodFlashTimeout = window.setTimeout(() => {
    flashingNeighborhoodName = "";
    neighborhoodFlashTimeout = null;
    updateNeighborhoodFlashStyle();
  }, 650);
}

function updateNeighborhoodFlashStyle() {
  if (!map?.getLayer(NEIGHBORHOODS_FILL_LAYER_ID)) return;
  map.setPaintProperty(NEIGHBORHOODS_FILL_LAYER_ID, "fill-opacity", ["case", ["==", ["get", "Name"], ["literal", flashingNeighborhoodName]], 0.62, 0.22]);
}

function applyNeighborhoodVisibility() {
  if (!map) return;
  const visibility = document.getElementById("toggleNeighborhoods")?.checked ? "visible" : "none";
  [NEIGHBORHOODS_FILL_LAYER_ID, NEIGHBORHOODS_OUTLINE_LAYER_ID, NEIGHBORHOODS_CLICK_FILL_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
  });
}

function applyNeighborhoodLabelVisibility() {
  if (!map) return;
  const neighborhoodsVisible = document.getElementById("toggleNeighborhoods")?.checked ?? true;
  const labelsVisible = document.getElementById("toggleNeighborhoodLabels")?.checked ?? true;
  const visibility = neighborhoodsVisible && labelsVisible ? "visible" : "none";
  if (map.getLayer(NEIGHBORHOODS_LABEL_LAYER_ID)) {
    map.setLayoutProperty(NEIGHBORHOODS_LABEL_LAYER_ID, "visibility", visibility);
  }
}

function getNeighborhoodLabelPaint() {
  const isSatellite = currentBasemap === "satellite";
  return {
    "text-color": isSatellite ? "rgba(255, 255, 255, 1)" : "#000000",
    "text-halo-color": isSatellite ? "#000000" : "#ffffff",
    "text-halo-width": isSatellite ? 1.6 : 2.4,
    "text-halo-blur": isSatellite ? 0 : 0.2,
    "text-opacity": 1,
  };
}

function updateNeighborhoodLabelPaint() {
  if (!map?.getLayer(NEIGHBORHOODS_LABEL_LAYER_ID)) return;
  const paint = getNeighborhoodLabelPaint();
  Object.entries(paint).forEach(([property, value]) => {
    map.setPaintProperty(NEIGHBORHOODS_LABEL_LAYER_ID, property, value);
  });
}

function installSightingsLayer() {

  if (!map.getSource(SIGHTINGS_SOURCE_ID)) {
    map.addSource(SIGHTINGS_SOURCE_ID, {
      type: "geojson",
      data: "./data/icebreaker.geojson",
    });
  }

  if (!map.getLayer(SIGHTINGS_HEATMAP_LAYER_ID)) {
    map.addLayer({
      id: SIGHTINGS_HEATMAP_LAYER_ID,
      type: "heatmap",
      source: SIGHTINGS_SOURCE_ID,
      paint: {
        // Exact same merged-hotspot style used by the original DDRR map.
        "heatmap-weight": ["interpolate", ["linear"], ["zoom"], 10, 0.9, 13, 1.1, 15, 1.3],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 13, 1.7, 15, 2.1],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 10, 12, 13, 14, 16, 15, 18],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(0, 0, 0, 0)",
          0.12,
          "rgba(185, 28, 28, 0.35)",
          0.3,
          "rgba(220, 38, 38, 0.82)",
          0.55,
          "rgba(220, 38, 38, 0.96)",
          0.78,
          "rgba(239, 68, 68, 1)",
          0.92,
          "rgba(255, 214, 10, 1)",
          1,
          "rgba(255, 249, 138, 1)",
        ],
        "heatmap-opacity": 0.96,
      },
    });
  }

  if (!map.getLayer(SIGHTINGS_LAYER_ID)) {
    map.addLayer({
      id: SIGHTINGS_LAYER_ID,
      type: "circle",
      source: SIGHTINGS_SOURCE_ID,
      // Keep points effectively hidden; hotspot remains the primary visualization.
      minzoom: 24,
      paint: {
        "circle-color": "#dc2626",
        "circle-radius": SIGHTINGS_POINT_RADIUS,
        "circle-stroke-color": "#7f1d1d",
        "circle-stroke-width": 2.2,
        "circle-opacity": 0.95,
      },
    });
  }

  if (!map.getLayer(SIGHTINGS_HIT_LAYER_ID)) {
    map.addLayer({
      id: SIGHTINGS_HIT_LAYER_ID,
      type: "circle",
      source: SIGHTINGS_SOURCE_ID,
      paint: {
        "circle-color": "#000000",
        "circle-radius": SIGHTINGS_INTERACTION_RADIUS,
        "circle-opacity": 0,
        "circle-stroke-width": 0,
      },
    });
  }

  installSightingHandlers();
  applySightingsVisibility();
}

function installSightingHandlers() {
  if (sightingHandlersInstalledForStyle || !map.getLayer(SIGHTINGS_HIT_LAYER_ID)) return;
  sightingHandlersInstalledForStyle = true;

  map.on("mouseenter", SIGHTINGS_HIT_LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", SIGHTINGS_HIT_LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("click", SIGHTINGS_HIT_LAYER_ID, showSightingPopup);
}

function applySightingsVisibility() {
  if (!map) return;
  const visibility = document.getElementById("toggleSightings")?.checked ? "visible" : "none";
  [SIGHTINGS_HEATMAP_LAYER_ID, SIGHTINGS_LAYER_ID, SIGHTINGS_HIT_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
  });
}

function installSchoolsLayer() {
  if (!map.getSource(SCHOOLS_SOURCE_ID)) {
    map.addSource(SCHOOLS_SOURCE_ID, {
      type: "geojson",
      data: "./data/schools.geojson",
    });
  }

  if (!map.getLayer(SCHOOLS_LAYER_ID)) {
    map.addLayer({
      id: SCHOOLS_LAYER_ID,
      type: "circle",
      source: SCHOOLS_SOURCE_ID,
      paint: {
        "circle-color": SCHOOLS_FILL_COLOR,
        "circle-radius": SCHOOLS_CIRCLE_RADIUS,
        "circle-stroke-color": SCHOOLS_STROKE_COLOR,
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.95,
      },
    });
  }

  if (!map.getLayer(SCHOOLS_HIT_LAYER_ID)) {
    map.addLayer({
      id: SCHOOLS_HIT_LAYER_ID,
      type: "circle",
      source: SCHOOLS_SOURCE_ID,
      paint: {
        "circle-color": "#000000",
        "circle-radius": SCHOOLS_INTERACTION_RADIUS,
        "circle-opacity": 0,
        "circle-stroke-width": 0,
      },
    });
  }

  installSchoolHandlers();
  applySchoolsVisibility();
}

function installSchoolHandlers() {
  if (schoolHandlersInstalledForStyle || !map.getLayer(SCHOOLS_HIT_LAYER_ID)) return;
  schoolHandlersInstalledForStyle = true;

  map.on("mouseenter", SCHOOLS_HIT_LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", SCHOOLS_HIT_LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
  });
  map.on("click", SCHOOLS_HIT_LAYER_ID, showSchoolPopup);
}

function applySchoolsVisibility() {
  if (!map) return;
  if (map.isStyleLoaded() && (!map.getSource(SCHOOLS_SOURCE_ID) || !map.getLayer(SCHOOLS_LAYER_ID))) {
    installSchoolsLayer();
  }
  const visibility = document.getElementById("toggleSchools")?.checked ? "visible" : "none";
  [SCHOOLS_LAYER_ID, SCHOOLS_HIT_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
  });
  if (visibility === "visible") moveSchoolsBelowNeighborhoodLabels();
}

function showSchoolPopup(event) {
  const feature = event.features?.[0];
  if (!feature) return;

  const rows = Object.entries(feature.properties || {})
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(String(value ?? ""))}</td></tr>`)
    .join("");

  new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 12, maxWidth: "320px" })
    .setLngLat(event.lngLat)
    .setHTML(`<table class="popup-table">${rows}</table>`)
    .addTo(map);
}

function showSightingPopup(event) {
  const feature = event.features?.[0];
  if (!feature) return;

  const rows = Object.entries(feature.properties || {})
    .filter(([, value]) => String(value ?? "").trim())
    .map(([key, value]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>`)
    .join("");

  new maplibregl.Popup({ closeButton: true, offset: 12, maxWidth: "320px" })
    .setLngLat(event.lngLat)
    .setHTML(`<table class="popup-table">${rows}</table>`)
    .addTo(map);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fitToBronx(animated = true) {
  if (!map) return;
  map.fitBounds(BRONX_BOUNDS, {
    ...FIT_OPTIONS,
    duration: animated ? 700 : 0,
  });
}

function showMapError(message) {
  const mapElement = document.getElementById("map");
  if (!mapElement) return;
  mapElement.innerHTML = `<div class="map-error">${escapeHtml(message)}</div>`;
}

function getBasemapStyle(name) {
  if (name === "satellite") {
    return {
      version: 8,
      name: "Free Hybrid Fallback",
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        esriSatellite: {
          type: "raster",
          tiles: [
            "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        },
        cartoLabels: {
          type: "raster",
          tiles: [
            "https://a.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
            "https://b.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
            "https://c.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
            "https://d.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png",
          ],
          tileSize: 256,
          attribution: "Labels © OpenStreetMap contributors, © CARTO",
        },
      },
      layers: [
        { id: "esri-satellite", type: "raster", source: "esriSatellite" },
        { id: "carto-labels", type: "raster", source: "cartoLabels" },
      ],
    };
  }

  return "https://tiles.openfreemap.org/styles/liberty";
}
