"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api, createCollabSocket } from "@/lib/api";
import { getAuthUser, logout } from "@/lib/auth";
import { useTheme } from "@/lib/useTheme";

const MonacoEditor = dynamic(() => import("@/components/PrologEditor"), { ssr: false });

interface OutputLine { text: string; type: "success" | "error" | "info" | "timing"; }

export default function CollabPage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;
  const { theme, toggle: toggleTheme } = useTheme();

  const [user, setUser] = useState<ReturnType<typeof getAuthUser>>(null);
  const [file, setFile] = useState<{ id: string; name: string; content: string; owner_id: string } | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("?- ");
  const [output, setOutput] = useState<OutputLine[]>([
    { text: "% Sesión colaborativa. Edita el código y ejecuta consultas.", type: "info" }
  ]);
  const [isExecuting, setIsExecuting] = useState(false);

  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const broadcastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveMsg, setSaveMsg] = useState("");

  // Panel resize
  const [panelHeight, setPanelHeight] = useState(260);
  const isResizing = useRef(false);
  const resizeStartY = useRef(0);
  const resizeStartH = useRef(260);

  // Auth + file load
  useEffect(() => {
    const u = getAuthUser();
    if (!u) {
      router.replace(`/?redirect=/collab/${token}`);
      return;
    }
    setUser(u);

    api.files.getByToken(token)
      .then(f => {
        setFile(f);
        setCode(f.content || "");
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || "Link inválido o revocado.");
        setLoading(false);
      });
  }, [token]);

  // WebSocket collab
  useEffect(() => {
    if (!file) return;
    const ws = createCollabSocket(file.id);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "content_update" && msg.username !== user?.username) {
        setCode(msg.content);
      }
      if (msg.type === "user_joined" || msg.type === "user_left") {
        setOnlineUsers(msg.online_users || []);
      }
      if (msg.type === "saved") {
        setSaveMsg(`✓ Guardado por ${msg.by}`);
        setTimeout(() => setSaveMsg(""), 3000);
      }
    };
    ws.onerror = () => {};
    return () => { ws.close(); };
  }, [file?.id]);

  // Resize
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isResizing.current) return;
      const delta = resizeStartY.current - e.clientY;
      const next = Math.max(120, Math.min(600, resizeStartH.current + delta));
      setPanelHeight(next);
    }
    function onMouseUp() {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function onResizeStart(e: React.MouseEvent) {
    isResizing.current = true;
    resizeStartY.current = e.clientY;
    resizeStartH.current = panelHeight;
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  }

  function handleCodeChange(value: string | undefined) {
    const newCode = value ?? "";
    setCode(newCode);
    if (broadcastTimeout.current) clearTimeout(broadcastTimeout.current);
    broadcastTimeout.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "content_update", content: newCode }));
      }
    }, 400);
  }

  async function handleSave() {
    if (!file) return;
    try {
      await api.files.update(file.id, code);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "save", content: code }));
      }
      setSaveMsg("✓ Guardado");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch {}
  }

  async function handleExecute() {
    const q = query.replace(/^\s*\?-\s*/, "").trim();
    if (!q) return;
    setIsExecuting(true);
    const startOut: OutputLine[] = [{ text: `?- ${q}`, type: "info" }];
    try {
      const res = await api.prolog.execute(code, q);
      const lines: OutputLine[] = [...startOut];
      if (res.output) res.output.split("\n").forEach(l => lines.push({ text: l, type: "success" }));
      if (res.error) res.error.split("\n").forEach(l => lines.push({ text: l, type: "error" }));
      lines.push({ text: `% Tiempo: ${res.execution_time_ms}ms`, type: "timing" });
      setOutput(prev => [...prev, ...lines]);
    } catch (err: any) {
      setOutput(prev => [...prev, ...startOut, { text: err.message, type: "error" }]);
    }
    setIsExecuting(false);
  }

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleExecute(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [code, query, file]);

  // ── Render states ──
  if (loading) return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-deep)", gap: 12 }}>
      <span className="spinner" />
      <span style={{ color: "var(--text-secondary)" }}>Cargando archivo compartido...</span>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", height: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-deep)", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 48 }}>🔗</div>
      <h2 style={{ color: "var(--text-primary)" }}>Link inválido</h2>
      <p style={{ color: "var(--text-secondary)" }}>{error}</p>
      <button className="btn btn-primary" onClick={() => router.push("/editor")}>Ir al editor</button>
    </div>
  );

  return (
    <div className="editor-layout">
      {/* Topbar */}
      <header className="topbar">
        <a href="/editor" className="topbar-logo">
          <div className="topbar-logo-icon">?-</div>
          PrologWeb
        </a>
        <div className="topbar-filename">
          <span style={{ color: "var(--prolog-purple)" }}>🔗 collab /</span>{" "}
          <span>{file?.name}.pl</span>
        </div>
        <div className="topbar-actions">
          {saveMsg && <span style={{ fontSize: 12, color: "var(--success)" }}>{saveMsg}</span>}
          {onlineUsers.length > 1 && (
            <div className="online-indicator">
              <div className="online-dot" />
              {onlineUsers.filter(u => u !== user?.username).join(", ")} editando
            </div>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={toggleTheme}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            style={{ fontSize: 16, padding: "4px 8px" }}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave}>💾 Guardar</button>
          <span className="topbar-user">@{user?.username}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { logout(); router.push("/"); }}>Salir</button>
        </div>
      </header>

      {/* No sidebar — full width editor */}
      <main className="editor-main" style={{ gridColumn: "1 / -1" }}>
        <div className="editor-wrapper">
          <MonacoEditor
            value={code}
            onChange={handleCodeChange}
            monacoTheme={theme === "light" ? "prolog-light" : "prolog-dark"}
          />
        </div>

        {/* Drag handle */}
        <div className="query-panel-resize" onMouseDown={onResizeStart} title="Arrastra para redimensionar" />

        {/* Query Panel */}
        <div className="query-panel" style={{ height: panelHeight }}>
          <div className="query-panel-header">
            🔍 Consulta Prolog
            <span style={{ marginLeft: "auto", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-muted)" }}>
              Ctrl+Enter para ejecutar
            </span>
            <button className="btn btn-ghost btn-sm" onClick={() => setOutput([])} style={{ marginLeft: 8 }}>
              Limpiar
            </button>
          </div>
          <div className="query-output">
            {output.map((line, i) => (
              <div key={i} className={`output-line output-${line.type}`}>
                {line.type === "info" && <span className="output-prompt">%</span>}
                <span>{line.text}</span>
              </div>
            ))}
            {isExecuting && (
              <div className="output-line output-info">
                <span className="spinner" style={{ width: 14, height: 14, marginRight: 8 }} />
                Ejecutando...
              </div>
            )}
          </div>
          <div className="query-input-row">
            <span style={{ color: "var(--prolog-purple)", fontFamily: "monospace", fontWeight: 600 }}>?-</span>
            <input
              className="query-input"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleExecute()}
              placeholder="padre(homero, X)."
            />
            <button className="btn btn-primary btn-sm" onClick={handleExecute} disabled={isExecuting}>
              {isExecuting ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "▶ Ejecutar"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
