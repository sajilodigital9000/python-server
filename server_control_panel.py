import tkinter as tk
from tkinter import ttk, messagebox
import subprocess
import os
import sys
import threading
import time
import webbrowser
import json
import socket
import signal

# Configuration
CONFIG_FILE = "config.json"
PID_FILE = "server_state.json"
SERVER_SCRIPT = "server.py"
WEBSOCKET_SCRIPT = "websocket_server.py"

class ServerControlPanel:
    def __init__(self, root):
        self.root = root
        self.root.title("SajiloCloud Server Manager")
        self.root.geometry("500x450")
        self.root.resizable(False, False)
        
        # Style
        self.style = ttk.Style()
        self.style.theme_use('clam')
        
        # Variables
        self.server_pids = {"http": None, "ws": None}
        self.status_var = tk.StringVar(value="CHECKING...")
        self.port_var = tk.StringVar(value="Port: ???")
        self.url_var = tk.StringVar(value="http://localhost:???")
        self.url_var = tk.StringVar(value="http://localhost:???")
        self.url_name_var = tk.StringVar(value="")
        self.alias_var = tk.StringVar(value="")
        
        self.load_config()
        self.setup_ui()
        
        # Check existing state on load
        self.check_server_state()
        
    def load_config(self):
        self.port = 4142 # Default
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r') as f:
                    data = json.load(f)
                    self.port = data.get("port", 4142)
            except:
                pass
        self.port_var.set(f"Port: {self.port}")
        self.update_url()

    def get_local_ip(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
        except Exception: ip = "127.0.0.1"
        finally: s.close()
        return ip

    def update_url(self):
        ip = self.get_local_ip()
        hostname = socket.gethostname()
        self.url_var.set(f"http://{ip}:{self.port}")
        self.url_name_var.set(f"http://{hostname}:{self.port}")
        
        # Check for aliases in config
        aliases = []
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, 'r') as f:
                    data = json.load(f)
                    aliases = data.get("aliases", [])
            except: pass
            
        if aliases:
            alias_str = " | ".join([f"http://{a}.local:{self.port}" for a in aliases])
            self.alias_var.set(alias_str)
        else:
            self.alias_var.set("")

    def setup_ui(self):
        # Header
        header_frame = tk.Frame(self.root, bg="#333", height=80)
        header_frame.pack(fill=tk.X)
        header_frame.pack_propagate(False)
        
        title = tk.Label(header_frame, text="SajiloCloud Server", font=("Segoe UI", 20, "bold"), fg="white", bg="#333")
        title.pack(pady=20)
        
        # Status Section
        status_frame = tk.Frame(self.root, pady=20)
        status_frame.pack(fill=tk.X)
        
        lbl_status = tk.Label(status_frame, textvariable=self.status_var, font=("Segoe UI", 16, "bold"), fg="gray")
        lbl_status.pack()
        self.lbl_status_widget = lbl_status
        
        # IP Link
        lbl_url = tk.Label(status_frame, textvariable=self.url_var, font=("Segoe UI", 10, "underline"), fg="blue", cursor="hand2")
        lbl_url.pack(pady=(5, 0))
        lbl_url.bind("<Button-1>", lambda e: self.open_browser(self.url_var.get()))
        
        # Hostname Link
        lbl_name_url = tk.Label(status_frame, textvariable=self.url_name_var, font=("Segoe UI", 10, "underline"), fg="blue", cursor="hand2")
        lbl_name_url.pack(pady=(2, 5))
        lbl_name_url.bind("<Button-1>", lambda e: self.open_browser(self.url_name_var.get()))
        
        # Alias Link
        lbl_alias = tk.Label(status_frame, textvariable=self.alias_var, font=("Segoe UI", 10, "italic"), fg="#0066cc", cursor="hand2")
        lbl_alias.pack(pady=(2, 5))
        lbl_alias.bind("<Button-1>", lambda e: self.open_browser(self.alias_var.get().split(" | ")[0])) # Opens first alias
        
        # Controls
        control_frame = tk.Frame(self.root, pady=10)
        control_frame.pack(fill=tk.X)
        
        self.btn_start = tk.Button(control_frame, text="START SERVER", font=("Segoe UI", 12, "bold"), 
                                   bg="#28a745", fg="white", width=20, height=2, command=self.start_server, relief="flat")
        self.btn_start.pack(pady=5)

        self.btn_stop = tk.Button(control_frame, text="STOP SERVER", font=("Segoe UI", 12, "bold"), 
                                  bg="#dc3545", fg="white", width=20, height=2, command=self.stop_server, relief="flat", state=tk.DISABLED)
        self.btn_stop.pack(pady=5)
        
        # Logs
        log_frame = tk.LabelFrame(self.root, text="Server Logs", padx=5, pady=5)
        log_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        self.log_text = tk.Text(log_frame, height=8, font=("Consolas", 9), state=tk.DISABLED, bg="#f8f9fa")
        self.log_text.pack(fill=tk.BOTH, expand=True)
        self.log("Ready.")

    def log(self, message):
        self.log_text.config(state=tk.NORMAL)
        self.log_text.insert(tk.END, f"[{time.strftime('%H:%M:%S')}] {message}\n")
        self.log_text.see(tk.END)
        self.log_text.config(state=tk.DISABLED)

    def check_server_state(self):
        # 1. Check if PID file exists
        if not os.path.exists(PID_FILE):
            self.set_offline()
            return

        # 2. Load PIDs
        try:
            with open(PID_FILE, 'r') as f:
                pids = json.load(f)
                self.server_pids = pids
        except:
            self.set_offline()
            return

        # 3. Verify if processes are actually running
        # We use tasklist to check if the PID exists
        running_cnt = 0
        for name, pid in self.server_pids.items():
            if pid and self.is_process_running(pid):
                running_cnt += 1
        
        if running_cnt > 0:
            self.set_online()
            self.log("Server detected running in background.")
        else:
            self.set_offline()

    def is_process_running(self, pid):
        try:
            # Windows command to check if PID exists. 
            cmd = f'tasklist /FI "PID eq {pid}"'
            output = subprocess.check_output(cmd, creationflags=subprocess.CREATE_NO_WINDOW).decode()
            # If PID exists, tasklist usually outputs the image name. If not, it says "No tasks are running..."
            return str(pid) in output
        except:
            return False

    def save_pids(self):
        try:
            with open(PID_FILE, 'w') as f:
                json.dump(self.server_pids, f)
        except Exception as e:
            self.log(f"Error saving state: {e}")

    def start_server(self):
        self.log("Starting servers...")
        
        try:
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            
            # WebSocket Server
            ws_proc = subprocess.Popen(
                ["python", WEBSOCKET_SCRIPT],
                cwd=os.getcwd(),
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            self.server_pids["ws"] = ws_proc.pid
            
            # small delay
            time.sleep(1)
            
            # HTTP Server
            http_proc = subprocess.Popen(
                ["python", SERVER_SCRIPT],
                cwd=os.getcwd(),
                creationflags=subprocess.CREATE_NO_WINDOW
            )
            self.server_pids["http"] = http_proc.pid
            
            self.save_pids()
            self.set_online()
            self.log("Servers started successfully.")
            self.update_url()
            
        except Exception as e:
            self.log(f"Error starting servers: {e}")
            self.stop_server()

    def stop_server(self):
        self.log("Stopping servers...")
        
        for name, pid in self.server_pids.items():
            if pid:
                try:
                    # Force kill the process tree (important for python servers)
                    subprocess.call(['taskkill', '/F', '/T', '/PID', str(pid)], creationflags=subprocess.CREATE_NO_WINDOW)
                    self.log(f"Stopped {name} server (PID {pid})")
                except Exception as e:
                    self.log(f"Failed to stop {name}: {e}")
        
        self.server_pids = {"http": None, "ws": None}
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
            
        self.set_offline()

    def set_online(self):
        self.status_var.set("ONLINE")
        self.lbl_status_widget.config(fg="green")
        self.btn_start.config(state=tk.DISABLED, bg="#cccccc")
        self.btn_stop.config(state=tk.NORMAL, bg="#dc3545")

    def set_offline(self):
        self.status_var.set("OFFLINE")
        self.lbl_status_widget.config(fg="red")
        self.btn_start.config(state=tk.NORMAL, bg="#28a745")
        self.btn_stop.config(state=tk.DISABLED, bg="#cccccc")

    def open_browser(self, url=None):
        target = url if url else self.url_var.get()
        webbrowser.open(target)

    def on_close(self):
        # Just close the window, leave servers running!
        self.root.destroy()

if __name__ == "__main__":
    root = tk.Tk()
    app = ServerControlPanel(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()
