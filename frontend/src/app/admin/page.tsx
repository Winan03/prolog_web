"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { getAuthUser, logout } from "@/lib/auth";

interface Invitation {
  id: string;
  code: string;
  max_uses: number;
  use_count: number;
  expires_at: string | null;
}

interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
}

export default function AdminPage() {
  const router = useRouter();
  const user = getAuthUser();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresHours, setExpiresHours] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!user || user.role !== "admin") { router.replace("/editor"); return; }
    loadData();
  }, []);

  async function loadData() {
    const [inv, usr] = await Promise.all([api.admin.listInvitations(), api.admin.listUsers()]);
    setInvitations(inv);
    setUsers(usr);
  }

  async function generateCode() {
    setLoading(true);
    try {
      await api.admin.createInvitation(maxUses, expiresHours ? parseInt(expiresHours) : undefined);
      loadData();
    } catch {}
    setLoading(false);
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-deep)", padding: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, background: "linear-gradient(135deg,var(--accent),var(--prolog-purple))", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", fontFamily: "monospace" }}>?-</div>
          <div>
            <h1 style={{ fontSize: 20 }}>Panel de Administración</h1>
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>PrologWeb</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => router.push("/editor")}>← Editor</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { logout(); router.push("/"); }}>Salir</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 900 }}>
        {/* Generate Invitation */}
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>🔑 Generar Código de Invitación</h2>
          <div style={{ marginBottom: 12 }}>
            <label className="auth-label">Usos máximos</label>
            <input className="input" type="number" min={1} max={100} value={maxUses}
              onChange={e => setMaxUses(parseInt(e.target.value))} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="auth-label">Expira en (horas, opcional)</label>
            <input className="input" type="number" min={1} value={expiresHours}
              onChange={e => setExpiresHours(e.target.value)}
              placeholder="Dejar vacío = sin expiración" />
          </div>
          <button className="btn btn-primary" onClick={generateCode} disabled={loading}>
            {loading ? "Generando..." : "Generar código"}
          </button>
        </div>

        {/* Users */}
        <div className="card">
          <h2 style={{ marginBottom: 16 }}>👥 Usuarios ({users.length})</h2>
          <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {users.map(u => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>@{u.username}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{u.email}</div>
                </div>
                <span className={`badge ${u.role === "admin" ? "badge-purple" : "badge-blue"}`}>{u.role}</span>
                {!u.is_active && <span className="badge badge-red">inactivo</span>}
                {u.role !== "admin" && u.is_active && (
                  <button className="btn btn-ghost btn-sm" onClick={async () => {
                    if (confirm(`¿Desactivar @${u.username}?`)) {
                      await api.admin.deactivateUser(u.id);
                      loadData();
                    }
                  }} style={{ color: "var(--error)" }}>✕</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Invitation codes list */}
        <div className="card" style={{ gridColumn: "1 / -1" }}>
          <h2 style={{ marginBottom: 16 }}>📋 Códigos de Invitación</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                  <th style={{ textAlign: "left", padding: "6px 12px" }}>Código</th>
                  <th style={{ textAlign: "center", padding: "6px 12px" }}>Usos</th>
                  <th style={{ textAlign: "left", padding: "6px 12px" }}>Expira</th>
                  <th style={{ padding: "6px 12px" }}></th>
                </tr>
              </thead>
              <tbody>
                {invitations.map(inv => (
                  <tr key={inv.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "var(--prolog-purple)" }}>
                      {inv.code}
                    </td>
                    <td style={{ textAlign: "center", padding: "8px 12px" }}>
                      <span style={{ color: inv.use_count >= inv.max_uses ? "var(--error)" : "var(--success)" }}>
                        {inv.use_count}/{inv.max_uses}
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: 12 }}>
                      {inv.expires_at ? new Date(inv.expires_at).toLocaleString("es") : "Sin expiración"}
                    </td>
                    <td style={{ padding: "8px 12px" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => copyCode(inv.code)}>
                        {copied === inv.code ? "✓ Copiado" : "Copiar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
