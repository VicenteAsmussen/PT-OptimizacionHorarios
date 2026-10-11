const baseUrl = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const headers = new Headers(opciones.headers);
  headers.set("Accept", "application/json");
  if (opciones.body !== undefined) headers.set("Content-Type", "application/json");

  const respuesta = await fetch(`${baseUrl.replace(/\/$/, "")}/${ruta.replace(/^\//, "")}`, {
    ...opciones,
    headers,
    credentials: "include",
  });

  if (!respuesta.ok) {
    const error: unknown = await respuesta.json().catch(() => null);
    const mensaje = error && typeof error === "object" && "message" in error
      && typeof error.message === "string"
      ? error.message
      : "No se pudo completar la solicitud.";
    throw new ApiError(mensaje, respuesta.status);
  }

  if (respuesta.status === 204) return undefined as T;
  return respuesta.json() as Promise<T>;
}
