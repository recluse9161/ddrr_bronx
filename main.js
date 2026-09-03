/* DDRR Bronx static MapLibre map. No build step is required. */

const BRONX_BOUNDS = [
  [-73.933, 40.785],
  [-73.748, 40.918],
];
const INITIAL_CENTER = [-73.8405, 40.8515];
const INITIAL_ZOOM = 10.1;
const FIT_OPTIONS = { padding: 36, duration: 0, maxZoom: 12 };
const SIGHTINGS_SOURCE_ID = "sightings-source";
const SIGHTINGS_LAYER_ID = "sightings-points";
const SIGHTINGS_HIT_LAYER_ID = "sightings-hit-area";

let map;
let sightingHandlersInstalled = false;

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

window.addEventListener("DOMContentLoaded", initializeMap);

function initializeMap() {
  if (!window.maplibregl) {
    showMapError("MapLibre did not load. Check your internet connection or browser console.");
    return;
  }

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
    installSightingsLayer();
  });

  map.on("style.load", installSightingsLayer);

  document.querySelectorAll('input[name="basemap"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) map.setStyle(getBasemapStyle(radio.value), { diff: false });
    });
  });

  document.getElementById("toggleSightings")?.addEventListener("change", applySightingsVisibility);
}

function installSightingsLayer() {
  if (!map?.isStyleLoaded()) return;

  if (!map.getSource(SIGHTINGS_SOURCE_ID)) {
    map.addSource(SIGHTINGS_SOURCE_ID, {
      type: "geojson",
      data: "./data/icebreaker.geojson",
    });
  }

  if (!map.getLayer(SIGHTINGS_LAYER_ID)) {
    map.addLayer({
      id: SIGHTINGS_LAYER_ID,
      type: "circle",
      source: SIGHTINGS_SOURCE_ID,
      paint: {
        "circle-color": "#dc2626",
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7, 18, 10],
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
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 8, 14, 11, 18, 14],
        "circle-opacity": 0,
        "circle-stroke-width": 0,
      },
    });
  }

  installSightingHandlers();
  applySightingsVisibility();
}

function installSightingHandlers() {
  if (sightingHandlersInstalled) return;
  sightingHandlersInstalled = true;

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
  [SIGHTINGS_LAYER_ID, SIGHTINGS_HIT_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
  });
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
