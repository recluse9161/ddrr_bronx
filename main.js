/* DDRR Bronx static MapLibre map. No build step is required. */

// Borough-wide bounds with a small margin so the full Bronx is visible.
const BRONX_BOUNDS = [
  [-73.933, 40.785],
  [-73.748, 40.918],
];
const FIT_OPTIONS = { padding: 36, duration: 0, maxZoom: 12 };

const map = new maplibregl.Map({
  container: "map",
  style: getBasemapStyle("streets"),
  bounds: BRONX_BOUNDS,
  fitBoundsOptions: FIT_OPTIONS,
  attributionControl: true,
});

map.addControl(new maplibregl.NavigationControl(), "top-right");
map.addControl(new HomeControl(fitToBronx), "top-right");

map.on("error", (event) => {
  console.error("MapLibre runtime error:", event?.error || event);
});

document.querySelectorAll('input[name="basemap"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (radio.checked) map.setStyle(getBasemapStyle(radio.value), { diff: false });
  });
});

function fitToBronx(animated = true) {
  map.fitBounds(BRONX_BOUNDS, {
    ...FIT_OPTIONS,
    duration: animated ? 700 : 0,
  });
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
