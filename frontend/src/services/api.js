export function getToken() {
  return localStorage.getItem("token");
}

export async function apiFetch(path, options = {}) {
  const token = getToken();

  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    // لو الرد مش JSON
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data.error || data.message || "Request failed";
    throw new Error(msg);
  }

  return data;
}
// src/api.js
export const API = "http://localhost:5000";

export function authHeaders(token, extra = {}) {
  return {
    ...extra,
    Authorization: `Bearer ${token}`,
  };
}
