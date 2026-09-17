const TOKEN_KEY = "bt_team_session";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function acceptTokenFromUrl() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("access_token");
  if (token) {
    setToken(token);
    if (["invite", "recovery"].includes(params.get("type"))) sessionStorage.setItem("bt_needs_password", "1");
    history.replaceState(null, "", window.location.pathname);
  }
  return token;
}

export function needsPassword() { return sessionStorage.getItem("bt_needs_password") === "1"; }
export function passwordWasSet() { sessionStorage.removeItem("bt_needs_password"); }

export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Не удалось выполнить запрос");
    error.status = response.status;
    throw error;
  }
  return data;
}

export function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
