from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn
import cgi
import os
import json
import time
from urllib.parse import urlparse, parse_qs, unquote
import shutil
import mimetypes
import socket
import qrcode
import re
import zipfile
import threading
import platform
import sys

import api_handlers
import api_handlers
from collaborative_manager import CollaborativeManager
try:
    from dns_service import DNSService
except ImportError:
    DNSService = None

# Load Config
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")

def load_config():
    default = {
        "admin_key": "pooju",
        "port": 4142,
        "upload_root": "Home",
        "upload_root": "Home",
        "hidden_folders": [".recycle_bin", "server-icons","useful-info"],
        "aliases": []
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return {**default, **json.load(f)}
        except Exception:
            return default
    return default

CONFIG = load_config()
ADMIN_KEY = CONFIG["admin_key"]
ADMIN_KEY = CONFIG["admin_key"]
HIDDEN_FOLDERS = CONFIG["hidden_folders"]
ALIASES = CONFIG.get("aliases", [])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_ROOT = os.path.join(BASE_DIR, CONFIG["upload_root"])
QR_FILE = os.path.join(UPLOAD_ROOT, "qr.png")
RECYCLE_BIN = os.path.join(UPLOAD_ROOT, ".recycle_bin")

os.makedirs(RECYCLE_BIN, exist_ok=True)
os.makedirs(UPLOAD_ROOT, exist_ok=True)

# Initialize Collaborative Manager
COLLAB_MANAGER = CollaborativeManager(UPLOAD_ROOT)

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception: ip = "127.0.0.1"
    finally: s.close()
    return ip

def generate_qr_file(url, path):
    qr = qrcode.QRCode(version=1, box_size=10, border=2)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    img.save(path)
    print("\nScan to connect to the server:")
    qr.print_ascii()
    print("\n")

def safe_join(base, *paths):
    base = os.path.abspath(base)
    final_path = os.path.normpath(os.path.join(base, *paths))
    if platform.system() == "Windows":
        if not final_path.lower().startswith(base.lower()):
            raise ValueError(f"Unsafe path: {final_path} not in {base}")
    else:
        if not final_path.startswith(base):
            raise ValueError(f"Unsafe path: {final_path} not in {base}")
    return final_path

class FileServerHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[{time.strftime('%H:%M:%S')}] {format % args}")
        sys.stdout.flush()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = unquote(parsed.path)
        self.log_message("GET: %s", path)

        if path.startswith("/api/"):
            if path == "/api/list": api_handlers.handle_list(self, parsed, UPLOAD_ROOT, ADMIN_KEY, HIDDEN_FOLDERS, safe_join)
            elif path == "/api/zip": api_handlers.handle_zip(self, parsed, UPLOAD_ROOT, safe_join)
            elif path == "/api/search": api_handlers.handle_search(self, parsed, UPLOAD_ROOT, HIDDEN_FOLDERS)
            elif path == "/api/sysinfo": api_handlers.handle_sysinfo(self, UPLOAD_ROOT)
            elif path == "/api/all_folders": api_handlers.handle_all_folders(self, UPLOAD_ROOT, HIDDEN_FOLDERS)
            elif path == "/api/recycle_bin": api_handlers.handle_recycle_bin_list(self, RECYCLE_BIN)
            elif path == "/api/activity": api_handlers.handle_activity_list(self)
            elif path == "/api/comments": api_handlers.handle_comments(self, parsed)
            elif path == "/api/collaborative/sessions": api_handlers.handle_collaborative_sessions(self, COLLAB_MANAGER)
            else: self.send_error(404, "API not found")
            return

        rel_path = path.lstrip("/")
        if not rel_path: rel_path = "index.html"

        target_root = os.path.join(BASE_DIR, rel_path)
        if os.path.exists(target_root) and os.path.isfile(target_root):
            self.serve_static_file(target_root)
            return

        try:
            target_home = os.path.join(UPLOAD_ROOT, rel_path)
            if os.path.exists(target_home) and os.path.isfile(target_home):
                self.serve_static_file(target_home)
                return
        except Exception: pass

        self.send_error(404, "File not found")

    def serve_static_file(self, file_to_serve):
        stat = os.stat(file_to_serve)
        size = stat.st_size
        content_type, _ = mimetypes.guess_type(file_to_serve)
        content_type = content_type or "application/octet-stream"

        range_header = self.headers.get('Range')
        if range_header:
            match = re.search(r'bytes=(\d+)-(\d*)', range_header)
            if match:
                start = int(match.group(1))
                end = int(match.group(2)) if match.group(2) else size - 1
                if start < size:
                    length = end - start + 1
                    self.send_response(206)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                    self.send_header("Content-Length", str(length))
                    self.send_header("Accept-Ranges", "bytes")
                    self.end_headers()
                    with open(file_to_serve, 'rb') as f:
                        f.seek(start)
                        self.wfile.write(f.read(length))
                    return

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(size))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        with open(file_to_serve, 'rb') as f:
            shutil.copyfileobj(f, self.wfile)

    def do_POST(self):
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/api/upload": api_handlers.handle_upload(self, parsed, UPLOAD_ROOT, safe_join)
            elif parsed.path == "/api/mkdir": api_handlers.handle_mkdir(self, UPLOAD_ROOT, safe_join)
            elif parsed.path == "/api/delete": api_handlers.handle_delete(self, UPLOAD_ROOT, RECYCLE_BIN, safe_join)
            elif parsed.path == "/api/rename": api_handlers.handle_rename(self, UPLOAD_ROOT, safe_join)
            elif parsed.path == "/api/save_json": api_handlers.handle_save_json(self, UPLOAD_ROOT, safe_join)
            elif parsed.path == "/api/batch_delete": api_handlers.handle_batch_delete(self, UPLOAD_ROOT, RECYCLE_BIN, safe_join)
            elif parsed.path == "/api/zip": api_handlers.handle_zip(self, parsed, UPLOAD_ROOT, safe_join)
            elif parsed.path == "/api/restore": api_handlers.handle_restore(self, UPLOAD_ROOT, RECYCLE_BIN, safe_join)
            elif parsed.path == "/api/purge": api_handlers.handle_purge(self, RECYCLE_BIN)
            elif parsed.path == "/api/comments": api_handlers.handle_comments(self, parsed)
            elif parsed.path == "/api/collaborative/save": api_handlers.handle_collaborative_save(self, COLLAB_MANAGER)
            else: self.send_error(404)
        except Exception as e:
            print(f"[{time.strftime('%H:%M:%S')}] POST Error: {e}")
            self.send_error(500, f"Internal Server Error: {e}")

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer): pass

if __name__ == "__main__":
    HOST, PORT = "0.0.0.0", CONFIG["port"]
    server = ThreadedHTTPServer((HOST, PORT), FileServerHandler)
    url = f"http://{get_local_ip()}:{PORT}"
    generate_qr_file(url, os.path.join(UPLOAD_ROOT, "qr.png"))
    print(f"[{time.strftime('%H:%M:%S')}] Server started at {url}")
    sys.stdout.flush()
    print(f"[{time.strftime('%H:%M:%S')}] Server started at {url}")
    
    # Start mDNS Service
    dns_service = None
    if DNSService and ALIASES:
        try:
            dns_service = DNSService(PORT, ALIASES)
            dns_service.register()
        except Exception as e:
            print(f"[{time.strftime('%H:%M:%S')}] Failed to start DNS service: {e}")

    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if dns_service:
            dns_service.unregister()
        print(f"\n[{time.strftime('%H:%M:%S')}] Server stopped.")
