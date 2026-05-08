"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, createCollabSocket } from "@/lib/api";
import { getAuthUser, logout } from "@/lib/auth";

// Monaco must be loaded client-side only
const MonacoEditor = dynamic(() => import("@/components/PrologEditor"), { ssr: false });

interface FileItem { id: string; name: string; updated_at: string; is_owner: boolean; }
interface OutputLine { text: string; type: "success" | "error" | "info" | "timing"; }

const EXAMPLE_CODE = `% Ejemplo: Familia
% Hechos
padre(juan, maria).
padre(juan, pedro).
madre(ana, maria).
madre(ana, pedro).

% Regla: progenitor
progenitor(X, Y) :- padre(X, Y).
progenitor(X, Y) :- madre(X, Y).

% Regla: hermano
hermano(X, Y) :-
    progenitor(Z, X),
    progenitor(Z, Y),
    X \\= Y.
`;

export default function EditorPage() {
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getAuthUser>>(null);

  // File state
  const [files, setFiles] = useState<FileItem[]>([]);
  const [activeFile, setActiveFile] = useState<{ id: string; name: string; content: string; owner_id: string } | null>(null);
  const [code, setCode] = useState(EXAMPLE_CODE);
  const [isDirty, setIsDirty] = useState(false);

  // Query state
  const [query, setQuery] = useState("progenitor(juan, X).");
  const [output, setOutput] = useState<OutputLine[]>([
    { text: "% Bienvenido a PrologWeb. Carga un archivo o escribe código y ejecuta una consulta.", type: "info" }
  ]);
  const [isExecuting, setIsExecuting] = useState(false);

  // Collab state
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const broadcastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // UI state
  const [showShare, setShowShare] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const autoSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auth guard ──
  useEffect(() => {
    const u = getAuthUser();
    if (!u) { router.replace("/"); return; }
    setUser(u);
    loadFiles();
    // Warn before unload if dirty
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "¿Deseas guardar tu trabajo antes de salir?";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // ── Auto-save every 30s ──
  useEffect(() => {
    if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    autoSaveTimer.current = setInterval(() => {
      if (activeFile && isDirty) handleSave(true);
    }, 30_000);
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [activeFile, isDirty, code]);

  // ── WebSocket collab ──
  useEffect(() => {
    if (!activeFile) return;
    const ws = createCollabSocket(activeFile.id);
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
  }, [activeFile?.id]);

  async function loadFiles() {
    try {
      const list = await api.files.list();
      setFiles(list);
    } catch {}
  }

  async function openFile(id: string) {
    try {
      const f = await api.files.get(id);
      setActiveFile(f);
      setCode(f.content || EXAMPLE_CODE);
      setIsDirty(false);
    } catch {}
  }

  function handleCodeChange(value: string | undefined) {
    const newCode = value ?? "";
    setCode(newCode);
    setIsDirty(true);
    // Broadcast to collab partners (debounced)
    if (broadcastTimeout.current) clearTimeout(broadcastTimeout.current);
    broadcastTimeout.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "content_update", content: newCode }));
      }
    }, 400);
  }

  async function handleSave(silent = false) {
    if (!activeFile) return;
    setSaving(true);
    try {
      await api.files.update(activeFile.id, code);
      setIsDirty(false);
      if (!silent) { setSaveMsg("✓ Guardado"); setTimeout(() => setSaveMsg(""), 3000); }
      // Notify collab partners
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "save", content: code }));
      }
      loadFiles();
    } catch {}
    setSaving(false);
  }

  function handleDownload() {
    const name = activeFile?.name || "programa";
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${name}.pl`; a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExecute() {
    if (!query.trim()) return;
    setIsExecuting(true);
    const startOut: OutputLine[] = [
      { text: `?- ${query}`, type: "info" }
    ];
    try {
      const res = await api.prolog.execute(code, query);
      const lines: OutputLine[] = [...startOut];
      if (res.output) {
        res.output.split("\n").forEach(l => lines.push({ text: l, type: "success" }));
      }
      if (res.error) {
        res.error.split("\n").forEach(l => lines.push({ text: l, type: "error" }));
      }
      lines.push({ text: `% Tiempo: ${res.execution_time_ms}ms`, type: "timing" });
      setOutput(prev => [...prev, ...lines]);
    } catch (err: any) {
      setOutput(prev => [...prev, ...startOut, { text: err.message, type: "error" }]);
    }
    setIsExecuting(false);
  }

  async function createNewFile() {
    if (!newFileName.trim()) return;
    try {
      const f = await api.files.create(newFileName.trim(), EXAMPLE_CODE);
      await loadFiles();
      openFile(f.id);
      setShowNewFile(false);
      setNewFileName("");
    } catch {}
  }

  async function handleShare() {
    if (!activeFile) return;
    try {
      const res = await api.files.share(activeFile.id);
      setShareUrl(res.share_url);
      setShowShare(true);
    } catch {}
  }

  function handleLogout() {
    if (isDirty && !confirm("Tienes cambios sin guardar. ¿Salir de todas formas?")) return;
    logout();
    router.push("/");
  }

  // Keyboard shortcut: Ctrl+Enter to execute, Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); handleExecute(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [code, query, activeFile]);

  return (
    <div className="editor-layout">
      {/* ── TOPBAR ── */}
      <header className="topbar">
        <a href="/editor" className="topbar-logo">
          <div className="topbar-logo-icon">?-</div>
          PrologWeb
        </a>
        <div className="topbar-filename">
          {activeFile ? (
            <span>{activeFile.name}.pl {isDirty && <span style={{ color: "var(--warning)" }}>●</span>}</span>
          ) : (
            <span style={{ color: "var(--text-muted)" }}>Sin archivo abierto</span>
          )}
        </div>
        <div className="topbar-actions">
          {saveMsg && <span style={{ fontSize: 12, color: "var(--success)" }}>{saveMsg}</span>}
          {onlineUsers.length > 1 && (
            <div className="online-indicator">
              <div className="online-dot" />
              {onlineUsers.filter(u => u !== user?.username).join(", ")} editando
            </div>
          )}
          {activeFile && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={handleDownload} title="Descargar .pl">⬇ Descargar</button>
              <button className="btn btn-ghost btn-sm" onClick={handleShare} title="Compartir link de colaboración">🔗 Compartir</button>
              <button className="btn btn-primary btn-sm" onClick={() => handleSave()} disabled={saving || !isDirty}>
                {saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "💾 Guardar"}
              </button>
            </>
          )}
          <span className="topbar-user">@{user?.username}</span>
          <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-section">
          <div className="sidebar-title">Archivos</div>
          <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}
            onClick={() => setShowNewFile(true)}>
            + Nuevo archivo
          </button>
          {files.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>
              No tienes archivos. Crea uno.
            </p>
          )}
          {files.map(f => (
            <div
              key={f.id}
              className={`file-item ${activeFile?.id === f.id ? "active" : ""}`}
              onClick={() => openFile(f.id)}
            >
              <span className="file-item-icon">📄</span>
              <span className="file-item-name">{f.name}.pl</span>
              {!f.is_owner && <span className="badge badge-blue" style={{ fontSize: 10 }}>collab</span>}
            </div>
          ))}
        </div>

        {/* Shortcuts help */}
        <div className="sidebar-section" style={{ marginTop: "auto" }}>
          <div className="sidebar-title">Atajos</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.8 }}>
            <div><kbd style={{ background: "var(--bg-active)", padding: "1px 4px", borderRadius: 3 }}>Ctrl+Enter</kbd> Ejecutar</div>
            <div><kbd style={{ background: "var(--bg-active)", padding: "1px 4px", borderRadius: 3 }}>Ctrl+S</kbd> Guardar</div>
          </div>
        </div>
      </aside>

      {/* ── EDITOR + QUERY PANEL ── */}
      <main className="editor-main">
        <div className="editor-wrapper">
          <MonacoEditor value={code} onChange={handleCodeChange} />
        </div>

        {/* Query Panel */}
        <div className="query-panel">
          <div className="query-panel-header">
            🔍 Consulta Prolog
            <span style={{ marginLeft: "auto", fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--text-muted)" }}>
              Ctrl+Enter para ejecutar
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setOutput([])}
              style={{ marginLeft: 8 }}
            >Limpiar</button>
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
              placeholder="progenitor(juan, X)."
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={handleExecute}
              disabled={isExecuting}
            >
              {isExecuting ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "▶ Ejecutar"}
            </button>
          </div>
        </div>
      </main>

      {/* ── MODALS ── */}

      {/* New File Modal */}
      {showNewFile && (
        <div className="modal-overlay" onClick={() => setShowNewFile(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📄 Nuevo archivo Prolog</div>
            <label className="auth-label">Nombre del archivo</label>
            <input
              className="input"
              value={newFileName}
              onChange={e => setNewFileName(e.target.value)}
              placeholder="ej: arboles_busqueda"
              onKeyDown={e => e.key === "Enter" && createNewFile()}
              autoFocus
            />
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
              Se creará como <code style={{ color: "var(--prolog-purple)" }}>{newFileName || "nombre"}.pl</code>
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setShowNewFile(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createNewFile} disabled={!newFileName.trim()}>Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShare && (
        <div className="modal-overlay" onClick={() => setShowShare(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🔗 Compartir para colaborar</div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
              Comparte este enlace. Tu compañero podrá <strong>editar y guardar</strong> el archivo junto contigo en tiempo real.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="input" readOnly value={shareUrl} style={{ fontFamily: "monospace", fontSize: 12 }} />
              <button className="btn btn-primary" onClick={() => navigator.clipboard.writeText(shareUrl)}>
                Copiar
              </button>
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
              ⚠ Quien tenga este link puede editar. Revócalo desde el panel de archivos cuando quieras.
            </p>
            <div className="modal-actions">
              <button className="btn btn-danger btn-sm" onClick={async () => {
                if (activeFile) { await api.files.revokeShare(activeFile.id); setShowShare(false); }
              }}>Revocar acceso</button>
              <button className="btn btn-ghost" onClick={() => setShowShare(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
