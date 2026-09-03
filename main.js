/* DDRR Bronx static MapLibre map. No build step is required. */

const BRONX_BOUNDS = [
  [-73.933, 40.785],
  [-73.748, 40.918],
];
const INITIAL_CENTER = [-73.8405, 40.8515];
const INITIAL_ZOOM = 10.1;
const FIT_OPTIONS = { padding: 36, duration: 0, maxZoom: 12 };
const NEIGHBORHOODS_SOURCE_ID = "neighborhoods-source";
const NEIGHBORHOODS_FILL_LAYER_ID = "neighborhoods-fill";
const NEIGHBORHOODS_OUTLINE_LAYER_ID = "neighborhoods-outline";
const NEIGHBORHOODS_LABEL_LAYER_ID = "neighborhoods-label";
const NEIGHBORHOODS_CLICK_FILL_LAYER_ID = "neighborhoods-click-fill";
const NEIGHBORHOOD_COLORS_BY_NAME = {
  "Mott Haven-Port Morris": "#43db31",
  "Melrose": "#2cc8dd",
  "Hunts Point": "#0ecd5d",
  "Longwood": "#a451e0",
  "Morrisania": "#d57544",
  "Claremont Village-Claremont (East)": "#e0db00",
  "Crotona Park East": "#cd2f66",
  "Concourse-Concourse Village": "#2143cd",
  "Highbridge": "#2171cd",
  "Mount Eden-Claremont (West)": "#43db31",
  "University Heights (South)-Morris Heights": "#2cc8dd",
  "Mount Hope": "#0ecd5d",
  "Fordham Heights": "#a451e0",
  "West Farms": "#d57544",
  "Tremont": "#e0db00",
  "Belmont": "#cd2f66",
  "University Heights (North)-Fordham": "#2143cd",
  "Bedford Park": "#2171cd",
  "Norwood": "#43db31",
  "Kingsbridge Heights-Van Cortlandt Village": "#2cc8dd",
  "Kingsbridge-Marble Hill": "#0ecd5d",
  "Riverdale-Spuyten Duyvil": "#a451e0",
  "Soundview-Bruckner-Bronx River": "#d57544",
  "Soundview-Clason Point": "#e0db00",
  "Castle Hill-Unionport": "#cd2f66",
  "Parkchester": "#2143cd",
  "Westchester Square": "#2171cd",
  "Throgs Neck-Schuylerville": "#43db31",
  "Co-op City": "#2cc8dd",
  "Pelham Parkway-Van Nest": "#0ecd5d",
  "Morris Park": "#a451e0",
  "Pelham Gardens": "#d57544",
  "Allerton": "#e0db00",
  "Williamsbridge-Olinville": "#cd2f66",
  "Eastchester-Edenwald-Baychester": "#2143cd",
  "Wakefield-Woodlawn": "#2171cd",
  "Country Club": "#43db31",
  "Pelham Bay": "#2cc8dd",
  "City Island": "#0ecd5d",
};
const NEIGHBORHOOD_LABEL_TEXT_SIZE = ["interpolate", ["linear"], ["zoom"], 9, 11, 11, 14, 13, 18];
const NEIGHBORHOOD_LABEL_FONT_STACK = ["Noto Sans Regular"];
const SIGHTINGS_SOURCE_ID = "sightings-source";
const SIGHTINGS_HEATMAP_LAYER_ID = "confirmed-sightings-heatmap";
const SIGHTINGS_LAYER_ID = "confirmed-sightings";
const SIGHTINGS_HIT_LAYER_ID = "confirmed-sightings-interaction";
const SIGHTINGS_POINT_RADIUS = ["interpolate", ["linear"], ["zoom"], 10, 4, 14, 7, 18, 10];
const SIGHTINGS_INTERACTION_RADIUS = ["interpolate", ["linear"], ["zoom"], 10, 8, 14, 11, 18, 14];

let map;
let currentBasemap = "streets";
let selectedNeighborhoodName = null;
let neighborhoodHandlersInstalledForStyle = false;
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
    installNeighborhoodLayers();
    installSightingsLayer();
  });

  document.querySelectorAll('input[name="basemap"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      switchBasemap(radio.value);
    });
  });

  document.getElementById("toggleNeighborhoods")?.addEventListener("change", applyNeighborhoodVisibility);
  document.getElementById("toggleSightings")?.addEventListener("change", applySightingsVisibility);
}

function switchBasemap(nextBasemap) {
  if (!map || nextBasemap === currentBasemap) return;
  currentBasemap = nextBasemap;
  neighborhoodHandlersInstalledForStyle = false;
  sightingHandlersInstalledForStyle = false;
  map.setStyle(getBasemapStyle(nextBasemap), { diff: false });

  // Match the working DDRR pattern: after each new basemap style loads,
  // reinstall local overlay sources/layers and reapply toggle visibility.
  map.once("style.load", () => {
    installNeighborhoodLayers();
    installSightingsLayer();
    applyNeighborhoodVisibility();
    applySightingsVisibility();
  });
}


function installNeighborhoodLayers() {
  if (!map.getSource(NEIGHBORHOODS_SOURCE_ID)) {
    map.addSource(NEIGHBORHOODS_SOURCE_ID, {
      type: "geojson",
      data: "./data/bronx_neighborhoods.geojson",
      promoteId: "Name",
    });
  }

  if (!map.getLayer(NEIGHBORHOODS_FILL_LAYER_ID)) {
    map.addLayer({
      id: NEIGHBORHOODS_FILL_LAYER_ID,
      type: "fill",
      source: NEIGHBORHOODS_SOURCE_ID,
      paint: {
        "fill-color": ["match", ["get", "Name"], ...Object.entries(NEIGHBORHOOD_COLORS_BY_NAME).flat(), "#43db31"],
        "fill-opacity": ["case", ["==", ["get", "Name"], ["literal", selectedNeighborhoodName || ""]], 0.58, 0.34],
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
        "line-width": ["case", ["==", ["get", "Name"], ["literal", selectedNeighborhoodName || ""]], 4, 1.4],
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
      source: NEIGHBORHOODS_SOURCE_ID,
      layout: {
        "text-field": ["replace", ["to-string", ["get", "Name"]], "-", "\n"],
        "text-size": ["case", ["==", ["get", "Name"], ["literal", selectedNeighborhoodName || ""]], ["interpolate", ["linear"], ["zoom"], 9, 14, 11, 18, 13, 23], NEIGHBORHOOD_LABEL_TEXT_SIZE],
        "text-font": NEIGHBORHOOD_LABEL_FONT_STACK,
        "text-anchor": "center",
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": currentBasemap === "satellite" ? "#ffffff" : "#000000",
        "text-halo-color": currentBasemap === "satellite" ? "#000000" : "#ffffff",
        "text-halo-width": currentBasemap === "satellite" ? 2.3 : 1.5,
        "text-halo-blur": currentBasemap === "satellite" ? 0.4 : 0.2,
        "text-opacity": 1,
      },
    });
  }

  installNeighborhoodHandlers();
  applyNeighborhoodVisibility();
}

function installNeighborhoodHandlers() {
  if (neighborhoodHandlersInstalledForStyle || !map.getLayer(NEIGHBORHOODS_CLICK_FILL_LAYER_ID)) return;
  neighborhoodHandlersInstalledForStyle = true;
  map.on("mouseenter", NEIGHBORHOODS_CLICK_FILL_LAYER_ID, () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", NEIGHBORHOODS_CLICK_FILL_LAYER_ID, () => { map.getCanvas().style.cursor = ""; });
  map.on("click", NEIGHBORHOODS_CLICK_FILL_LAYER_ID, (event) => {
    const feature = event.features?.[0];
    selectedNeighborhoodName = feature?.properties?.Name || null;
    updateNeighborhoodEmphasis();
  });
}

function updateNeighborhoodEmphasis() {
  if (!map?.getLayer(NEIGHBORHOODS_FILL_LAYER_ID)) return;
  const selectedNameExpression = ["literal", selectedNeighborhoodName || ""];
  map.setPaintProperty(NEIGHBORHOODS_FILL_LAYER_ID, "fill-opacity", ["case", ["==", ["get", "Name"], selectedNameExpression], 0.58, 0.34]);
  map.setPaintProperty(NEIGHBORHOODS_OUTLINE_LAYER_ID, "line-width", ["case", ["==", ["get", "Name"], selectedNameExpression], 4, 1.4]);
  map.setLayoutProperty(NEIGHBORHOODS_LABEL_LAYER_ID, "text-size", ["case", ["==", ["get", "Name"], selectedNameExpression], ["interpolate", ["linear"], ["zoom"], 9, 14, 11, 18, 13, 23], NEIGHBORHOOD_LABEL_TEXT_SIZE]);
}

function applyNeighborhoodVisibility() {
  if (!map) return;
  const visibility = document.getElementById("toggleNeighborhoods")?.checked ? "visible" : "none";
  [NEIGHBORHOODS_FILL_LAYER_ID, NEIGHBORHOODS_OUTLINE_LAYER_ID, NEIGHBORHOODS_CLICK_FILL_LAYER_ID, NEIGHBORHOODS_LABEL_LAYER_ID].forEach((layerId) => {
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
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
