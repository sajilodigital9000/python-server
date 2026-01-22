/**
 * Collaborative Core - WebSocket Client Manager
 * Handles real-time communication for collaborative tools
 */

class CollaborativeCore {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;
        this.eventHandlers = {};
        this.currentRoom = null;
        this.userId = this.generateUserId();
        this.userName = this.getUserName();
        this.userColor = null;
        this.activeUsers = [];

        // Get WebSocket URL (same host, different port)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        this.wsUrl = `${protocol}//${host}:4143`;
    }

    generateUserId() {
        return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    setUserName(name) {
        if (!name) return;
        this.userName = name;
        localStorage.setItem('collab_username', name);

        // Notify server
        this.send({
            type: 'update_user',
            data: { name: name }
        });

        // Notify local listeners
        this.emit('user_updated', { name: name });
        return name;
    }

    getUserName() {
        // Try to get from localStorage
        let name = localStorage.getItem('collab_username');
        if (!name) {
            name = this.generateRandomName();
            localStorage.setItem('collab_username', name);
        }
        return name;
    }

    generateRandomName() {
        const adjectives = ['Quick', 'Happy', 'Clever', 'Bright', 'Swift', 'Bold', 'Wise', 'Kind'];
        const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Fox', 'Wolf', 'Bear', 'Lion'];
        return `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
    }

    connect() {
        if (this.connected || this.ws) {
            console.log('[Collab] Already connected or connecting');
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            console.log(`[Collab] Connecting to ${this.wsUrl}...`);

            try {
                this.ws = new WebSocket(this.wsUrl);

                this.ws.onopen = () => {
                    console.log('[Collab] WebSocket connected');
                    this.connected = true;
                    this.reconnectAttempts = 0;

                    // Send registration message
                    this.send({
                        type: 'register',
                        data: {
                            id: this.userId,
                            name: this.userName
                        }
                    });

                    this.emit('connected');
                    resolve();
                };

                this.ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(message);
                    } catch (e) {
                        console.error('[Collab] Error parsing message:', e);
                    }
                };

                this.ws.onerror = (error) => {
                    console.error('[Collab] WebSocket error:', error);
                    this.emit('error', error);
                };

                this.ws.onclose = () => {
                    console.log('[Collab] WebSocket closed');
                    this.connected = false;
                    this.ws = null;
                    this.emit('disconnected');

                    // Attempt to reconnect
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        console.log(`[Collab] Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                        setTimeout(() => this.connect(), this.reconnectDelay);
                    } else {
                        console.error('[Collab] Max reconnection attempts reached');
                        this.emit('reconnect_failed');
                    }
                };

            } catch (e) {
                console.error('[Collab] Connection error:', e);
                reject(e);
            }
        });
    }

    disconnect() {
        if (this.ws) {
            this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
            this.ws.close();
            this.ws = null;
            this.connected = false;
        }
    }

    send(message) {
        if (!this.connected || !this.ws) {
            console.warn('[Collab] Cannot send message - not connected');
            return false;
        }

        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (e) {
            console.error('[Collab] Error sending message:', e);
            return false;
        }
    }

    handleMessage(message) {
        const { type, room, user, data, timestamp } = message;

        // Handle specific message types
        switch (type) {
            case 'registered':
                console.log('[Collab] Registration confirmed:', message.user);
                this.userColor = message.user.color;
                this.emit('registered', message.user);
                break;

            case 'user_join':
                console.log('[Collab] User joined:', user.name);
                this.emit('user_join', { room, user });
                break;

            case 'user_leave':
                console.log('[Collab] User left:', user.name);
                this.emit('user_leave', { room, user });
                break;

            case 'active_users':
                this.activeUsers = data.users;
                this.emit('active_users', data.users);
                break;

            case 'canvas_state':
                this.emit('canvas_state', data);
                break;

            case 'canvas_stroke':
                this.emit('canvas_stroke', { user, data });
                break;

            case 'canvas_clear':
                this.emit('canvas_clear', { user });
                break;

            case 'canvas_cursor':
                this.emit('canvas_cursor', { user, data });
                break;

            case 'scratchpad_state':
                this.emit('scratchpad_state', data);
                break;

            case 'scratchpad_change':
                this.emit('scratchpad_change', { user, data });
                break;

            case 'scratchpad_cursor':
                this.emit('scratchpad_cursor', { user, data });
                break;

            case 'save_complete':
                this.emit('save_complete', data);
                break;

            case 'pong':
                // Heartbeat response
                break;

            default:
                console.log('[Collab] Unknown message type:', type);
        }
    }

    joinRoom(roomName, sessionId = 'default') {
        this.currentRoom = roomName;
        this.send({
            type: 'join_room',
            room: roomName,
            data: {
                canvas_id: roomName === 'canvas' ? sessionId : undefined,
                doc_id: roomName === 'scratchpad' ? sessionId : undefined
            }
        });
    }

    leaveRoom(roomName) {
        this.send({
            type: 'leave_room',
            room: roomName
        });
        if (this.currentRoom === roomName) {
            this.currentRoom = null;
        }
    }

    // Event emitter methods
    on(event, callback) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(callback);
    }

    off(event, callback) {
        if (!this.eventHandlers[event]) return;
        this.eventHandlers[event] = this.eventHandlers[event].filter(cb => cb !== callback);
    }

    emit(event, data) {
        if (!this.eventHandlers[event]) return;
        this.eventHandlers[event].forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error(`[Collab] Error in event handler for ${event}:`, e);
            }
        });
    }

    // Utility methods
    getActiveUsers() {
        return this.activeUsers;
    }

    getCurrentUser() {
        return {
            id: this.userId,
            name: this.userName,
            color: this.userColor
        };
    }

    isConnected() {
        return this.connected;
    }

    // Heartbeat to keep connection alive
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.connected) {
                this.send({ type: 'ping' });
            }
        }, 30000); // Every 30 seconds
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
    }
}

// Global instance
window.collaborativeCore = null;
