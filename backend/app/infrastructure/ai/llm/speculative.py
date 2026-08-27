"""Нейросетевая черновая модель для Speculative Decoding (llama-cpp-python).

В llama-cpp-python 0.3.34 LlamaDraftModel — это ABC-колбэк: целевая модель вызывает
draft(input_ids) и ждёт массив кандидатных токенов. Черновик (1B) проганяет префикс
своим forward и отдаёт argmax-токены, целевая модель (4B) принимает/отклоняет их.
"""

from typing import Any

import numpy as np

from llama_cpp import Llama, LlamaDraftModel


class NeuralDraftModel(LlamaDraftModel):
    def __init__(
        self,
        model_path: str,
        n_threads: int,
        n_gpu_layers: int = 0,
        num_pred_tokens: int = 5,
    ):
        self._llm = Llama(
            model_path=model_path,
            n_ctx=16384,
            n_batch=512,
            n_threads=n_threads,
            n_gpu_layers=n_gpu_layers,
            logits_all=True,
            verbose=False,
        )
        self._num_pred_tokens = num_pred_tokens

    def __call__(self, input_ids: np.ndarray, /, **kwargs: Any) -> np.ndarray:
        # ponytail: Python-колбэк не хранит KV черновика между вызовами — каждый шаг
        # пере-префилит весь контекст на 1B. Выигрыш реальный только на коротких
        # промптах; на длинном системном промпте (~800 токенов) может быть медленнее.
        # Отключить: VIDORA_LLAMA_DRAFT=0. Если llama-cpp научится кэшировать draft KV —
        # удалить этот комментарий.
        cur = [int(t) for t in input_ids]
        preds = []
        for _ in range(self._num_pred_tokens):
            self._llm.reset()
            self._llm.eval(cur)
            logits = np.asarray(self._llm.eval_logits)[-1]
            nxt = int(np.argmax(logits))
            preds.append(nxt)
            cur.append(nxt)
        return np.array(preds, dtype=np.int32)
