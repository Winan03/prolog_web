// Auth state management (localStorage-based, no external deps)
export interface AuthUser {
  token: string;
  user_id: string;
  username: string;
  role: string;
}

const TOKEN_KEY = "prologweb_token";
const USER_KEY = "prologweb_user";

export function saveAuth(data: { access_token: string; user_id: string; username: string; role: string }) {
  localStorage.setItem(TOKEN_KEY, data.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify({
    user_id: data.user_id,
    username: data.username,
    role: data.role,
  }));
}

export function getAuthUser(): Omit<AuthUser, "token"> | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}
