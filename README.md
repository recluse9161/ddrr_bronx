# DDRR Bronx Map

Independent static MapLibre GL JS map centered on the Bronx, New York City.

## Basemaps

- **Streets:** OpenFreeMap Liberty
- **Satellite:** Esri World Imagery with CARTO labels

The initial view and home button fit the full Bronx extent responsively on desktop and mobile screens. Neighborhood polygons are loaded from `data/bronx_neighborhoods.geojson` and labeled with wrapped `Name` values. The map also loads confirmed ICE sighting points from `data/icebreaker.geojson`; click a point to view its incident details.

## Run locally

From this repository directory:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish with GitHub Pages

1. Create a GitHub repository named `ddrr_bronx`.
2. Add that repository as this local repository's `origin` and push `main`.
3. In the GitHub repository, open **Settings → Pages**.
4. Select **Deploy from a branch**, then choose `main` and `/ (root)`.

No build pipeline is required.
