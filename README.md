# SajiloSpace Pro

SajiloSpace Pro is a modern, self-hosted file manager and server built with Python and vanilla web technologies. It provides a beautiful, responsive interface for managing files, monitoring system status, and editing code directly from your browser.

## Features

- **Modern UI/UX**: Sleek glassmorphism design with Dark/Light mode support.
- **File Management**: Upload, download, rename, move, and delete files/folders.
- **Batch Operations**: Select multiple files to zip, move, or delete in bulk.
- **Code Editor**: Integrated Monaco Editor (VS Code engine) for editing code files on the fly.
- **Media Viewer**: Fullscreen image and video viewer with navigation and download controls.
- **Recycle Bin**: Soft delete functionality with restore options.
- **System Monitoring**: Real-time display of CPU, RAM, and Disk usage.
- **Mobile Friendly**: Fully responsive layout optimized for mobile devices.
- **Local Connectivity**: Auto-generates a QR code for easy access from mobile devices on the same network.
- **Search**: fast local and global search functionality.

## Tech Stack

### Backend

- **Language**: Python 3.x
- **Framework**: Native `http.server` (No heavy frameworks like Flask/Django required)
- **Dependencies**: Minimal (only `qrcode` and `Pillow` for QR generation)

### Frontend

- **Structure**: HTML5
- **Styling**: Modern CSS3 (CSS Variables, Flexbox, Grid, Glassmorphism)
- **Logic**: Vanilla JavaScript (ES6+)
- **Libraries (CDN)**:
  - [Lucide Icons](https://lucide.dev) - For beautiful iconography
  - [Monaco Editor](https://microsoft.github.io/monaco-editor/) - VS Code-like editing experience
  - [Marked.js](https://marked.js.org/) - Markdown rendering
  - [Highlight.js](https://highlightjs.org/) - Syntax highlighting

## Installation & Setup

### Prerequisites

- Python 3.7 or higher installed on your system.

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/sajilospace-pro.git
cd sajilospace-pro
```

### 2. Install Dependencies

The project uses standard libraries mostly, but you need to install `qrcode` for the mobile connection feature.

```bash
pip install qrcode[pil]
```

_(Note: `[pil]` installs Pillow, which is required for generating the QR image)_

### 3. Run the Server

Navigate to the server directory and run:

```bash
python server.py
```

### 4. Access the Dashboard

- **Desktop**: Open your browser and go to `http://localhost:4142` (or the IP printed in the terminal).
- **Mobile**: Scan the generated `qr.png` (created in the `Home` folder) or manually enter the IP address shown in the terminal.

## Configuration

You can customize the server settings by modifying `config.json` (auto-generated on first run or manually created):

```json
{
  "admin_key": "your-secret-key",
  "port": 4142,
  "upload_root": "Home",
  "hidden_folders": [".recycle_bin", "server-icons", "useful-info"]
}
```

## Keyboard Shortcuts

- **Search**: `/`
- **Fullscreen Media**:
  - `Esc`: Close
  - `Left/Right Arrow`: Navigate Previous/Next
- **Selection**:
  - `Click`: Select/Deselect
  - `Shift + Click`: Range Select

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is open-source and free to use.
