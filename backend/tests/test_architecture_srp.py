import pytest
from pathlib import Path
from app.services.code_gen_service import CodeGenService
from app.services.audio_service import AudioService
from app.infrastructure.storage.code_history_repo import CodeHistoryRepository
from app.infrastructure.ai.llm.tsx_parser import extract_tsx


def test_code_gen_extract_tsx_is_pure():
    raw_markdown = "Here is the code:\n```tsx\nexport const Scene = () => null;\n```\nEnjoy!"
    extracted = extract_tsx(raw_markdown)
    assert extracted == "export const Scene = () => null;"


def test_code_gen_save_code_creates_file(tmp_path):
    repo = CodeHistoryRepository()
    repo.root_dir = tmp_path / "code_history"
    repo.root_dir.mkdir(parents=True)

    service = CodeGenService(history_repo=repo)
    code = "export const MyComp = () => <div />;"

    saved_file = service.save_code_to_project(
        project_path=str(tmp_path),
        target_id="intro_scene",
        tsx_code=code,
        prompt="Create intro",
    )

    assert saved_file.exists()
    assert saved_file.read_text(encoding="utf-8") == code


def test_audio_prepare_voice_output_path():
    path = AudioService().prepare_voice_output_path("test_proj", "Frag_Intro", "12345678-abcd")
    assert path.name == "Frag_Intro_123456.wav"
    assert "assets" in str(path)
    assert "voice" in str(path)
