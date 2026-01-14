import os
import json
import time
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
LOG_FILE = os.path.join(DATA_DIR, "activity_log.json")

def ensure_log_file():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    if not os.path.exists(LOG_FILE):
        with open(LOG_FILE, "w") as f:
            json.dump([], f)

def log_activity(action, filename, ip="Unknown"):
    try:
        ensure_log_file()
        
        entry = {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "action": action,
            "filename": filename,
            "ip": ip,
            "user": "Admin" # Placeholder for future user accounts
        }
        
        with open(LOG_FILE, "r+") as f:
            try:
                logs = json.load(f)
            except json.JSONDecodeError:
                logs = []
                
            logs.insert(0, entry) # Prepend new log
            
            # Keep only last 100 logs
            if len(logs) > 100:
                logs = logs[:100]
                
            f.seek(0)
            f.truncate()
            json.dump(logs, f, indent=2)
            
    except Exception as e:
        print(f"Error logging activity: {e}")

def get_recent_activity(limit=50):
    try:
        if not os.path.exists(LOG_FILE):
            return []
        with open(LOG_FILE, "r") as f:
            logs = json.load(f)
            return logs[:limit]
    except Exception:
        return []
