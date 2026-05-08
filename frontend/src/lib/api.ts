// API client with JWT auto-injection and error handling
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("prologweb_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem("prologweb_token");
    localStorage.removeItem("prologweb_user");
    window.location.href = "/";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "API error");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ──────────────── AUTH ────────────────
export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ access_token: string; user_id: string; username: string; role: string }>(
        "/auth/login",
        { method: "POST", body: JSON.stringify({ email, password }) }
      ),
    register: (email: string, username: string, password: string, invitation_code: string) =>
      request<{ access_token: string; user_id: string; username: string; role: string }>(
        "/auth/register",
        { method: "POST", body: JSON.stringify({ email, username, password, invitation_code }) }
      ),
    me: () => request<{ user_id: string; username: string; role: string }>("/auth/me"),
  },

  // ──────────────── FILES ────────────────
  files: {
    list: () =>
      request<Array<{ id: string; name: string; updated_at: string; is_owner: boolean }>>("/files"),
    get: (id: string) =>
      request<{ id: string; name: string; content: string; share_token: string | null; share_enabled: boolean; updated_at: string; owner_id: string }>(
        `/files/${id}`
      ),
    create: (name: string, content = "") =>
      request<{ id: string; name: string; content: string }>("/files", {
        method: "POST",
        body: JSON.stringify({ name, content }),
      }),
    update: (id: string, content: string, name?: string) =>
      request<{ id: string; name: string; content: string; updated_at: string }>(`/files/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ content, name }),
      }),
    delete: (id: string) => request<void>(`/files/${id}`, { method: "DELETE" }),
    share: (id: string) =>
      request<{ share_token: string; share_url: string; share_enabled: boolean }>(
        `/files/${id}/share`,
        { method: "POST" }
      ),
    revokeShare: (id: string) => request<void>(`/files/${id}/share`, { method: "DELETE" }),
    getByToken: (token: string) =>
      request<{ id: string; name: string; content: string; owner_id: string }>(
        `/files/shared/${token}`
      ),
    versions: (id: string) =>
      request<Array<{ id: string; saved_by: string | null; created_at: string }>>(
        `/files/${id}/versions`
      ),
    versionContent: (fileId: string, versionId: string) =>
      request<{ content: string }>(`/files/${fileId}/versions/${versionId}/content`),
  },

  // ──────────────── PROLOG ────────────────
  prolog: {
    execute: (code: string, query: string) =>
      request<{ output: string; error: string; success: boolean; execution_time_ms: number }>(
        "/prolog/execute",
        { method: "POST", body: JSON.stringify({ code, query }) }
      ),
  },

  // ──────────────── ADMIN ────────────────
  admin: {
    createInvitation: (max_uses = 1, expires_hours?: number) =>
      request<{ id: string; code: string; max_uses: number; use_count: number; expires_at: string | null }>(
        "/admin/invitations",
        { method: "POST", body: JSON.stringify({ max_uses, expires_hours }) }
      ),
    listInvitations: () => request<Array<{ id: string; code: string; max_uses: number; use_count: number; expires_at: string | null }>>("/admin/invitations"),
    listUsers: () => request<Array<{ id: string; email: string; username: string; role: string; is_active: boolean }>>("/admin/users"),
    deactivateUser: (id: string) => request<void>(`/admin/users/${id}/deactivate`, { method: "PATCH" }),
  },
};

// ──────────────── WEBSOCKET ────────────────
export function createCollabSocket(fileId: string): WebSocket {
  const token = getToken();
  const wsBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
    .replace("https://", "wss://")
    .replace("http://", "ws://");
  return new WebSocket(`${wsBase}/ws/collab/${fileId}?token=${token}`);
}
