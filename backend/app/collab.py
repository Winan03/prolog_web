"""
WebSocket collaboration manager.
Handles real-time co-editing sessions per file.
"""

import json
from typing import DefaultDict
from collections import defaultdict
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # file_id → list of (websocket, username)
        self.rooms: DefaultDict[str, list[dict]] = defaultdict(list)

    async def connect(self, file_id: str, websocket: WebSocket, username: str):
        await websocket.accept()
        self.rooms[file_id].append({"ws": websocket, "username": username})
        # Notify others
        await self.broadcast(file_id, {
            "type": "user_joined",
            "username": username,
            "online_users": self._online_users(file_id),
        }, exclude=websocket)

    async def disconnect(self, file_id: str, websocket: WebSocket, username: str):
        self.rooms[file_id] = [
            c for c in self.rooms[file_id] if c["ws"] is not websocket
        ]
        if not self.rooms[file_id]:
            del self.rooms[file_id]
        else:
            await self.broadcast(file_id, {
                "type": "user_left",
                "username": username,
                "online_users": self._online_users(file_id),
            })

    async def broadcast(self, file_id: str, message: dict, exclude: WebSocket = None):
        payload = json.dumps(message, ensure_ascii=False, default=str)
        dead = []
        for conn in self.rooms.get(file_id, []):
            if conn["ws"] is exclude:
                continue
            try:
                await conn["ws"].send_text(payload)
            except Exception:
                dead.append(conn)
        # Clean up dead connections
        for d in dead:
            self.rooms[file_id].remove(d)

    def _online_users(self, file_id: str) -> list[str]:
        return [c["username"] for c in self.rooms.get(file_id, [])]

    def get_online_count(self, file_id: str) -> int:
        return len(self.rooms.get(file_id, []))


manager = ConnectionManager()
