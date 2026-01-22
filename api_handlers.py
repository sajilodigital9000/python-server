import os
import json
import time
import shutil
import platform
import zipfile
import cgi
import psutil
from urllib.parse import parse_qs
import audit_logger

def handle_list(handler, parsed, UPLOAD_ROOT, ADMIN_KEY, HIDDEN_FOLDERS, safe_join):
    query = parse_qs(parsed.query)
    rel_path = query.get("path", [""])[0]
    is_admin = (query.get("show_hidden", [""])[0] == ADMIN_KEY)
    abs_path = safe_join(UPLOAD_ROOT, rel_path)
    if not (os.path.exists(abs_path) and os.path.isdir(abs_path)):
        handler.send_error(404)
        return

    items = []
    try:
        with os.scandir(abs_path) as it:
            for entry in it:
                if not is_admin and entry.name in HIDDEN_FOLDERS:
                    continue
                try:
                    s_size = entry.stat().st_size if entry.is_file() else 0
                except OSError:
                    s_size = 0
                items.append({
                    "name": entry.name,
                    "is_dir": entry.is_dir(),
                    "size": s_size
                })
    except OSError:
        handler.send_error(500, "Unable to scan directory")
        return

    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    data = json.dumps({"path": rel_path, "items": items}).encode()
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(data)

def handle_all_folders(handler, UPLOAD_ROOT, HIDDEN_FOLDERS):
    folders = []
    for root, dirs, files in os.walk(UPLOAD_ROOT):
        dirs[:] = [d for d in dirs if d not in HIDDEN_FOLDERS]
        rel_dir = os.path.relpath(root, UPLOAD_ROOT)
        folders.append("" if rel_dir == "." else rel_dir.replace("\\", "/"))
    folders.sort()
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(folders).encode())

def handle_search(handler, parsed, UPLOAD_ROOT, HIDDEN_FOLDERS):
    q = parse_qs(parsed.query).get("q", [""])[0].lower()
    results = []
    for root, dirs, files in os.walk(UPLOAD_ROOT):
        dirs[:] = [d for d in dirs if d not in HIDDEN_FOLDERS]
        for name in dirs + files:
            if q in name.lower():
                rel_dir = os.path.relpath(root, UPLOAD_ROOT)
                results.append({"name": name, "path": "" if rel_dir == "." else rel_dir, "is_dir": os.path.isdir(os.path.join(root, name))})
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(results).encode())

def handle_sysinfo(handler, UPLOAD_ROOT):
    total, used, free = shutil.disk_usage(UPLOAD_ROOT)
    cpu_usage = psutil.cpu_percent(interval=None)
    ram = psutil.virtual_memory()
    
    info = {
        "disk": {"total": total, "used": used, "free": free, "percent": round((used / total) * 100, 1)},
        "cpu": cpu_usage,
        "ram": ram.percent,
        "os": platform.system(),
        "time": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(info).encode())

def handle_zip(handler, parsed, UPLOAD_ROOT, safe_join):
    items_to_zip = []
    filename = "archive.zip"

    if handler.command == "POST":
        length = int(handler.headers.get("Content-Length", 0))
        try:
            data = json.loads(handler.rfile.read(length))
            items_to_zip = data.get("items", [])
            filename = data.get("filename", "archive.zip")
        except Exception:
            handler.send_error(400, "Invalid JSON")
            return
    else:
        rel_path = parse_qs(parsed.query).get("path", [""])[0]
        items_to_zip = [{"path": os.path.dirname(rel_path), "name": os.path.basename(rel_path)}]
        filename = f"{os.path.basename(rel_path) or 'Home'}.zip"

    if not items_to_zip:
        handler.send_error(400, "No items to zip")
        return

    handler.send_response(200)
    handler.send_header("Content-Type", "application/zip")
    handler.send_header("Content-Disposition", f'attachment; filename="{filename}"')
    handler.end_headers()

    with zipfile.ZipFile(handler.wfile, 'w', zipfile.ZIP_DEFLATED) as zf:
        for item in items_to_zip:
            abs_path = safe_join(UPLOAD_ROOT, item.get("path", ""), item.get("name", ""))
            if not os.path.exists(abs_path): continue

            if os.path.isfile(abs_path):
                zf.write(abs_path, item.get("name"))
            else:
                for root, _, files in os.walk(abs_path):
                    for file in files:
                        full = os.path.join(root, file)
                        arcname = os.path.relpath(full, os.path.join(UPLOAD_ROOT, item.get("path", "")))
                        zf.write(full, arcname)

def handle_save_json(handler, UPLOAD_ROOT, safe_join):
    data = json.loads(handler.rfile.read(int(handler.headers.get("Content-Length", 0))))
    target = safe_join(UPLOAD_ROOT, data.get("filename", ""))
    with open(target, "w", encoding="utf-8") as f:
        if data.get("raw", False): f.write(data.get("content"))
        else: json.dump(data.get("content"), f, indent=4)
    handler.send_response(200)
    handler.end_headers()
    handler.wfile.write(b'{"status":"ok"}')

def handle_batch_delete(handler, UPLOAD_ROOT, RECYCLE_BIN, safe_join):
    data = json.loads(handler.rfile.read(int(handler.headers.get("Content-Length", 0))))
    for item in data.get("items", []):
        target = safe_join(UPLOAD_ROOT, item["path"], item["name"])
        dest = os.path.join(RECYCLE_BIN, time.strftime("%Y%m%d_%H%M%S_") + item["name"])
        if os.path.exists(target): shutil.move(target, dest)
    audit_logger.log_activity("Batch Delete", f"{len(data.get('items', []))} items", handler.client_address[0])
    handler.send_response(200)
    handler.end_headers()
    handler.wfile.write(b"OK")

def handle_upload(handler, parsed, UPLOAD_ROOT, safe_join):
    target_dir = safe_join(UPLOAD_ROOT, parse_qs(parsed.query).get("path", [""])[0])
    os.makedirs(target_dir, exist_ok=True)
    form = cgi.FieldStorage(fp=handler.rfile, headers=handler.headers, environ={"REQUEST_METHOD": "POST","CONTENT_TYPE": handler.headers["Content-Type"]})
    files = form["file"] if isinstance(form["file"], list) else [form["file"]]
    saved = []
    for item in files:
        if not item.filename: continue
        dest = os.path.join(target_dir, os.path.basename(item.filename))
        if os.path.exists(dest):
            name, ext = os.path.splitext(dest)
            dest = f"{name}_{time.strftime('%Y%m%d_%H%M%S')}{ext}"
        with open(dest, "wb") as f:
            while chunk := item.file.read(8192): f.write(chunk)
        saved.append(os.path.basename(dest))
    audit_logger.log_activity("Upload", f"{len(saved)} files to {os.path.basename(target_dir) or 'Root'}", handler.client_address[0])
    handler.send_response(200)
    handler.send_header("Content-Type","application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps({"status":"ok","saved":saved}).encode())

def handle_mkdir(handler, UPLOAD_ROOT, safe_join):
    data = json.loads(handler.rfile.read(int(handler.headers.get("Content-Length",0))))
    os.makedirs(safe_join(UPLOAD_ROOT, data.get("path",""), data.get("folder","")), exist_ok=False)
    handler.send_response(200)
    handler.end_headers()

def handle_delete(handler, UPLOAD_ROOT, RECYCLE_BIN, safe_join):
    data = json.loads(handler.rfile.read(int(handler.headers.get("Content-Length",0))))
    target = safe_join(UPLOAD_ROOT, data.get("path",""), data.get("name",""))
    if os.path.exists(target):
        shutil.move(target, os.path.join(RECYCLE_BIN, time.strftime("%Y%m%d_%H%M%S_") + data.get("name","")))
        audit_logger.log_activity("Delete", data.get("name",""), handler.client_address[0])
        handler.send_response(200)
        handler.end_headers()
    else: handler.send_error(404)

def handle_rename(handler, UPLOAD_ROOT, safe_join):
    data = json.loads(handler.rfile.read(int(handler.headers.get("Content-Length",0))))
    old_path = safe_join(UPLOAD_ROOT, data.get("path", ""), data.get("old_name", ""))
    new_target = data.get("new_name", "")
    new_path = safe_join(UPLOAD_ROOT, new_target) if ("/" in new_target or new_target == "") else safe_join(UPLOAD_ROOT, data.get("path", ""), new_target)
    os.makedirs(os.path.dirname(new_path), exist_ok=True)
    os.rename(old_path, new_path)
    audit_logger.log_activity("Rename", f"{data.get('old_name','')} -> {new_target}", handler.client_address[0])
    handler.send_response(200)
    handler.end_headers()

def handle_recycle_bin_list(handler, RECYCLE_BIN):
    items = []
    if os.path.exists(RECYCLE_BIN):
        for name in os.listdir(RECYCLE_BIN):
            full = os.path.join(RECYCLE_BIN, name)
            items.append({
                "name": name,
                "is_dir": os.path.isdir(full),
                "size": os.stat(full).st_size if os.path.isfile(full) else 0,
                "mtime": os.path.getmtime(full)
            })
    items.sort(key=lambda x: x["mtime"], reverse=True)
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(items).encode())

def handle_restore(handler, UPLOAD_ROOT, RECYCLE_BIN, safe_join):
    data = json.loads(handler.rfile.read(int(handler.headers.get("Content-Length", 0))))
    name = data.get("name")
    target = os.path.join(RECYCLE_BIN, name)
    # Strip the timestamp prefix (YYYYMMDD_HHMMSS_)
    original_name = name[16:] if len(name) > 16 and name[8] == "_" else name
    dest = safe_join(UPLOAD_ROOT, original_name)
    if os.path.exists(target):
        shutil.move(target, dest)
        audit_logger.log_activity("Restore", original_name, handler.client_address[0])
        handler.send_response(200)
        handler.end_headers()
        handler.wfile.write(b"OK")
    else: handler.send_error(404)

def handle_purge(handler, RECYCLE_BIN):
    data = json.loads(handler.rfile.read(int(handler.headers.get("Content-Length", 0))))
    name = data.get("name")
    target = os.path.join(RECYCLE_BIN, name)
    if os.path.exists(target):
        if os.path.isdir(target): shutil.rmtree(target)
        else: os.remove(target)
        handler.send_response(200)
        handler.end_headers()
        handler.wfile.write(b"OK")
    else: handler.send_error(404)

def handle_activity_list(handler):
    logs = audit_logger.get_recent_activity(50)
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(logs).encode())

def handle_comments(handler, parsed):
    DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    os.makedirs(DATA_DIR, exist_ok=True)
    COMMENTS_FILE = os.path.join(DATA_DIR, "comments.json")
    
    if handler.command == "GET":
        target = parse_qs(parsed.query).get("path", [""])[0]
        comments = {}
        if os.path.exists(COMMENTS_FILE):
            try:
                with open(COMMENTS_FILE, "r") as f:
                    comments = json.load(f)
            except: pass
        
        file_comments = comments.get(target, [])
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json")
        handler.end_headers()
        handler.wfile.write(json.dumps(file_comments).encode())
        
    elif handler.command == "POST":
        length = int(handler.headers.get("Content-Length", 0))
        data = json.loads(handler.rfile.read(length))
        target = data.get("path")
        text = data.get("text")
        author = data.get("author", "Admin")
        
        if not target or not text:
             handler.send_error(400)
             return

        comments = {}
        if os.path.exists(COMMENTS_FILE):
             with open(COMMENTS_FILE, "r") as f:
                 try: comments = json.load(f)
                 except: pass
        
        if target not in comments: comments[target] = []
        comments[target].append({
            "text": text,
            "author": author,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        })
        
        with open(COMMENTS_FILE, "w") as f:
            json.dump(comments, f, indent=2)
            
        handler.send_response(200)
        handler.end_headers()
        handler.wfile.write(b"OK")

# ===== Collaborative API Handlers =====

def handle_collaborative_sessions(handler, collab_manager):
    """List all available collaborative sessions"""
    sessions = collab_manager.get_active_sessions()
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(sessions).encode())

def handle_collaborative_save(handler, collab_manager):
    """Manually save collaborative session"""
    data = json.loads(handler.rfile.read(int(handler.headers.get("Content-Length", 0))))
    session_type = data.get("type")  # "canvas" or "scratchpad"
    session_id = data.get("id")
    
    if session_type == "canvas":
        result = collab_manager.save_canvas(session_id, data.get("data", {}))
    elif session_type == "scratchpad":
        content = data.get("content", "")
        metadata = data.get("metadata", {})
        result = collab_manager.save_scratchpad(session_id, content, metadata)
    else:
        handler.send_error(400, "Invalid session type")
        return
    
    handler.send_response(200)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(json.dumps(result).encode())
