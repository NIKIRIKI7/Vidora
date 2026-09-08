/*
 * omnivoice_native.h - C-ABI контракт нативного GGML-рантайма OmniVoice (Vidora).
 *
 * Парное объявление находится в backend2:
 *   src/Integrations/OmniVoice/Native/OmniVoiceNativeRuntime.cs (P/Invoke).
 *
 * Библиотека собирается из графического стека audio.cpp / omnivoice.cpp
 * (cstr-omnivoice) с GGML-бэкендом CUDA 12. До тех пор, пока DLL отсутствует,
 * синтез в Vidora честно завершается кодом отсутствия рантайма и НЕ генерирует
 * фейковое аудио.
 */

#ifndef OMNIVOICE_NATIVE_H
#define OMNIVOICE_NATIVE_H

#ifdef __cplusplus
extern "C" {
#endif

#define OMNIVOICE_OVS_OK               0
#define OMNIVOICE_OVS_ERR_RUNTIME      1   /* рантайм не инициализирован      */
#define OMNIVOICE_OVS_ERR_MODEL        2   /* GGUF-файлы не найдены/не открыты */
#define OMNIVOICE_OVS_ERR_INFER        3   /* сбой инференса (OOM, CUDA, ...)  */
#define OMNIVOICE_OVS_ERR_ARGS         4   /* неверные аргументы               */

/*
 * Инициализация рантайма под конкретный device.
 *   device_index   - индекс CUDA-устройства (0 по умолчанию);
 *   force_cpu      - 1 принудительно использовать CPU (fallback).
 * error_buffer/len - буфер для текстовой ошибки.
 * Возвращает 0 при успехе.
 */
int ovs_init(const char* model_dir,
             const char* base_model_name,
             const char* tokenizer_model_name,
             int device_index,
             int force_cpu,
             char* error_buffer,
             int error_buffer_len);

/*
 * Синтез речи. Возвращает 0 при успехе; сэмплы (float, моно, -1..1) выделяются
 * рантаймом и освобождаются через ovs_free_samples().
 *   text             - текст для синтеза;
 *   speaker_id       - идентификатор диктора (или "clone_realtime"/"design_realtime");
 *   reference_audio  - путь к аудио-референсу (NULL если не используется);
 *   reference_text   - расшифровка референса (NULL если неизвестна);
 *   speed            - темп 0.2..4.0;
 *   pitch            - высота тона 0.5..2.0;
 *   guidance_scale   - CFG 1.0..10.0;
 *   num_steps        - шаги диффузии 8..128;
 *   sample_rate      - запрошенная частота (24000).
 */
int ovs_synthesize(const char* text,
                   const char* speaker_id,
                   const char* reference_audio,
                   const char* reference_text,
                   float speed,
                   float pitch,
                   float guidance_scale,
                   int num_steps,
                   int sample_rate,
                   float** out_samples,
                   int* out_sample_count,
                   int* out_sample_rate,
                   char* error_buffer,
                   int error_buffer_len);

/* Освобождение буфера сэмплов из ovs_synthesize(). */
void ovs_free_samples(float* samples);

/* Выгрузка весов конкретного device из VRAM. */
int ovs_unload(int device_index);

#ifdef __cplusplus
}
#endif

#endif /* OMNIVOICE_NATIVE_H */