/**
 * Collaborative UI - Modal and Interface Components
 * Manages the collaborative tools modal and user interface
 */

let collabModal = null;
let currentTab = 'canvas';
let isMinimized = false;

function openCollaborativeTools() {
    // Initialize collaborative core if not already done
    if (!window.collaborativeCore) {
        window.collaborativeCore = new CollaborativeCore();
    }

    // Initialize listeners immediately to catch connection events
    initCollaborativeEventListeners();

    // Connect to WebSocket if not connected
    if (!window.collaborativeCore.isConnected()) {
        window.collaborativeCore.connect().then(() => {
            console.log('[Collab UI] Connected successfully');
            showToast('Connected to collaborative server', 'success');
        }).catch(err => {
            console.error('[Collab UI] Connection failed:', err);
            showToast('Failed to connect to collaborative server', 'error');
            return;
        });
    }

    // Show modal
    collabModal = document.getElementById('collaborativeModal');
    if (collabModal) {
        collabModal.style.display = 'flex';
        setTimeout(() => collabModal.classList.add('active'), 10);

        // Initialize the current tab
        switchCollabTab(currentTab);
    }
}

function closeCollaborativeTools() {
    if (collabModal) {
        collabModal.classList.remove('active');
        setTimeout(() => {
            collabModal.style.display = 'none';
        }, 300);
    }

    // Leave current room
    if (window.collaborativeCore && window.collaborativeCore.currentRoom) {
        window.collaborativeCore.leaveRoom(window.collaborativeCore.currentRoom);
    }
}

function minimizeCollaborativeTools() {
    if (collabModal) {
        collabModal.classList.add('minimized');
        isMinimized = true;
    }
}

function maximizeCollaborativeTools() {
    if (collabModal) {
        collabModal.classList.remove('minimized');
        isMinimized = false;
    }
}

function switchCollabTab(tabName) {
    currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.collab-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.tab === tabName) {
            btn.classList.add('active');
        }
    });

    // Update tab content
    document.querySelectorAll('.collab-tab-content').forEach(content => {
        content.classList.remove('active');
        if (content.id === `collab-${tabName}`) {
            content.classList.add('active');
        }
    });

    // Leave previous room and join new one
    if (window.collaborativeCore && window.collaborativeCore.isConnected()) {
        if (window.collaborativeCore.currentRoom) {
            window.collaborativeCore.leaveRoom(window.collaborativeCore.currentRoom);
        }
        window.collaborativeCore.joinRoom(tabName);
    }

    // Initialize the tool if needed
    if (tabName === 'canvas' && !window.canvasTool) {
        initializeCanvasTool();
    } else if (tabName === 'scratchpad' && !window.scratchpadTool) {
        initializeScratchpadTool();
    }
}

function updateActiveUsersList(users) {
    const usersList = document.getElementById('collabActiveUsers');
    if (!usersList) return;

    if (users.length === 0) {
        usersList.innerHTML = '<div class="no-users">No other users online</div>';
        return;
    }

    // Add header with self user and edit button
    const selfUser = window.collaborativeCore.getCurrentUser();
    let html = `
        <div class="collab-user self" style="--user-color: ${selfUser.color}">
            <div class="user-avatar" style="background: ${selfUser.color}">
                ${selfUser.name.charAt(0).toUpperCase()}
            </div>
            <span class="user-name">${escapeHtml(selfUser.name)} (You)</span>
            <button class="collab-icon-btn small" onclick="changeUserName()" title="Change Name">
                <i data-lucide="edit-2"></i>
            </button>
        </div>
        <div class="collab-divider"></div>
    `;

    if (users.length === 0) {
        html += '<div class="no-users">No other users online</div>';
    } else {
        html += users.map(user => `
            <div class="collab-user" style="--user-color: ${user.color}">
                <div class="user-avatar" style="background: ${user.color}">
                    ${user.name.charAt(0).toUpperCase()}
                </div>
                <span class="user-name">${escapeHtml(user.name)}</span>
            </div>
        `).join('');
    }

    usersList.innerHTML = html;
    lucide.createIcons();
}

function changeUserName() {
    const currentName = window.collaborativeCore.userName;
    const newName = prompt('Enter your name:', currentName);
    if (newName && newName.trim() !== '') {
        window.collaborativeCore.setUserName(newName.trim());
        // Force refresh of user list to update own name
        updateActiveUsersList(window.collaborativeCore.getActiveUsers());
    }
}

function showCollabNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `collab-notification ${type}`;
    notification.innerHTML = `
        <i data-lucide="${type === 'join' ? 'user-plus' : 'user-minus'}"></i>
        <span>${escapeHtml(message)}</span>
    `;

    const container = document.getElementById('collabNotifications');
    if (container) {
        container.appendChild(notification);
        lucide.createIcons();

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize collaborative event listeners
function initCollaborativeEventListeners() {
    if (!window.collaborativeCore) return;

    const core = window.collaborativeCore;

    // User join/leave events
    core.on('user_join', ({ room, user }) => {
        if (room === currentTab) {
            showCollabNotification(`${user.name} joined`, 'join');
        }
    });

    core.on('user_leave', ({ room, user }) => {
        if (room === currentTab) {
            showCollabNotification(`${user.name} left`, 'leave');
        }
    });

    // Active users update
    core.on('active_users', (users) => {
        updateActiveUsersList(users);

        // Update count in header
        const countEl = document.getElementById('collabUserCount');
        if (countEl) {
            countEl.textContent = users.length;
        }
    });

    // Connection events
    core.on('connected', () => {
        const statusEl = document.getElementById('collabStatus');
        if (statusEl) {
            statusEl.className = 'collab-status connected';
            statusEl.innerHTML = '<i data-lucide="wifi"></i> Connected';
            lucide.createIcons();
        }

        // Auto-join current room if needed
        if (currentTab && (!window.collaborativeCore.currentRoom || window.collaborativeCore.currentRoom !== currentTab)) {
            console.log('[Collab UI] Auto-joining room:', currentTab);
            window.collaborativeCore.joinRoom(currentTab);
        }
    });

    core.on('disconnected', () => {
        const statusEl = document.getElementById('collabStatus');
        if (statusEl) {
            statusEl.className = 'collab-status disconnected';
            statusEl.innerHTML = '<i data-lucide="wifi-off"></i> Disconnected';
            lucide.createIcons();
        }
        showToast('Disconnected from collaborative server', 'warning');
    });

    core.on('reconnect_failed', () => {
        showToast('Failed to reconnect. Please refresh the page.', 'error');
    });
}

// Placeholder functions for tools (will be implemented in separate files)
function initializeCanvasTool() {
    console.log('[Collab UI] Initializing canvas tool...');
    // Will be implemented in canvas-tool.js
    if (window.CanvasTool) {
        const container = document.getElementById('collab-canvas');
        window.canvasTool = new CanvasTool(container, window.collaborativeCore);
    }
}

function initializeScratchpadTool() {
    console.log('[Collab UI] Initializing scratchpad tool...');
    // Will be implemented in scratchpad-tool.js
    if (window.ScratchpadTool) {
        const container = document.getElementById('collab-scratchpad');
        window.scratchpadTool = new ScratchpadTool(container, window.collaborativeCore);
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Event listeners will be set up when modal is opened
    console.log('[Collab UI] Ready');

    // Add click-to-maximize listener
    const container = document.querySelector('.collab-container');
    if (container) {
        container.addEventListener('click', (e) => {
            // Only maximize if minimized and not clicking a button/interactive element
            if (isMinimized && !e.target.closest('button') && !e.target.closest('input') && !e.target.closest('.collab-tab-btn')) {
                maximizeCollaborativeTools();
            }
        });
    }
});
