from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


# ──────────────── AUTH ────────────────
class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=30, pattern=r'^[a-zA-Z0-9_]+$')
    password: str = Field(..., min_length=8)
    invitation_code: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    username: str
    role: str

class UserInfo(BaseModel):
    id: str
    email: str
    username: str
    role: str


# ──────────────── INVITATION ────────────────
class CreateInvitationRequest(BaseModel):
    max_uses: int = Field(default=1, ge=1, le=100)
    expires_hours: Optional[int] = Field(default=None, ge=1, le=720)

class InvitationResponse(BaseModel):
    id: str
    code: str
    max_uses: int
    use_count: int
    expires_at: Optional[datetime]
    created_at: datetime


# ──────────────── FILES ────────────────
class CreateFileRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    content: str = ""

class UpdateFileRequest(BaseModel):
    content: str
    name: Optional[str] = None

class FileResponse(BaseModel):
    id: str
    owner_id: str
    name: str
    content: str
    share_token: Optional[str]
    share_enabled: bool
    updated_at: datetime
    created_at: datetime

class FileListItem(BaseModel):
    id: str
    name: str
    updated_at: datetime
    is_owner: bool

class ShareResponse(BaseModel):
    share_token: str
    share_url: str
    share_enabled: bool


# ──────────────── PROLOG ────────────────
class ExecuteRequest(BaseModel):
    code: str = Field(..., max_length=50_000)
    query: str = Field(..., max_length=2_000)
    file_id: Optional[str] = None

class ExecuteResponse(BaseModel):
    output: str
    error: str
    success: bool
    execution_time_ms: int


# ──────────────── COLLAB (WebSocket messages) ────────────────
class CollabMessage(BaseModel):
    type: str         # "content_update" | "cursor" | "user_joined" | "user_left" | "save"
    content: Optional[str] = None
    cursor_line: Optional[int] = None
    cursor_col: Optional[int] = None
    username: Optional[str] = None
    file_id: Optional[str] = None


# ──────────────── VERSIONS ────────────────
class VersionItem(BaseModel):
    id: str
    saved_by: Optional[str]
    created_at: datetime
