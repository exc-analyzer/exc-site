export type Density = "comfortable" | "compact";

const DENSITY_KEY = "exc.density";

export function readDensity(): Density {
  try {
    return localStorage.getItem(DENSITY_KEY) === "compact"
      ? "compact"
      : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function applyDensity(density: Density): void {
  document.documentElement.dataset.density = density;
}

export function writeDensity(density: Density): void {
  try {
    localStorage.setItem(DENSITY_KEY, density);
  } catch {}
  applyDensity(density);
}

export const ZOOM_STEPS = [90, 100, 110, 125, 150] as const;
export type Zoom = (typeof ZOOM_STEPS)[number];

const ZOOM_KEY = "exc.zoom";

export function readZoom(): Zoom {
  try {
    const raw = Number(localStorage.getItem(ZOOM_KEY));
    return (ZOOM_STEPS as readonly number[]).includes(raw) ? (raw as Zoom) : 100;
  } catch {
    return 100;
  }
}

export function applyZoom(zoom: Zoom): void {
  document.documentElement.style.setProperty("--exc-zoom", String(zoom / 100));
}

export function writeZoom(zoom: Zoom): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(zoom));
  } catch {}
  applyZoom(zoom);
}
