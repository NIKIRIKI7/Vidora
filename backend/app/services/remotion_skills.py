"""Fetches official Remotion skills (remotion-dev/skills) and parses them into injectable skill entries.

One request to the codeload tarball + stdlib tarfile instead of the whole GitHub API + N raw fetches.
"""
import io
import re
import tarfile
import urllib.request
from datetime import datetime, timezone

REPO_TARBALL = "https://codeload.github.com/remotion-dev/skills/tar.gz/refs/heads/main"
MAX_FILE_CHARS = 300_000


def _fetch_tarball(url: str = REPO_TARBALL) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "vidora"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def _list_markdown(data: bytes) -> tuple[dict[str, list[tuple[str, str]]], dict[str, str]]:
    """(skill_id -> [(path_within_skill, content), ...], rel_path -> content).

    Every md file lands under its top-level skill dir. Nested copies (skills/remotion-best-practices/<skill>/...,
    skills/remotion-markup/remotion-maps/...) are kept: the parent SKILL.md links to them with ./-relative
    links, so dropping them would leave dead references inside the bundle.
    """
    tf = tarfile.open(fileobj=io.BytesIO(data), mode="r:gz")
    found: dict[str, list[tuple[str, str]]] = {}
    raw: dict[str, str] = {}
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


def _embed_crossrefs(bundle: dict[str, list[tuple[str, str]]], raw: dict[str, str]) -> None:
    """Copy cross-skill references (../other-skill/file.md) into the bundle so they resolve too."""
    for skill, files in bundle.items():
        sk = next((c for fn, c in files if fn.lower() == "skill.md"), files[0][1])
        existing = {fn for fn, _ in files}
        for ref in re.findall(r"\]\(\.\./([^)#]+)", sk):
            if ref in raw and ref not in existing:
                files.append((f"deps/{ref}", f"> скопированная зависимость: remotion://skills/{ref}\n\n{raw[ref]}"))


def _meta(content: str) -> tuple[str, str]:
    title, desc = "", ""
    if content.startswith("---"):
        end = content.find("\n---", 3)
        if end != -1:
            fm = {line.split(":", 1)[0].strip(): line.split(":", 1)[1].strip()
                  for line in content[3:end].splitlines() if ":" in line}
            title, desc = fm.get("name", ""), fm.get("description", "")
    for line in content.splitlines():
        if not title and line.startswith("# "):
            title = line[2:].strip()
    if not desc:
        desc = " ".join(content.splitlines()[1:4]).strip()[:200]
    return title, desc


def _build(name: str, files: list[tuple[str, str]]) -> dict:
    sk = next((c for fn, c in files if fn.lower() == "skill.md"), files[0][1])
    title, desc = _meta(sk)
    parts = [f"## {title or name}\n\n> remotion://skills/{name}"]
    for fn, c in sorted(files):
        parts.append(f"--- {name}/{fn} ---\n\n{c}")
    return {"id": name, "title": title or name, "description": desc, "content": "\n\n".join(parts)}


def sync_remotion_skills(url: str = REPO_TARBALL) -> dict:
    bundle, raw = _list_markdown(_fetch_tarball(url))
    _embed_crossrefs(bundle, raw)
    skills = [_build(name, files) for name, files in bundle.items()]
    skills.sort(key=lambda s: s["id"])
    return {"status": "ok", "synced_at": datetime.now(timezone.utc).isoformat(), "skills": skills}


def demo() -> None:
    def make_tar(members: dict[str, str]) -> bytes:
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tf:
            for path, body in members.items():
                data = body.encode("utf-8")
                ti = tarfile.TarInfo(path)
                ti.size = len(data)
                tf.addfile(ti, io.BytesIO(data))
        return buf.getvalue()

    fixture = {
        "repo/skills/remotion-markup/SKILL.md": "---\nname: Markup\n---\n# Remotion Markup\nСм. также [Best Practices](../remotion-best-practices/SKILL.md).\n",
        "repo/skills/remotion-markup/timing.md": "# Timing\nКак тайминировать фрагменты.\n",
        "repo/skills/remotion-best-practices/SKILL.md": "# Remotion Best Practices\nИли обратись к [разметке](../remotion-markup/SKILL.md).\n",
        "repo/skills/remotion-best-practices/remotion-create/REFERENCE.md": "# Create (kept, referenced)\n",
        "repo/skills/remotion-markup/remotion-maps/REFERENCE.md": "# Maps REF (kept, referenced by markup)\n",
        "repo/skills/remotion-maps/techniques/mapbox/render-stability.md": "# Mapbox stability\n",
        "repo/skills/remotion-maps/techniques/static-map/TECHNIQUE.md": "# Static Map\n",
        "repo/README.md": "not a skill",
    }
    by_skill, raw = _list_markdown(make_tar(fixture))
    assert set(by_skill) == {"remotion-markup", "remotion-best-practices", "remotion-maps"}, by_skill.keys()
    assert {fn for fn, _ in by_skill["remotion-best-practices"]} == {
        "SKILL.md",
        "remotion-create/REFERENCE.md",
    }, by_skill["remotion-best-practices"]
    _embed_crossrefs(by_skill, raw)
    assert {fn for fn, _ in by_skill["remotion-markup"]} == {
        "SKILL.md",
        "timing.md",
        "remotion-maps/REFERENCE.md",
        "deps/remotion-best-practices/SKILL.md",
    }, by_skill["remotion-markup"]
    assert {fn for fn, _ in by_skill["remotion-best-practices"]} == {
        "SKILL.md",
        "remotion-create/REFERENCE.md",
        "deps/remotion-markup/SKILL.md",
    }, by_skill["remotion-best-practices"]
    skill = _build("remotion-markup", by_skill["remotion-markup"])
    assert skill["title"] == "Markup" and "Remotion Markup" in skill["content"] and "Best Practices" in skill["content"]
    print(f"OK: {len(by_skill)} skill dirs, {sum(len(v) for v in by_skill.values())} files, nested + crossrefs + meta work")


if __name__ == "__main__":
    demo()