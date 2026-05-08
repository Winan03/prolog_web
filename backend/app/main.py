import json
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request

from app.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_admin, decode_token
)
from app.database import get_supabase
from app.models import (
    RegisterRequest, LoginRequest, TokenResponse,
    CreateInvitationRequest, InvitationResponse,
    CreateFileRequest, UpdateFileRequest, FileResponse, FileListItem, ShareResponse,
    ExecuteRequest, ExecuteResponse,
    CollabMessage, VersionItem,
)
from app.sandbox import execute_prolog
from app.collab import manager

# ──────────────── APP SETUP ────────────────
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="PrologWeb API",
    description="Secure SWI-Prolog execution backend with real-time collaboration",
    version="1.0.0",
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

FRONTEND_URLS = [
    url.strip()
    for url in os.environ.get("FRONTEND_URL", "http://localhost:3000").split(",")
    if url.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_URLS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────── HEALTH ────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "PrologWeb API"}


# ──────────────── AUTH ────────────────
@app.post("/auth/register", response_model=TokenResponse)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterRequest):
    db = get_supabase()

    # Validate invitation code
    code_row = db.table("invitation_codes")\
        .select("*")\
        .eq("code", body.invitation_code)\
        .execute()

    if not code_row.data:
        raise HTTPException(status_code=400, detail="Código de invitación inválido")

    code = code_row.data[0]
    if code["use_count"] >= code["max_uses"]:
        raise HTTPException(status_code=400, detail="Código de invitación ya fue utilizado")

    if code.get("expires_at"):
        exp = datetime.fromisoformat(code["expires_at"].replace("Z", "+00:00"))
        if datetime.now(timezone.utc) > exp:
            raise HTTPException(status_code=400, detail="Código de invitación expirado")

    # Check email/username uniqueness
    existing = db.table("users").select("id").or_(
        f"email.eq.{body.email},username.eq.{body.username}"
    ).execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Email o nombre de usuario ya registrado")

    # Create user
    new_user = db.table("users").insert({
        "email": body.email,
        "username": body.username,
        "password_hash": hash_password(body.password),
        "role": "user",
    }).execute()
    user = new_user.data[0]

    # Increment code use_count
    db.table("invitation_codes").update(
        {"use_count": code["use_count"] + 1}
    ).eq("id", code["id"]).execute()

    token = create_access_token(user["id"], user["username"], user["role"])
    return TokenResponse(access_token=token, user_id=user["id"], username=user["username"], role=user["role"])


@app.post("/auth/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest):
    db = get_supabase()
    result = db.table("users").select("*").eq("email", body.email).execute()
    if not result.data:
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    user = result.data[0]
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="Cuenta desactivada")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    token = create_access_token(user["id"], user["username"], user["role"])
    return TokenResponse(access_token=token, user_id=user["id"], username=user["username"], role=user["role"])


@app.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user_id": user["sub"], "username": user["username"], "role": user["role"]}


# ──────────────── ADMIN: INVITATION CODES ────────────────
@app.post("/admin/invitations", response_model=InvitationResponse)
async def create_invitation(body: CreateInvitationRequest, admin: dict = Depends(require_admin)):
    db = get_supabase()
    code = "PROLOG-" + secrets.token_urlsafe(6).upper()
    expires_at = None
    if body.expires_hours:
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=body.expires_hours)).isoformat()

    result = db.table("invitation_codes").insert({
        "code": code,
        "created_by": admin["sub"],
        "max_uses": body.max_uses,
        "expires_at": expires_at,
    }).execute()
    inv = result.data[0]
    return InvitationResponse(**{k: inv[k] for k in ["id", "code", "max_uses", "use_count", "expires_at", "created_at"]})


@app.get("/admin/invitations")
async def list_invitations(admin: dict = Depends(require_admin)):
    db = get_supabase()
    result = db.table("invitation_codes").select("*").order("created_at", desc=True).execute()
    return result.data


@app.get("/admin/users")
async def list_users(admin: dict = Depends(require_admin)):
    db = get_supabase()
    result = db.table("users").select("id,email,username,role,is_active,created_at").execute()
    return result.data


@app.patch("/admin/users/{user_id}/deactivate")
async def deactivate_user(user_id: str, admin: dict = Depends(require_admin)):
    db = get_supabase()
    db.table("users").update({"is_active": False}).eq("id", user_id).execute()
    return {"ok": True}


# ──────────────── FILES ────────────────
def _assert_file_access(file_id: str, user_id: str, db, require_write=False) -> dict:
    """Returns file row if user has access, else raises 403/404."""
    result = db.table("files").select("*").eq("id", file_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    file = result.data[0]

    if file["owner_id"] == user_id:
        return file

    if not require_write:
        # Check share link
        if file.get("share_enabled"):
            return file

    # Check collaborators table
    collab = db.table("file_collaborators")\
        .select("*").eq("file_id", file_id).eq("user_id", user_id).execute()
    if collab.data:
        return file

    raise HTTPException(status_code=403, detail="Sin acceso a este archivo")


@app.get("/files", response_model=list[FileListItem])
async def list_files(user: dict = Depends(get_current_user)):
    db = get_supabase()
    user_id = user["sub"]

    # Files owned by user
    owned = db.table("files").select("id,name,updated_at,owner_id").eq("owner_id", user_id).execute()
    result = [FileListItem(id=f["id"], name=f["name"], updated_at=f["updated_at"], is_owner=True) for f in owned.data]

    # Files user is collaborator on
    collab_ids = db.table("file_collaborators").select("file_id").eq("user_id", user_id).execute()
    if collab_ids.data:
        ids = [c["file_id"] for c in collab_ids.data]
        shared = db.table("files").select("id,name,updated_at").in_("id", ids).execute()
        result += [FileListItem(id=f["id"], name=f["name"], updated_at=f["updated_at"], is_owner=False) for f in shared.data]

    return sorted(result, key=lambda x: x.updated_at, reverse=True)


@app.post("/files", response_model=FileResponse, status_code=201)
async def create_file(body: CreateFileRequest, user: dict = Depends(get_current_user)):
    db = get_supabase()
    result = db.table("files").insert({
        "owner_id": user["sub"],
        "name": body.name,
        "content": body.content,
    }).execute()
    f = result.data[0]
    return FileResponse(**f)


@app.get("/files/{file_id}", response_model=FileResponse)
async def get_file(file_id: str, user: dict = Depends(get_current_user)):
    db = get_supabase()
    file = _assert_file_access(file_id, user["sub"], db)
    return FileResponse(**file)


@app.patch("/files/{file_id}", response_model=FileResponse)
async def update_file(file_id: str, body: UpdateFileRequest, user: dict = Depends(get_current_user)):
    db = get_supabase()
    file = _assert_file_access(file_id, user["sub"], db, require_write=True)
    user_id = user["sub"]

    updates = {"content": body.content, "updated_at": datetime.now(timezone.utc).isoformat()}
    if body.name:
        updates["name"] = body.name

    result = db.table("files").update(updates).eq("id", file_id).execute()

    # Save version (keep last 10)
    db.table("file_versions").insert({
        "file_id": file_id,
        "content": body.content,
        "saved_by": user_id,
    }).execute()
    # Prune old versions
    all_versions = db.table("file_versions")\
        .select("id").eq("file_id", file_id)\
        .order("created_at", desc=True).execute()
    if len(all_versions.data) > 10:
        old_ids = [v["id"] for v in all_versions.data[10:]]
        db.table("file_versions").delete().in_("id", old_ids).execute()

    return FileResponse(**result.data[0])


@app.delete("/files/{file_id}", status_code=204)
async def delete_file(file_id: str, user: dict = Depends(get_current_user)):
    db = get_supabase()
    result = db.table("files").select("owner_id").eq("id", file_id).execute()
    if not result.data or result.data[0]["owner_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Solo el dueño puede eliminar el archivo")
    db.table("files").delete().eq("id", file_id).execute()


@app.post("/files/{file_id}/share", response_model=ShareResponse)
async def share_file(file_id: str, user: dict = Depends(get_current_user)):
    db = get_supabase()
    file = _assert_file_access(file_id, user["sub"], db, require_write=True)
    if file["owner_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Solo el dueño puede compartir el archivo")

    token = file.get("share_token") or secrets.token_urlsafe(16)
    db.table("files").update({"share_token": token, "share_enabled": True}).eq("id", file_id).execute()

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000").split(",")[0].strip()
    return ShareResponse(share_token=token, share_url=f"{frontend_url}/collab/{token}", share_enabled=True)


@app.delete("/files/{file_id}/share", status_code=204)
async def revoke_share(file_id: str, user: dict = Depends(get_current_user)):
    db = get_supabase()
    result = db.table("files").select("owner_id").eq("id", file_id).execute()
    if not result.data or result.data[0]["owner_id"] != user["sub"]:
        raise HTTPException(status_code=403, detail="Sin permiso")
    db.table("files").update({"share_enabled": False}).eq("id", file_id).execute()


@app.get("/files/shared/{token}", response_model=FileResponse)
async def get_shared_file(token: str, user: dict = Depends(get_current_user)):
    db = get_supabase()
    result = db.table("files").select("*").eq("share_token", token).eq("share_enabled", True).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Link inválido o revocado")
    return FileResponse(**result.data[0])


@app.get("/files/{file_id}/versions", response_model=list[VersionItem])
async def get_versions(file_id: str, user: dict = Depends(get_current_user)):
    db = get_supabase()
    _assert_file_access(file_id, user["sub"], db)
    result = db.table("file_versions")\
        .select("id,saved_by,created_at")\
        .eq("file_id", file_id)\
        .order("created_at", desc=True)\
        .execute()
    return [VersionItem(**v) for v in result.data]


@app.get("/files/{file_id}/versions/{version_id}/content")
async def get_version_content(file_id: str, version_id: str, user: dict = Depends(get_current_user)):
    db = get_supabase()
    _assert_file_access(file_id, user["sub"], db)
    result = db.table("file_versions").select("content").eq("id", version_id).eq("file_id", file_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Versión no encontrada")
    return {"content": result.data[0]["content"]}


# ──────────────── PROLOG EXECUTION ────────────────
@app.post("/prolog/execute", response_model=ExecuteResponse)
@limiter.limit("20/minute")
async def execute(request: Request, body: ExecuteRequest, user: dict = Depends(get_current_user)):
    result = execute_prolog(body.code, body.query)
    return ExecuteResponse(**result)


# ──────────────── WEBSOCKET COLLABORATION ────────────────
@app.websocket("/ws/collab/{file_id}")
async def collab_ws(websocket: WebSocket, file_id: str, token: str):
    # Validate JWT from query param
    try:
        user = decode_token(token)
    except HTTPException:
        await websocket.close(code=4001)
        return

    db = get_supabase()
    user_id = user["sub"]
    username = user["username"]

    # Check file access
    try:
        _assert_file_access(file_id, user_id, db)
    except HTTPException:
        await websocket.close(code=4003)
        return

    await manager.connect(file_id, websocket, username)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "content_update":
                # Broadcast content to all others in the room
                await manager.broadcast(file_id, {
                    "type": "content_update",
                    "content": msg.get("content", ""),
                    "username": username,
                }, exclude=websocket)

            elif msg_type == "cursor":
                await manager.broadcast(file_id, {
                    "type": "cursor",
                    "username": username,
                    "line": msg.get("line", 0),
                    "col": msg.get("col", 0),
                }, exclude=websocket)

            elif msg_type == "save":
                # Auto-save triggered by client
                content = msg.get("content", "")
                db.table("files").update({
                    "content": content,
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }).eq("id", file_id).execute()
                # Notify all (including sender) that it was saved
                await manager.broadcast(file_id, {
                    "type": "saved",
                    "by": username,
                })

    except WebSocketDisconnect:
        await manager.disconnect(file_id, websocket, username)
