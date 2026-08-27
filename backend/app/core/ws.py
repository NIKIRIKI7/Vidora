from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, client_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        print(f"[WS] Клиент подключен: '{client_id}' (Всего: {len(self.active_connections)})")

    def disconnect(self, client_id: str, websocket: WebSocket = None):
        if client_id in self.active_connections:
            if websocket is None or self.active_connections[client_id] == websocket:
                del self.active_connections[client_id]
                print(f"[WS] Клиент отключен: '{client_id}' (Осталось: {len(self.active_connections)})")

    async def send_personal_message(self, message: dict, client_id: str):
        websocket = self.active_connections.get(client_id)
        if websocket:
            await websocket.send_json(message)

    async def broadcast(self, message: dict):
        msg_type = message.get("type", "UNKNOWN")
        disconnected = []
        for client_id, connection in self.active_connections.items():
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(client_id)
        for client_id in disconnected:
            self.disconnect(client_id)


ws_manager = ConnectionManager()
