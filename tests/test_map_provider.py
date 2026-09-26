from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_maps_use_keyless_openfreemap_provider():
    bridge = (
        ROOT / "strava_analytics" / "web" / "assets" / "leaflet-bridge.js"
    ).read_text()
    app = (ROOT / "strava_analytics" / "web" / "app.py").read_text()

    assert "tiles.openfreemap.org/styles/positron" in bridge
    assert "maplibreGL" in bridge
    assert "basemaps.cartocdn.com" not in bridge
    assert "maplibre-gl@5.24.0" in app
    assert "maplibre-gl-leaflet@0.1.4" in app
