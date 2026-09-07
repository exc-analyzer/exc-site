export interface Trouble {
  where: string;
  message: string;
}

export function failed(where: string, error: unknown): void {
  let message = "";
  if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object" && "message" in error) {
    message = String((error as { message?: unknown }).message ?? "");
  }
  console.warn(`Could not load ${where}:`, message);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<Trouble>("exc:problem", { detail: { where, message } }),
  );
}
