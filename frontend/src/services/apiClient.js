const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export async function apiRequest(path, options = {}) {
  const { body, headers = {}, ...restOptions } = options;
  const isFormData = body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...restOptions,
    headers: isFormData
      ? headers
      : {
          "Content-Type": "application/json",
          ...headers,
        },
    body:
      typeof body === "undefined"
        ? undefined
        : isFormData
          ? body
          : JSON.stringify(body),
  });

  const rawText = await response.text();
  let data = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch (error) {
      data = {
        message: rawText,
      };
    }
  }

  if (!response.ok || data.success === false) {
    const error = new Error(data.message || "API request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function buildQueryString(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === "" || value === null || typeof value === "undefined") {
      return;
    }

    searchParams.set(key, value);
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}
