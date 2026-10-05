"""Exercise DNS adoption with the pinned provider against a non-Enterprise API."""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

tofu_root = Path(__file__).resolve().parents[1]
settings = {
    "flatten_all_cnames": False,
    "multi_provider": False,
    "internal_dns": {},
    "nameservers": {"type": "cloudflare.standard"},
    "ns_ttl": 86400,
    "secondary_overrides": False,
    "soa": {
        "expire": 604800, "min_ttl": 1800, "refresh": 10000, "retry": 2400,
        "rname": "dns.cloudflare.com", "ttl": 3600,
    },
    "zone_mode": "standard",
}
requests = []


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def respond(self, status, body):
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        assert self.path == "/zones/test-zone/dns_settings", self.path
        self.respond(200, {"success": True, "errors": [], "messages": [], "result": settings})

    def do_PATCH(self):
        assert self.path == "/zones/test-zone/dns_settings", self.path
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        requests.append(body)
        if "soa" in body or "ns_ttl" in body:
            self.respond(400, {"success": False, "result": None, "messages": [], "errors": [
                {"code": 1003, "message": "Custom SOA/NS TTL settings are unavailable on this account"}
            ]})
        else:
            settings.update(body)
            self.do_GET()


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
try:
    with tempfile.TemporaryDirectory(prefix="workspace-tofu-cloudflare-dns-") as directory:
        root = Path(directory)
        source = (tofu_root / "foundation/main.tf").read_text()
        block = re.search(r'(?ms)^resource "cloudflare_zone_dns_settings" "primary" \{.*?^\}', source).group()
        block = block.replace("cloudflare_zone.primary.id", '"test-zone"')
        config = f'''
terraform {{
  required_providers {{ cloudflare = {{ source = "cloudflare/cloudflare", version = "= 5.26.0" }} }}
}}
provider "cloudflare" {{
  api_token = "test-cloudflare-token-00000000000000000000"
  base_url = "http://127.0.0.1:{server.server_port}/"
}}
module "inventory" {{ source = {json.dumps(str(tofu_root / "modules/inventory"))} }}
locals {{ config = module.inventory.config }}
'''
        (root / "main.tf").write_text(config + block)
        lock = (tofu_root / "foundation/.terraform.lock.hcl").read_text()
        (root / ".terraform.lock.hcl").write_text(re.search(
            r'provider "registry.opentofu.org/cloudflare/cloudflare" \{[^}]+\}', lock
        ).group())

        def run(*args):
            result = subprocess.run(
                [shutil.which("tofu"), "-chdir=" + str(root), *args],
                env=os.environ, capture_output=True, text=True,
            )
            if result.returncode:
                raise RuntimeError(result.stdout[-4000:] + result.stderr[-4000:])

        run("init", "-input=false", "-lockfile=readonly")
        run("plan", "-input=false", "-out=adopt.tfplan")
        run("apply", "-input=false", "adopt.tfplan")
        assert len(requests) == 1, requests
        assert all("soa" not in body and "ns_ttl" not in body for body in requests), requests
        run("plan", "-input=false", "-detailed-exitcode")
        assert len(requests) == 1, requests
        settings["flatten_all_cnames"] = True
        run("plan", "-input=false", "-out=repair.tfplan")
        run("apply", "-input=false", "repair.tfplan")
        assert len(requests) == 2 and not settings["flatten_all_cnames"], requests
        assert all("soa" not in body and "ns_ttl" not in body for body in requests), requests
        run("plan", "-input=false", "-detailed-exitcode")
        print("PASS: non-Enterprise DNS adoption and drift repair omit SOA/NS TTL overrides; stable plans")
finally:
    server.shutdown()
