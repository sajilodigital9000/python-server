"""
Collaborative Data Manager
Handles persistence for collaborative canvas and scratchpad sessions
"""

import os
import json
import time
import base64
from datetime import datetime

class CollaborativeManager:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        self.collab_dir = os.path.join(base_dir, ".collaborative")
        self.canvas_dir = os.path.join(self.collab_dir, "canvases")
        self.scratchpad_dir = os.path.join(self.collab_dir, "scratchpads")
        
        # Create directories if they don't exist
        os.makedirs(self.canvas_dir, exist_ok=True)
        os.makedirs(self.scratchpad_dir, exist_ok=True)
        
        # In-memory session tracking
        self.active_sessions = {
            "canvas": {},
            "scratchpad": {}
        }
    
    # ===== Canvas Methods =====
    
    def save_canvas(self, canvas_id, data):
        """
        Save canvas state to disk
        Args:
            canvas_id: Unique identifier for the canvas
            data: Dictionary containing canvas state
                - strokes: List of stroke objects
                - metadata: Canvas metadata (size, created, modified)
                - image_data: Base64 encoded PNG (optional)
        Returns:
            dict: Success status and file path
        """
        try:
            canvas_file = os.path.join(self.canvas_dir, f"{canvas_id}.json")
            
            # Add timestamp
            data["last_modified"] = datetime.now().isoformat()
            
            # Save JSON data
            with open(canvas_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            
            # Save PNG if image_data provided
            if "image_data" in data and data["image_data"]:
                png_file = os.path.join(self.canvas_dir, f"{canvas_id}.png")
                # Remove data URL prefix if present
                img_data = data["image_data"]
                if "," in img_data:
                    img_data = img_data.split(",")[1]
                
                with open(png_file, 'wb') as f:
                    f.write(base64.b64decode(img_data))
            
            return {
                "success": True,
                "path": canvas_file,
                "timestamp": data["last_modified"]
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def load_canvas(self, canvas_id):
        """
        Load canvas state from disk
        Args:
            canvas_id: Unique identifier for the canvas
        Returns:
            dict: Canvas data or None if not found
        """
        try:
            canvas_file = os.path.join(self.canvas_dir, f"{canvas_id}.json")
            
            if not os.path.exists(canvas_file):
                return None
            
            with open(canvas_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Check if PNG exists
            png_file = os.path.join(self.canvas_dir, f"{canvas_id}.png")
            if os.path.exists(png_file):
                data["has_image"] = True
                data["image_path"] = png_file
            
            return data
        except Exception as e:
            print(f"Error loading canvas {canvas_id}: {e}")
            return None
    
    def list_canvases(self):
        """
        List all available canvas sessions
        Returns:
            list: List of canvas metadata
        """
        canvases = []
        try:
            for filename in os.listdir(self.canvas_dir):
                if filename.endswith('.json'):
                    canvas_id = filename[:-5]  # Remove .json
                    data = self.load_canvas(canvas_id)
                    if data:
                        canvases.append({
                            "id": canvas_id,
                            "last_modified": data.get("last_modified", ""),
                            "stroke_count": len(data.get("strokes", [])),
                            "has_image": data.get("has_image", False)
                        })
        except Exception as e:
            print(f"Error listing canvases: {e}")
        
        return sorted(canvases, key=lambda x: x["last_modified"], reverse=True)
    
    def delete_canvas(self, canvas_id):
        """Delete a canvas and its associated files"""
        try:
            canvas_file = os.path.join(self.canvas_dir, f"{canvas_id}.json")
            png_file = os.path.join(self.canvas_dir, f"{canvas_id}.png")
            
            if os.path.exists(canvas_file):
                os.remove(canvas_file)
            if os.path.exists(png_file):
                os.remove(png_file)
            
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    # ===== Scratchpad Methods =====
    
    def save_scratchpad(self, doc_id, content, metadata=None):
        """
        Save scratchpad content to disk
        Args:
            doc_id: Unique identifier for the document
            content: Text content (string)
            metadata: Optional metadata dict
        Returns:
            dict: Success status and file path
        """
        try:
            doc_file = os.path.join(self.scratchpad_dir, f"{doc_id}.md")
            
            # Save content
            with open(doc_file, 'w', encoding='utf-8') as f:
                f.write(content)
            
            # Save metadata separately
            if metadata:
                meta_file = os.path.join(self.scratchpad_dir, f"{doc_id}.meta.json")
                metadata["last_modified"] = datetime.now().isoformat()
                with open(meta_file, 'w', encoding='utf-8') as f:
                    json.dump(metadata, f, indent=2)
            
            return {
                "success": True,
                "path": doc_file,
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def load_scratchpad(self, doc_id):
        """
        Load scratchpad content from disk
        Args:
            doc_id: Unique identifier for the document
        Returns:
            dict: Document data with content and metadata
        """
        try:
            doc_file = os.path.join(self.scratchpad_dir, f"{doc_id}.md")
            
            if not os.path.exists(doc_file):
                return None
            
            # Load content
            with open(doc_file, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Load metadata if exists
            meta_file = os.path.join(self.scratchpad_dir, f"{doc_id}.meta.json")
            metadata = {}
            if os.path.exists(meta_file):
                with open(meta_file, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
            
            return {
                "content": content,
                "metadata": metadata,
                "last_modified": metadata.get("last_modified", "")
            }
        except Exception as e:
            print(f"Error loading scratchpad {doc_id}: {e}")
            return None
    
    def list_scratchpads(self):
        """
        List all available scratchpad documents
        Returns:
            list: List of document metadata
        """
        docs = []
        try:
            for filename in os.listdir(self.scratchpad_dir):
                if filename.endswith('.md'):
                    doc_id = filename[:-3]  # Remove .md
                    data = self.load_scratchpad(doc_id)
                    if data:
                        docs.append({
                            "id": doc_id,
                            "last_modified": data.get("last_modified", ""),
                            "content_length": len(data.get("content", "")),
                            "metadata": data.get("metadata", {})
                        })
        except Exception as e:
            print(f"Error listing scratchpads: {e}")
        
        return sorted(docs, key=lambda x: x["last_modified"], reverse=True)
    
    def delete_scratchpad(self, doc_id):
        """Delete a scratchpad document and its metadata"""
        try:
            doc_file = os.path.join(self.scratchpad_dir, f"{doc_id}.md")
            meta_file = os.path.join(self.scratchpad_dir, f"{doc_id}.meta.json")
            
            if os.path.exists(doc_file):
                os.remove(doc_file)
            if os.path.exists(meta_file):
                os.remove(meta_file)
            
            return {"success": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    # ===== Session Management =====
    
    def get_active_sessions(self):
        """Get all active collaborative sessions"""
        return {
            "canvases": self.list_canvases(),
            "scratchpads": self.list_scratchpads()
        }
    
    def create_new_session(self, session_type, name=None):
        """
        Create a new collaborative session
        Args:
            session_type: 'canvas' or 'scratchpad'
            name: Optional custom name
        Returns:
            str: New session ID
        """
        timestamp = int(time.time() * 1000)
        if name:
            session_id = f"{name}_{timestamp}"
        else:
            session_id = f"{session_type}_{timestamp}"
        
        # Initialize empty session
        if session_type == "canvas":
            self.save_canvas(session_id, {
                "strokes": [],
                "metadata": {
                    "created": datetime.now().isoformat(),
                    "name": name or f"Canvas {timestamp}"
                }
            })
        elif session_type == "scratchpad":
            self.save_scratchpad(session_id, "", {
                "created": datetime.now().isoformat(),
                "name": name or f"Scratchpad {timestamp}"
            })
        
        return session_id
