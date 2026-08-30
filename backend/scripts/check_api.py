"""Smoke-test: lifespan (bootstrap) + новые API-роуты скилов."""
import sys

sys.path.insert(0, ".")

from fastapi.testclient import TestClient

from app.main import app


def main():
    with TestClient(app) as c:
        # lifespan должен создать таблицы + залить seed
        r = c.get("/api/v1/skills")
        assert r.status_code == 200, r.text
        skills = r.json()
        assert len(skills) >= 20, f"мало скилов: {len(skills)}"
        print(f"[OK] GET /api/v1/skills: {len(skills)} скилов")

        ids = {s["id"] for s in skills}
        assert "custom_widget_creator" in ids and "archetype_nike" in ids
        print("[OK] есть seed-скилы и мигрированный legacy-скил")

        # Фильтр по стадии
        r = c.get("/api/v1/skills", params={"stage": "scene_generation"})
        assert r.status_code == 200
        assert all(s["stage"] == "scene_generation" or s["stage"] == "general" for s in r.json())
        print(f"[OK] фильтр stage=scene_generation: {len(r.json())}")

        # GET одного
        wc = c.get("/api/v1/skills/custom_widget_creator")
        assert wc.status_code == 200 and len(wc.json()["prompt"]) > 10000
        print("[OK] GET single: custom_widget_creator полный")

        # POST / PATCH / DELETE
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

        # Старый путь /system/skills тоже отвечает (новый контракт)
        r = c.get("/api/v1/system/skills")
        assert r.status_code == 200 and isinstance(r.json(), list)
        print(f"[OK] GET /api/v1/system/skills: {len(r.json())}")

        # Системный скил не сбрасывается повторным sync (side-effect free)
        r = c.post("/api/v1/system/remotion-skills-sync")
        assert r.status_code == 200
        r2 = c.get("/api/v1/skills")
        assert len(r2.json()) == len(skills)
        print("[OK] sync не размножает скилы")

        # Reset возвращает полный seed-промпт
        before = c.get("/api/v1/skills/custom_widget_creator").json()
        c.patch("/api/v1/skills/custom_widget_creator", json={"prompt": "corrupted", "is_custom": True})
        after = c.post("/api/v1/system/skills/custom_widget_creator/reset").json()
        assert len(after["prompt"]) > 10000 and after["is_custom"] is False, "reset не восстановил seed"
        print("[OK] reset custom_widget_creator -> полный seed-промпт")
        # Вернуть как было на случай повторного запуска
        assert before["prompt"] == after["prompt"]

    print("\nALL API CHECKS PASSED")


if __name__ == "__main__":
    main()
