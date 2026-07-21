import os

class FSManager:
    @staticmethod
    def save_scene_code(project_path: str, scene_id: str, code: str):
        if not project_path or not os.path.exists(project_path):
            return None
        out_dir = os.path.join(project_path, "code", "a-roll")
        os.makedirs(out_dir, exist_ok=True)
        out_file = os.path.join(out_dir, f"{scene_id}.tsx")
        with open(out_file, "w", encoding="utf-8") as f:
            f.write(code)
        return out_file
