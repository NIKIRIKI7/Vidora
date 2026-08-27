import os
from datetime import datetime
from typing import List, Dict, Any


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
            filename = f"yt_viral_ideas_{timestamp}.xlsx"
            filepath = os.path.join(assets_dir, filename)

            # Санитизация вложенных структур в плоские строки (openpyxl не пишет dict/set напрямую)
            sanitized = []
            for item in data_list:
                row = {}
                for k, v in item.items():
                    if isinstance(v, (list, set, tuple)):
                        row[k] = ", ".join(str(x) for x in v)
                    elif isinstance(v, dict):
                        row[k] = str(v)
                    else:
                        row[k] = v
                sanitized.append(row)

            df = pd.DataFrame(sanitized)
            cols = df.columns.tolist()
            pref = [
                "title", "channel", "channel_url", "published_at", "views", "subs",
                "ratio", "vph", "duration_sec", "is_short", "url", "keyword_found",
                "transcript_status", "transcript_sample", "comments_summary",
                "vps_score", "social_source_url",
            ]
            final_cols = [c for c in pref if c in cols] + [c for c in cols if c not in pref]
            df = df[final_cols]

            with pd.ExcelWriter(filepath, engine="openpyxl") as writer:
                df.to_excel(writer, index=False, sheet_name="Viral Outliers")
                worksheet = writer.sheets["Viral Outliers"]
                for column_cells in worksheet.columns:
                    max_len = max(len(str(cell.value or "")) for cell in column_cells)
                    worksheet.column_dimensions[column_cells[0].column_letter].width = min(max(max_len + 2, 12), 45)

            return filepath
        except Exception as e:
            print(f"[YT-EXPORTER] Ошибка экспорта: {e}")
            return ""
