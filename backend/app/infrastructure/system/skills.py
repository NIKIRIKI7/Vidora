"""Инфраструктурный модуль загрузки и парсинга Remotion Skills из GitHub."""

import io
import re
import tarfile
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple

REPO_TARBALL = "https://codeload.github.com/remotion-dev/skills/tar.gz/refs/heads/main"
MAX_FILE_CHARS = 300_000


def _fetch_tarball(url: str = REPO_TARBALL) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "vidora"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def _list_markdown(data: bytes) -> Tuple[Dict[str, List[Tuple[str, str]]], Dict[str, str]]:
    tf = tarfile.open(fileobj=io.BytesIO(data), mode="r:gz")
    found: Dict[str, List[Tuple[str, str]]] = {}
    raw: Dict[str, str] = {}
    for m in tf.getmembers():
        if not m.isfile() or not m.name.endswith(".md") or "/skills/" not in m.name:
            continue
        segs = m.name.split("/skills/", 1)[1].split("/")
        f = tf.extractfile(m)
        content = f.read().decode("utf-8", errors="replace") if f else ""
        if not content.strip() or len(content) > MAX_FILE_CHARS:
            continue
        rel = "/".join(segs)
        raw[rel] = content
        fn = "/".join(segs[1:]) if len(segs) > 2 else segs[-1]
        found.setdefault(segs[0], []).append((fn, content))
    return found, raw


def _embed_crossrefs(bundle: Dict[str, List[Tuple[str, str]]], raw: Dict[str, str]) -> None:
    for _, files in bundle.items():
        existing = {fn for fn, _ in files}
        for ref in re.findall(r"\]\(\.\./([^)]+)\)", "".join(c for _, c in files)):
            if ref in raw and ref not in existing:
                files.append((f"deps/{ref}", f"> скопированная зависимость: remotion://skills/{ref}\n\n{raw[ref]}"))


def _meta(content: str) -> Tuple[str, str]:
    title, desc = "", ""
    if content.startswith("---"):
        end = content.find("\n---", 3)
        if end != -1:
            fm = {
                line.split(":", 1)[0].strip(): line.split(":", 1)[1].strip()
                for line in content[3:end].splitlines()
                if ":" in line
            }
            title, desc = fm.get("name", ""), fm.get("description", "")
    for line in content.splitlines():
        if not title and line.startswith("# "):
            title = line[2:].strip()
        if not desc and not line.startswith("# "):
            desc = line.strip()[:200]
    return title, desc


def _build(name: str, files: List[Tuple[str, str]]) -> Dict[str, Any]:
    sk = next((c for fn, c in files if fn.lower() == "skill.md"), files[0][1] if files else "")
    title, desc = _meta(sk)
    parts = [f"# {title or name}\n"]
    for fn, c in sorted(files):
        parts.append(f"--- {name}/{fn} ---\n\n{c}")
    return {"id": name, "title": title or name, "description": desc, "content": "\n\n".join(parts)}


def sync_remotion_skills(url: str = REPO_TARBALL) -> Dict[str, Any]:
    """Синхронизирует Markdown-скиллы Remotion из официального репозитория."""
    bundle, raw = _list_markdown(_fetch_tarball(url))
    _embed_crossrefs(bundle, raw)
    skills = [_build(name, files) for name, files in bundle.items()]
    skills.sort(key=lambda s: s["id"])
    return {"status": "ok", "synced_at": datetime.now(timezone.utc).isoformat(), "skills": skills}
