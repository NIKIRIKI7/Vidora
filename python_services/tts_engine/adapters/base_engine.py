from typing import List, Optional


class BaseVoiceEngine:
    """
    Базовый контракт (интерфейс) для всех TTS-движков воркера.

    Адаптеры не обязаны быть потокобезопасными: VramManager в любой момент
    времени держит в памяти только один инстанс, а вызовы из FastAPI
    выполняются последовательно в отдельном потоке воркера.
    """

    # Идентификатор движка для API (например: 'omni_voice_v1')
    engine_id: str = ""
    # Читабельное имя для UI
    name: str = ""
    # Массив возможностей: 'synthesis', 'clone', 'design', 'voice2voice'
    capabilities: List[str] = []

    def load(self):
        """Загружает веса модели в VRAM (GPU)."""
        raise NotImplementedError()

    def unload(self):
        """Выгружает веса модели из памяти и очищает ссылки."""
        raise NotImplementedError()

    def synthesize(
        self,
        text: str,
        embedding_path: Optional[str],
        output_path: str,
        speed: float = 1.0,
        pitch: float = 1.0,
    ):
        """Генерирует речь. Если embedding_path указан, использует клон."""
        raise NotImplementedError()

    def clone_voice(
        self,
        ref_audio_path: str,
        output_embedding_path: str,
        ref_text: Optional[str] = None,
    ):
        """Извлекает характеристики диктора и сохраняет вектор на диск (.pt / .json)."""
        raise NotImplementedError()
