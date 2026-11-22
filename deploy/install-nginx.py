#!/usr/bin/env python3
"""Add Word Ladder to the existing nikkeyl.com HTTPS virtual host."""
import os
import shutil
import subprocess
from pathlib import Path
from tempfile import NamedTemporaryFile
from time import time

site = Path("/etc/nginx/sites-enabled/nikkeyl.com.conf").resolve(strict=True)
snippet = (Path(__file__).parent / "nginx-location.conf").read_text()
original = site.read_text()
marker = "location ^~ /word-ladder-api/"
if marker in original:
    print("Word Ladder route is already installed.")
    raise SystemExit(0)
if "/word-ladder-api/" in original:
    raise SystemExit("A route already uses /word-ladder-api/. No configuration was changed.")

anchor = "    location / {"
if original.count(anchor) != 1 or "listen 443 ssl;" not in original.split(anchor)[0]:
    raise SystemExit("Could not identify the HTTPS virtual host. No configuration was changed.")

# The temporary file is outside sites-enabled so Nginx never loads it separately.
def install(contents):
    with NamedTemporaryFile(dir="/etc/nginx", delete=False) as staged:
        path = Path(staged.name)
        staged.write(contents.encode())
    try:
        shutil.copystat(site, path)
        os.replace(path, site)
    finally:
        path.unlink(missing_ok=True)


backup = Path("/var/backups") / f"nikkeyl-nginx-before-word-ladder-{int(time())}.conf"
shutil.copy2(site, backup)
updated = original.replace(anchor, "".join("    " + line + "\n"
                                           for line in snippet.splitlines()) + "\n" + anchor)
install(updated)
try:
    subprocess.run(["nginx", "-t"], check=True)
    subprocess.run(["systemctl", "reload", "nginx"], check=True)
except BaseException:
    install(original)
    subprocess.run(["nginx", "-t"], check=False)
    raise
print(f"Word Ladder route installed. Backup: {backup}")
