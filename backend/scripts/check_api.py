"""Smoke-test: lifespan (bootstrap) + API-роуты скилов."""
import sys

sys.path.insert(0, ".")

from fastapi.testclient import TestClient

from app.main import app


def main():
    with TestClient(app) as c:
        r = c.get("/api/v1/skills")
        assert r.status_code == 200, r.text
        skills = r.json()
        assert len(skills) > 0, f"мало скилов: {len(skills)}"
        print(f"[OK] GET /api/v1/skills: {len(skills)} скилов")

        r = c.get("/api/v1/skills", params={"stage": "scene_generation"})
        assert r.status_code == 200
        assert all(s["stage"] == "scene_generation" or s["stage"] == "general" for s in r.json())
        print(f"[OK] фильтр stage=scene_generation: {len(r.json())}")

        created = c.post("/api/v1/skills", json={
            "name": "Smoke Test", "description": "t", "prompt": "p", "stage": "general", "priority": 5,
        })
        assert created.status_code == 201, created.text
        cid = created.json()["id"]
        assert cid.startswith("skill_")
        patched = c.patch(f"/api/v1/skills/{cid}", json={"prompt": "updated", "is_active": False})
        assert patched.status_code == 200 and patched.json()["prompt"] == "updated"
        deleted = c.delete(f"/api/v1/skills/{cid}")
        assert deleted.status_code == 204
        print("[OK] POST/PATCH/DELETE скила")

        r = c.get("/api/v1/system/skills")
        assert r.status_code == 200 and isinstance(r.json(), list)
        print(f"[OK] GET /api/v1/system/skills: {len(r.json())}")

        r = c.post("/api/v1/system/remotion-skills-sync")
        assert r.status_code == 200
        print("[OK] remotion-skills-sync")

    print("\nALL API CHECKS PASSED")


if __name__ == "__main__":
    main()
