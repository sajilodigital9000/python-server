"""
WebSocket Server for Real-time Collaboration
Handles real-time communication for canvas and scratchpad tools
"""

import asyncio
import websockets
import json
import time
from datetime import datetime
from collections import defaultdict
import sys
import os

# Import collaborative manager
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from collaborative_manager import CollaborativeManager

# Configuration
WS_HOST = "0.0.0.0"
WS_PORT = 4143
BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Home")

# Global state
connected_clients = set()
rooms = defaultdict(set)  # room_name -> set of websockets
user_info = {}  # websocket -> user data
active_canvases = {}  # room_name -> list of strokes
collab_manager = CollaborativeManager(BASE_DIR)

# User colors for visual identification
USER_COLORS = [
    "#4ade80", "#60a5fa", "#f472b6", "#fb923c", 
    "#a78bfa", "#fbbf24", "#34d399", "#f87171"
]
color_index = 0

def get_user_color():
    """Assign a color to a new user"""
    global color_index
    color = USER_COLORS[color_index % len(USER_COLORS)]
    color_index += 1
    return color

async def register_client(websocket, user_data):
    """Register a new client connection"""
    global connected_clients, user_info
    
    connected_clients.add(websocket)
    user_info[websocket] = {
        "id": user_data.get("id", f"user_{int(time.time() * 1000)}"),
        "name": user_data.get("name", "Anonymous"),
        "color": get_user_color(),
        "connected_at": datetime.now().isoformat()
    }
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] User connected: {user_info[websocket]['name']} ({len(connected_clients)} total)")

async def unregister_client(websocket):
    """Unregister a client connection"""
    global connected_clients, user_info, rooms
    
    if websocket in connected_clients:
        connected_clients.remove(websocket)
    
    # Remove from all rooms
    for room_clients in rooms.values():
        room_clients.discard(websocket)
    
    user_name = user_info.get(websocket, {}).get("name", "Unknown")
    if websocket in user_info:
        del user_info[websocket]
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] User disconnected: {user_name} ({len(connected_clients)} total)")

async def join_room(websocket, room_name):
    """Add client to a room"""
    rooms[room_name].add(websocket)
    user = user_info.get(websocket, {})
    
    # Notify others in the room
    await broadcast(room_name, {
        "type": "user_join",
        "room": room_name,
        "user": user,
        "timestamp": time.time()
    }, exclude=websocket)
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {user.get('name')} joined room: {room_name}")

    # Send in-memory canvas state to new user
    if room_name == "canvas" and room_name in active_canvases:
        current_strokes = active_canvases[room_name]
        if current_strokes:
            print(f"Sending {len(current_strokes)} cached strokes to new user")
            await websocket.send(json.dumps({
                "type": "canvas_state",
                "data": {"strokes": current_strokes},
                "timestamp": time.time()
            }))

async def leave_room(websocket, room_name):
    """Remove client from a room"""
    if room_name in rooms:
        rooms[room_name].discard(websocket)
    
    user = user_info.get(websocket, {})
    
    # Notify others in the room
    await broadcast(room_name, {
        "type": "user_leave",
        "room": room_name,
        "user": user,
        "timestamp": time.time()
    }, exclude=websocket)
    
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {user.get('name')} left room: {room_name}")

async def broadcast(room_name, message, exclude=None):
    """
    Broadcast message to all clients in a room
    Args:
        room_name: Name of the room
        message: Message dict to send
        exclude: Optional websocket to exclude from broadcast
    """
    if room_name not in rooms:
        return
    
    # Convert message to JSON
    message_json = json.dumps(message)
    
    # Send to all clients in room except excluded one
    disconnected = set()
    for client in rooms[room_name]:
        if client != exclude:
            try:
                await client.send(message_json)
            except websockets.exceptions.ConnectionClosed:
                disconnected.add(client)
    
    # Clean up disconnected clients
    for client in disconnected:
        await unregister_client(client)

async def handle_message(websocket, message_data):
    """
    Process incoming WebSocket message
    Args:
        websocket: Client websocket connection
        message_data: Parsed message dict
    """
    msg_type = message_data.get("type")
    room = message_data.get("room")
    data = message_data.get("data", {})
    
    # Add user info to message
    message_data["user"] = user_info.get(websocket, {})
    message_data["timestamp"] = time.time()
    
    # Handle different message types
    if msg_type == "join_room":
        await join_room(websocket, room)
        
        # Send current room state
        if room == "canvas":
            # Load canvas data if exists
            canvas_id = data.get("canvas_id", "default")
            canvas_data = collab_manager.load_canvas(canvas_id)
            if canvas_data:
                await websocket.send(json.dumps({
                    "type": "canvas_state",
                    "room": room,
                    "data": canvas_data,
                    "timestamp": time.time()
                }))
        
        elif room == "scratchpad":
            # Load scratchpad data if exists
            doc_id = data.get("doc_id", "default")
            doc_data = collab_manager.load_scratchpad(doc_id)
            if doc_data:
                await websocket.send(json.dumps({
                    "type": "scratchpad_state",
                    "room": room,
                    "data": doc_data,
                    "timestamp": time.time()
                }))
        
        # Send active users list
        active_users = [
            user_info[client] for client in rooms[room]
        ]
        await websocket.send(json.dumps({
            "type": "active_users",
            "room": room,
            "data": {"users": active_users},
            "timestamp": time.time()
        }))
    
    elif msg_type == "leave_room":
        await leave_room(websocket, room)
    
    elif msg_type == "canvas_stroke":
        # Store in memory
        if room:
            if room not in active_canvases:
                active_canvases[room] = []
            active_canvases[room].append(data)
            
        # Broadcast to others
        await broadcast(room, message_data, exclude=websocket)

    elif msg_type == "canvas_clear":
        # Clear memory
        if room and room in active_canvases:
            active_canvases[room] = []
            
        # Broadcast to others
        await broadcast(room, message_data, exclude=websocket)

    elif msg_type in ["canvas_cursor", "scratchpad_change", "scratchpad_cursor"]:
        # Broadcast to all clients in the room
        await broadcast(room, message_data, exclude=websocket)
    
    elif msg_type == "save_canvas":
        # Save canvas to disk
        canvas_id = data.get("canvas_id", "default")
        result = collab_manager.save_canvas(canvas_id, data.get("canvas_data", {}))
        
        # Send confirmation back to sender
        await websocket.send(json.dumps({
            "type": "save_complete",
            "room": room,
            "data": result,
            "timestamp": time.time()
        }))
    
    elif msg_type == "save_scratchpad":
        # Save scratchpad to disk
        doc_id = data.get("doc_id", "default")
        content = data.get("content", "")
        metadata = data.get("metadata", {})
        result = collab_manager.save_scratchpad(doc_id, content, metadata)
        
        # Send confirmation back to sender
        await websocket.send(json.dumps({
            "type": "save_complete",
            "room": room,
            "data": result,
            "timestamp": time.time()
        }))
    
    elif msg_type == "list_sessions":
        # Get all available sessions
        sessions = collab_manager.get_active_sessions()
        await websocket.send(json.dumps({
            "type": "sessions_list",
            "data": sessions,
            "timestamp": time.time()
        }))
    
    elif msg_type == "create_session":
        # Create new session
        session_type = data.get("session_type")
        name = data.get("name")
        session_id = collab_manager.create_new_session(session_type, name)
        
        await websocket.send(json.dumps({
            "type": "session_created",
            "data": {"session_id": session_id},
            "timestamp": time.time()
        }))
    
    elif msg_type == "ping":
        # Heartbeat response
        await websocket.send(json.dumps({
            "type": "pong",
            "timestamp": time.time()
        }))

async def handle_client(websocket):
    """
    Main handler for WebSocket client connections
    Args:
        websocket: WebSocket connection
    """
    try:
        # Wait for initial registration message
        async for message in websocket:
            try:
                message_data = json.loads(message)
                
                # First message should be registration
                if websocket not in connected_clients:
                    if message_data.get("type") == "register":
                        await register_client(websocket, message_data.get("data", {}))
                        
                        # Send confirmation
                        await websocket.send(json.dumps({
                            "type": "registered",
                            "user": user_info[websocket],
                            "timestamp": time.time()
                        }))
                        continue
                
                # Handle user updates
                if message_data.get("type") == "update_user":
                    new_name = message_data.get("data", {}).get("name")
                    if new_name:
                        user_info[websocket]["name"] = new_name
                        # Broadcast update to current room
                        current_websocket_room = None
                        for r_name, clients in rooms.items():
                            if websocket in clients:
                                current_websocket_room = r_name
                                break
                        
                        if current_websocket_room:
                            await broadcast_active_users(current_websocket_room)
                    continue

                # Handle subsequent messages
                await handle_message(websocket, message_data)
                
            except json.JSONDecodeError:
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Invalid JSON received")
            except Exception as e:
                import traceback
                with open("server_debug.log", "a") as f:
                    f.write(f"[{datetime.now().strftime('%H:%M:%S')}] Error processing message: {e}\n")
                    f.write(traceback.format_exc())
                    f.write("\n")
                print(f"[{datetime.now().strftime('%H:%M:%S')}] Error handling message: {e}")
    
    except websockets.exceptions.ConnectionClosed:
        pass
    except Exception as e:
        import traceback
        with open("server_debug.log", "a") as f:
            f.write(f"[{datetime.now().strftime('%H:%M:%S')}] Critical Handler Error: {e}\n")
            f.write(traceback.format_exc())
            f.write("\n")
        print(f"Error in handle_client: {e}")
    finally:
        await unregister_client(websocket)

async def main():
    """Start WebSocket server"""
    print(f"\n{'='*60}")
    print(f"  WebSocket Server for Collaborative Tools")
    print(f"{'='*60}")
    print(f"  Host: {WS_HOST}")
    print(f"  Port: {WS_PORT}")
    print(f"  Storage: {BASE_DIR}/.collaborative/")
    print(f"{'='*60}\n")
    
    async with websockets.serve(handle_client, WS_HOST, WS_PORT):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] WebSocket server started")
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Waiting for connections...\n")
        await asyncio.Future()  # Run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Server stopped by user")
    except Exception as e:
        print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Server error: {e}")
