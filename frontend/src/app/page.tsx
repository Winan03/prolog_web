"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { saveAuth, isLoggedIn } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Register form
  const [regEmail, setRegEmail] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regCode, setRegCode] = useState("");

  useEffect(() => {
    if (isLoggedIn()) router.replace("/editor");
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const data = await api.auth.login(email, password);
      saveAuth(data);
      router.push("/editor");
    } catch (err: any) {
      setError(err.message || "Error al iniciar sesión");
    } finally { setLoading(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const data = await api.auth.register(regEmail, regUsername, regPassword, regCode);
      saveAuth(data);
      router.push("/editor");
    } catch (err: any) {
      setError(err.message || "Error al registrarse");
    } finally { setLoading(false); }
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-icon">?-</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1 }}>PrologWeb</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>SWI-Prolog en la nube</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "var(--bg-surface)", padding: 4, borderRadius: "var(--radius)" }}>
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              className="btn"
              onClick={() => { setTab(t); setError(""); }}
              style={{
                flex: 1,
                background: tab === t ? "var(--bg-active)" : "transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
                border: "none",
                justifyContent: "center",
              }}
            >
              {t === "login" ? "Iniciar Sesión" : "Registrarse"}
            </button>
          ))}
        </div>

        {tab === "login" ? (
          <form onSubmit={handleLogin}>
            <div className="auth-field">
              <label className="auth-label">Correo electrónico</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required />
            </div>
            <div className="auth-field">
              <label className="auth-label">Contraseña</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {error && <p className="auth-error">⚠ {error}</p>}
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 20, padding: "10px" }}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : "Entrar"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <div className="auth-field">
              <label className="auth-label">Correo electrónico</label>
              <input className="input" type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="tu@email.com" required />
            </div>
            <div className="auth-field">
              <label className="auth-label">Nombre de usuario</label>
              <input className="input" value={regUsername} onChange={e => setRegUsername(e.target.value)} placeholder="ej: estudiante01" required pattern="[a-zA-Z0-9_]+" />
            </div>
            <div className="auth-field">
              <label className="auth-label">Contraseña (mín. 8 caracteres)</label>
              <input className="input" type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="••••••••" required minLength={8} />
            </div>
            <div className="auth-field">
              <label className="auth-label">Código de invitación</label>
              <input
                className="input"
                value={regCode}
                onChange={e => setRegCode(e.target.value.toUpperCase())}
                placeholder="PROLOG-XXXXXX"
                required
                style={{ fontFamily: "var(--mono, monospace)", letterSpacing: "0.05em" }}
              />
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                Solicita un código a quien administre la plataforma.
              </p>
            </div>
            {error && <p className="auth-error">⚠ {error}</p>}
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 20, padding: "10px" }}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : "Crear cuenta"}
            </button>
          </form>
        )}

        <div className="divider" />
        <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          PrologWeb · SWI-Prolog seguro para cursos de IA
        </p>
      </div>
    </div>
  );
}
