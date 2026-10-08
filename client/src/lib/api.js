const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

const API_BASE_URL = (
  configuredBaseUrl ||
  (import.meta.env.PROD
    ? "/api"
    : "http://localhost:5000/api")
).replace(/\/+$/, "");

export async function api(
  path,
  { method = "GET", body, signal } = {}
) {
  const normalizedMethod = method.toUpperCase();
  const headers = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) {
    headers["X-CSRF-Protection"] = "1";
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const response = await fetch(
    `${API_BASE_URL}${normalizedPath}`,
    {
      method: normalizedMethod,
      headers,
      credentials: "include",
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(
      data?.message || `Request failed (${response.status}).`
    );

    error.status = response.status;

    throw error;
  }

  return data;
}