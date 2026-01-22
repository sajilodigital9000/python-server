/**
 * Scratchpad Tool - Collaborative Text Editor
 * Real-time collaborative note-taking and code editing
 */

class ScratchpadTool {
    constructor(container, collaborativeCore) {
        this.container = container;
        this.core = collaborativeCore;
        this.editor = null;
        this.content = '';
        this.lastSyncedContent = '';
        this.remoteCursors = new Map();
        this.lastChangeTime = 0;
        this.autoSaveTimeout = null;
        this.isSyncing = false;

        this.initialize();
    }

    initialize() {
        // Create scratchpad UI
        this.container.innerHTML = `
            <div style="display: flex; flex-direction: column; flex: 1; overflow: hidden;">
                <!-- Toolbar -->
                <div class="canvas-toolbar">
                    <div class="canvas-tool-group">
                        <select id="scratchpadMode" class="canvas-select">
                            <option value="plaintext">Plain Text</option>
                            <option value="markdown">Markdown</option>
                            <option value="javascript">JavaScript</option>
                            <option value="python">Python</option>
                            <option value="html">HTML</option>
                            <option value="css">CSS</option>
                        </select>
                    </div>
                    
                    <div class="canvas-tool-group">
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #94a3b8;">
                            <input type="checkbox" id="scratchpadLineNumbers" checked />
                            Line Numbers
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #94a3b8;">
                            <input type="checkbox" id="scratchpadWordWrap" />
                            Word Wrap
                        </label>
                    </div>
                    
                    <div class="canvas-tool-group" style="margin-left: auto;">
                        <span id="scratchpadStatus" style="font-size: 13px; color: #64748b; padding: 0 12px;">
                            Ready
                        </span>
                        <button class="canvas-tool-btn" onclick="window.scratchpadTool.clearDocument()" title="Clear">
                            <i data-lucide="trash-2"></i>
                        </button>
                        <button class="canvas-tool-btn" onclick="window.scratchpadTool.downloadDocument()" title="Download">
                            <i data-lucide="download"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Editor Container -->
                <div class="scratchpad-editor-container" style="flex: 1; position: relative; overflow: hidden;">
                    <textarea id="scratchpadEditor" style="
                        width: 100%;
                        height: 100%;
                        background: #1e293b;
                        color: #e2e8f0;
                        border: none;
                        outline: none;
                        padding: 16px;
                        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                        font-size: 14px;
                        line-height: 1.6;
                        resize: none;
                        tab-size: 4;
                    "></textarea>
                    <div id="remoteCursorsIndicator" style="
                        position: absolute;
                        bottom: 12px;
                        right: 12px;
                        display: flex;
                        gap: 8px;
                        pointer-events: none;
                    "></div>
                </div>
            </div>
        `;

        // Setup editor
        this.editor = document.getElementById('scratchpadEditor');

        // Setup event listeners
        this.setupEventListeners();
        this.setupCollaborativeListeners();

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }

        console.log('[Scratchpad Tool] Initialized');
    }

    setupEventListeners() {
        // Editor content changes
        this.editor.addEventListener('input', () => {
            this.handleContentChange();
        });

        // Cursor position tracking
        this.editor.addEventListener('keyup', () => {
            this.broadcastCursor();
        });

        this.editor.addEventListener('mouseup', () => {
            this.broadcastCursor();
        });

        // Mode selector
        const modeSelector = document.getElementById('scratchpadMode');
        if (modeSelector) {
            modeSelector.addEventListener('change', (e) => {
                this.updateEditorMode(e.target.value);
            });
        }

        // Line numbers toggle
        const lineNumbersToggle = document.getElementById('scratchpadLineNumbers');
        if (lineNumbersToggle) {
            lineNumbersToggle.addEventListener('change', (e) => {
                this.toggleLineNumbers(e.target.checked);
            });
        }

        // Word wrap toggle
        const wordWrapToggle = document.getElementById('scratchpadWordWrap');
        if (wordWrapToggle) {
            wordWrapToggle.addEventListener('change', (e) => {
                this.editor.style.whiteSpace = e.target.checked ? 'pre-wrap' : 'pre';
            });
        }

        // Tab key handling
        this.editor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.editor.selectionStart;
                const end = this.editor.selectionEnd;
                const value = this.editor.value;

                this.editor.value = value.substring(0, start) + '    ' + value.substring(end);
                this.editor.selectionStart = this.editor.selectionEnd = start + 4;

                this.handleContentChange();
            }
        });
    }

    setupCollaborativeListeners() {
        if (!this.core) return;

        // Receive remote changes
        this.core.on('scratchpad_change', ({ user, data }) => {
            if (!this.isSyncing) {
                this.applyRemoteChange(data);
            }
        });

        // Receive remote cursors
        this.core.on('scratchpad_cursor', ({ user, data }) => {
            this.updateRemoteCursor(user, data);
        });

        // Receive initial state
        this.core.on('scratchpad_state', (data) => {
            if (data.content) {
                this.editor.value = data.content;
                this.content = data.content;
                this.lastSyncedContent = data.content;
                this.updateStatus('Loaded');
            }
        });

        // Save complete notification
        this.core.on('save_complete', (data) => {
            if (data.success) {
                this.updateStatus('Saved');
                setTimeout(() => this.updateStatus('Ready'), 2000);
            }
        });
    }

    handleContentChange() {
        const newContent = this.editor.value;

        // Update local state
        this.content = newContent;
        this.lastChangeTime = Date.now();

        // Broadcast change
        if (this.core && this.core.isConnected()) {
            this.isSyncing = true;

            this.core.send({
                type: 'scratchpad_change',
                room: 'scratchpad',
                data: {
                    content: newContent,
                    timestamp: Date.now()
                }
            });

            setTimeout(() => {
                this.isSyncing = false;
            }, 100);
        }

        // Schedule auto-save
        this.scheduleAutoSave();

        // Update status
        this.updateStatus('Editing...');
    }

    applyRemoteChange(data) {
        // Store cursor position
        const start = this.editor.selectionStart;
        const end = this.editor.selectionEnd;
        const oldLength = this.content.length;

        // Apply change
        this.editor.value = data.content;
        this.content = data.content;

        // Try to maintain cursor position
        const lengthDiff = data.content.length - oldLength;
        this.editor.selectionStart = Math.max(0, start + lengthDiff);
        this.editor.selectionEnd = Math.max(0, end + lengthDiff);
    }

    scheduleAutoSave() {
        // Clear previous timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        // Schedule save after 2 seconds of inactivity
        this.autoSaveTimeout = setTimeout(() => {
            this.saveDocument();
        }, 2000);
    }

    saveDocument() {
        if (!this.core || !this.core.isConnected()) return;

        // Don't save if content hasn't changed
        if (this.content === this.lastSyncedContent) return;

        this.updateStatus('Saving...');
        this.lastSyncedContent = this.content;

        this.core.send({
            type: 'save_scratchpad',
            room: 'scratchpad',
            data: {
                doc_id: 'default',
                content: this.content,
                metadata: {
                    mode: document.getElementById('scratchpadMode')?.value || 'plaintext',
                    lines: this.content.split('\n').length,
                    characters: this.content.length
                }
            }
        });
    }

    broadcastCursor() {
        if (!this.core || !this.core.isConnected()) return;

        const position = this.editor.selectionStart;
        const lines = this.content.substring(0, position).split('\n');
        const line = lines.length;
        const column = lines[lines.length - 1].length;

        this.core.send({
            type: 'scratchpad_cursor',
            room: 'scratchpad',
            data: {
                position,
                line,
                column
            }
        });
    }

    updateRemoteCursor(user, data) {
        const container = document.getElementById('remoteCursorsIndicator');
        if (!container) return;

        let cursor = this.remoteCursors.get(user.id);

        if (!cursor) {
            cursor = document.createElement('div');
            cursor.className = 'remote-cursor-indicator';
            cursor.style.cssText = `
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                background: ${user.color};
                color: white;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            `;
            container.appendChild(cursor);
            this.remoteCursors.set(user.id, cursor);
        }

        // Update cursor info
        cursor.innerHTML = `
            <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i>
            ${user.name.split(' ')[0]} (L${data.line})
        `;

        if (window.lucide) {
            lucide.createIcons();
        }

        // Auto-remove after 3 seconds of inactivity
        clearTimeout(cursor.timeout);
        cursor.timeout = setTimeout(() => {
            cursor.remove();
            this.remoteCursors.delete(user.id);
        }, 3000);
    }

    updateEditorMode(mode) {
        // Visual indication of mode
        this.updateStatus(`Mode: ${mode}`);
        setTimeout(() => this.updateStatus('Ready'), 2000);
    }

    toggleLineNumbers(enabled) {
        // Simple line numbers implementation
        if (enabled) {
            this.editor.style.paddingLeft = '50px';
            this.updateStatus('Line numbers enabled');
        } else {
            this.editor.style.paddingLeft = '16px';
            this.updateStatus('Line numbers disabled');
        }
        setTimeout(() => this.updateStatus('Ready'), 2000);
    }

    clearDocument() {
        if (!confirm('Clear the entire document? This will affect all users.')) return;

        this.editor.value = '';
        this.content = '';
        this.handleContentChange();
    }

    downloadDocument() {
        const mode = document.getElementById('scratchpadMode')?.value || 'plaintext';
        const extensions = {
            'plaintext': 'txt',
            'markdown': 'md',
            'javascript': 'js',
            'python': 'py',
            'html': 'html',
            'css': 'css'
        };

        const ext = extensions[mode] || 'txt';
        const blob = new Blob([this.content], { type: 'text/plain' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `scratchpad_${Date.now()}.${ext}`;
        link.click();

        if (window.showToast) {
            showToast('Document downloaded', 'success');
        }
    }

    updateStatus(text) {
        const statusEl = document.getElementById('scratchpadStatus');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }

    destroy() {
        // Cleanup
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        this.remoteCursors.clear();
    }
}

// Export
window.ScratchpadTool = ScratchpadTool;
