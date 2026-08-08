import os
from typing import List, Dict, Any
from datetime import datetime

class YouTubeExporter:
    @staticmethod
    def to_excel(data_list: List[Dict[str, Any]], project_path: str) -> str:
        if not data_list:
            return ""
        try:
            import pandas as pd
            assets_dir = os.path.join(project_path, "assets", "data")
            os.makedirs(assets_dir, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"yt_ideas_{timestamp}.xlsx"
            filepath = os.path.join(assets_dir, filename)

            df = pd.DataFrame(data_list)
            cols = df.columns.tolist()
            pref = ["title", "channel", "views", "subs", "ratio", "duration_sec", "is_short", "url", "keyword_found", "transcript_sample"]
            final_cols = [c for c in pref if c in cols] + [c for c in cols if c not in pref]

            df[final_cols].to_excel(filepath, index=False, engine='openpyxl')
            print(f"[YT-EXPORTER] Excel сохранен: {filepath}")
            return filepath
        except Exception as e:
            print(f"[YT-EXPORTER] Ошибка экспорта: {e}")
            return ""