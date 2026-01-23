import socket
import logging
from zeroconf import Zeroconf, ServiceInfo

class DNSService:
    def __init__(self, port, aliases=None):
        self.port = port
        self.aliases = aliases or []
        self.zeroconf = Zeroconf()
        self.infos = []
        self.logger = logging.getLogger("DNSService")

    def register(self):
        """Register all aliases as mDNS services."""
        ip_address = self.get_local_ip()
        try:
            # We need the IP in bytes for zeroconf
            ip_bytes = socket.inet_aton(ip_address)
        except Exception as e:
            print(f"Failed to convert IP {ip_address}: {e}")
            return

        for alias in self.aliases:
            # Service type is _http._tcp.local.
            # The instance name needs to be unique on the network, usually.
            # We'll use the alias as the instance name.
            name = f"{alias}._http._tcp.local."
            
            # Host must be fully qualified name, e.g. alias.local.
            server_name = f"{alias}.local."
            
            info = ServiceInfo(
                "_http._tcp.local.",
                name,
                addresses=[ip_bytes],
                port=self.port,
                server=server_name,
                properties={'desc': 'SajiloCloud File Server'}
            )
            
            try:
                self.zeroconf.register_service(info)
                self.infos.append(info)
                print(f"[DNSService] Registered http://{alias}.local:{self.port}")
            except Exception as e:
                print(f"[DNSService] Failed to register {alias}: {e}")

    def unregister(self):
        """Unregister all services."""
        for info in self.infos:
            try:
                self.zeroconf.unregister_service(info)
            except Exception:
                pass
        self.zeroconf.close()
        print("[DNSService] Unregistered all services")

    def get_local_ip(self):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
        except Exception: 
            ip = "127.0.0.1"
        finally: 
            s.close()
        return ip

if __name__ == "__main__":
    # Test
    service = DNSService(4142, ["test-server", "sajilo"])
    service.register()
    import time
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        service.unregister()
