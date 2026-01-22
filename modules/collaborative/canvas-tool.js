/**
 * Canvas Tool - Collaborative Drawing
 * Real-time collaborative whiteboard/canvas
 */

class CanvasTool {
    constructor(container, collaborativeCore) {
        this.container = container;
        this.core = collaborativeCore;
        this.canvas = null;
        this.ctx = null;
        this.isDrawing = false;
        this.currentTool = 'pen';
        this.currentColor = '#4ade80';
        this.currentSize = 3;
        this.strokes = [];
        this.remoteCursors = new Map();
        this.lastCursorUpdate = 0;

        this.initialize();
    }

    initialize() {
        // Create canvas UI
        this.container.innerHTML = `
            <div style="display: flex; flex-direction: column; flex: 1; overflow: hidden;">
                <!-- Toolbar -->
                <div class="canvas-toolbar">
                    <div class="canvas-tool-group">
                        <button class="canvas-tool-btn active" data-tool="pen" title="Pen">
                            <i data-lucide="pen-tool"></i>
                        </button>
                        <button class="canvas-tool-btn" data-tool="eraser" title="Eraser">
                            <i data-lucide="eraser"></i>
                        </button>
                    </div>
                    
                    <div class="canvas-tool-group">
                        <label class="color-picker-label" title="Color">
                            <input type="color" id="canvasColorPicker" value="${this.currentColor}" />
                            <div class="color-preview" style="background: ${this.currentColor}"></div>
                        </label>
                        <select id="canvasBrushSize" class="canvas-select" title="Brush Size">
                            <option value="1">1px</option>
                            <option value="2">2px</option>
                            <option value="3" selected>3px</option>
                            <option value="5">5px</option>
                            <option value="8">8px</option>
                            <option value="12">12px</option>
                            <option value="20">20px</option>
                        </select>
                    </div>
                    
                    <div class="canvas-tool-group" style="margin-left: auto;">
                        <button class="canvas-tool-btn" onclick="window.canvasTool.clearCanvas()" title="Clear Canvas">
                            <i data-lucide="trash-2"></i>
                        </button>
                        <button class="canvas-tool-btn" onclick="window.canvasTool.saveCanvas()" title="Save as PNG">
                            <i data-lucide="download"></i>
                        </button>
                    </div>
                </div>
                
                <!-- Canvas Container -->
                <div class="canvas-container" style="flex: 1; position: relative; overflow: hidden; background: #1e293b;">
                    <canvas id="drawingCanvas"></canvas>
                    <div id="remoteCursorsContainer" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;"></div>
                </div>
            </div>
        `;

        // Setup canvas
        this.canvas = document.getElementById('drawingCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        // Setup event listeners
        this.setupEventListeners();
        this.setupCollaborativeListeners();

        // Initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }

        console.log('[Canvas Tool] Initialized');
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();

        // Store current canvas data
        const imageData = this.ctx ? this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height) : null;

        // Resize canvas
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        // Restore canvas data
        if (imageData) {
            this.ctx.putImageData(imageData, 0, 0);
        }

        // Set canvas style
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.cursor = 'crosshair';
    }

    setupEventListeners() {
        // Canvas drawing events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

        // Touch events for mobile
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousedown', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const mouseEvent = new MouseEvent('mousemove', {
                clientX: touch.clientX,
                clientY: touch.clientY
            });
            this.canvas.dispatchEvent(mouseEvent);
        });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            const mouseEvent = new MouseEvent('mouseup', {});
            this.canvas.dispatchEvent(mouseEvent);
        });

        // Tool buttons
        document.querySelectorAll('.canvas-tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.canvas-tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTool = btn.dataset.tool;
            });
        });

        // Color picker
        const colorPicker = document.getElementById('canvasColorPicker');
        if (colorPicker) {
            colorPicker.addEventListener('input', (e) => {
                this.currentColor = e.target.value;
                document.querySelector('.color-preview').style.background = this.currentColor;
            });
        }

        // Brush size
        const brushSize = document.getElementById('canvasBrushSize');
        if (brushSize) {
            brushSize.addEventListener('change', (e) => {
                this.currentSize = parseInt(e.target.value);
            });
        }

        // Window resize
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    setupCollaborativeListeners() {
        if (!this.core) return;

        // Receive remote strokes
        this.core.on('canvas_stroke', ({ user, data }) => {
            this.drawRemoteStroke(data);
        });

        // Receive canvas clear
        this.core.on('canvas_clear', ({ user }) => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.strokes = [];
        });

        // Receive remote cursors
        this.core.on('canvas_cursor', ({ user, data }) => {
            this.updateRemoteCursor(user, data);
        });

        // Receive initial canvas state
        this.core.on('canvas_state', (data) => {
            if (data.strokes && Array.isArray(data.strokes)) {
                this.strokes = data.strokes;
                this.redrawCanvas();
            }
        });

        // Track mouse for cursor sharing
        this.canvas.addEventListener('mousemove', (e) => {
            this.broadcastCursor(e);
        });
    }

    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    startDrawing(e) {
        this.isDrawing = true;
        const pos = this.getCanvasCoordinates(e);

        // Start new stroke
        this.currentStroke = {
            tool: this.currentTool,
            color: this.currentColor,
            size: this.currentSize,
            points: [pos]
        };
    }

    draw(e) {
        if (!this.isDrawing) return;

        const pos = this.getCanvasCoordinates(e);
        this.currentStroke.points.push(pos);

        // Draw locally
        this.drawStroke(this.currentStroke, this.currentStroke.points.length - 2);
    }

    stopDrawing() {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.currentStroke && this.currentStroke.points.length > 0) {
            // Save stroke
            this.strokes.push(this.currentStroke);

            // Broadcast stroke to others
            if (this.core && this.core.isConnected()) {
                this.core.send({
                    type: 'canvas_stroke',
                    room: 'canvas',
                    data: this.currentStroke
                });
            }
        }

        this.currentStroke = null;
    }

    drawStroke(stroke, startIndex = 0) {
        if (!stroke || !stroke.points || stroke.points.length < 2) return;

        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.lineWidth = stroke.size;

        if (stroke.tool === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = stroke.color;
        }

        this.ctx.beginPath();

        const start = Math.max(0, startIndex);
        const points = stroke.points;

        if (start === 0) {
            this.ctx.moveTo(points[0].x, points[0].y);
        } else {
            this.ctx.moveTo(points[start].x, points[start].y);
        }

        for (let i = start + 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }

        this.ctx.stroke();
        this.ctx.globalCompositeOperation = 'source-over';
    }

    drawRemoteStroke(stroke) {
        this.strokes.push(stroke);
        this.drawStroke(stroke);
    }

    redrawCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.strokes.forEach(stroke => this.drawStroke(stroke));
    }

    clearCanvas() {
        if (!confirm('Clear the entire canvas? This will affect all users.')) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.strokes = [];

        // Broadcast clear to others
        if (this.core && this.core.isConnected()) {
            this.core.send({
                type: 'canvas_clear',
                room: 'canvas'
            });
        }
    }

    saveCanvas() {
        const link = document.createElement('a');
        link.download = `canvas_${Date.now()}.png`;
        link.href = this.canvas.toDataURL('image/png');
        link.click();

        if (window.showToast) {
            showToast('Canvas saved as PNG', 'success');
        }
    }

    broadcastCursor(e) {
        // Throttle cursor updates
        const now = Date.now();
        if (now - this.lastCursorUpdate < 50) return;
        this.lastCursorUpdate = now;

        const pos = this.getCanvasCoordinates(e);

        if (this.core && this.core.isConnected()) {
            this.core.send({
                type: 'canvas_cursor',
                room: 'canvas',
                data: {
                    x: pos.x / this.canvas.width,  // Normalize to 0-1
                    y: pos.y / this.canvas.height
                }
            });
        }
    }

    updateRemoteCursor(user, data) {
        const container = document.getElementById('remoteCursorsContainer');
        if (!container) return;

        let cursor = this.remoteCursors.get(user.id);

        if (!cursor) {
            cursor = document.createElement('div');
            cursor.className = 'remote-cursor';
            cursor.innerHTML = `
                <svg width="20" height="20" viewBox="0 0 20 20">
                    <path d="M2 2 L2 18 L8 13 L11 19 L13 18 L10 12 L16 12 Z" fill="${user.color}" stroke="white" stroke-width="1"/>
                </svg>
                <span class="remote-cursor-name" style="background: ${user.color}">${user.name}</span>
            `;
            container.appendChild(cursor);
            this.remoteCursors.set(user.id, cursor);
        }

        // Update position
        const x = data.x * this.canvas.width;
        const y = data.y * this.canvas.height;
        cursor.style.left = `${x}px`;
        cursor.style.top = `${y}px`;
    }

    destroy() {
        // Cleanup
        this.remoteCursors.clear();
        window.removeEventListener('resize', this.resizeCanvas);
    }
}

// Export
window.CanvasTool = CanvasTool;
