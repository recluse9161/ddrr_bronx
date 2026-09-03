/* DDRR Bronx static MapLibre map. No build step is required. */

const BRONX_BOUNDS = [
  [-73.933, 40.785],
  [-73.748, 40.918],
];
const INITIAL_CENTER = [-73.8405, 40.8515];
const INITIAL_ZOOM = 10.1;
const FIT_OPTIONS = { padding: 36, duration: 0, maxZoom: 12 };
const SIGHTINGS_SOURCE_ID = "sightings-source";
const SIGHTINGS_HEATMAP_LAYER_ID = "confirmed-sightings-heatmap";
const SIGHTINGS_LAYER_ID = "confirmed-sightings";
const SIGHTINGS_HIT_LAYER_ID = "confirmed-sightings-interaction";
const SIGHTINGS_POINT_RADIUS = ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7, 18, 10];
const SIGHTINGS_INTERACTION_RADIUS = ["interpolate", ["linear"], ["zoom"], 10, 8, 14, 11, 18, 14];

let map;
let currentBasemap = "streets";
let sightingHandlersInstalledForStyle = false;

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

  document.querySelectorAll('input[name="basemap"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      switchBasemap(radio.value);
    });
  });

  document.getElementById("toggleSightings")?.addEventListener("change", applySightingsVisibility);
}

function switchBasemap(nextBasemap) {
  if (!map || nextBasemap === currentBasemap) return;
  currentBasemap = nextBasemap;
  sightingHandlersInstalledForStyle = false;
  map.setStyle(getBasemapStyle(nextBasemap), { diff: false });

  // Match the working DDRR pattern: after each new basemap style loads,
  // reinstall local overlay sources/layers and reapply toggle visibility.
  map.once("style.load", () => {
    installSightingsLayer();
    applySightingsVisibility();
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
