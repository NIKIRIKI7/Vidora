namespace Voice.Application.Services;

/// <summary>
/// Порт взаимодействия контекста Voice с хранилищем медиа:
/// регистрация сгенерированного аудио и получение физических путей ассетов.
/// </summary>
public interface IVoiceMediaRegistrar
{
    Task<string> RegisterAudioAsync(string title, string filePath, CancellationToken ct = default);
    Task<string> ResolveAudioPathAsync(string assetId, CancellationToken ct = default);
}
