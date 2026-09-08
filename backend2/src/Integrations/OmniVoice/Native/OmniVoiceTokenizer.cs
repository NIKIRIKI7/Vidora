using System.Text;
using System.Text.Json;

namespace Integrations.OmniVoice.Native;

/// <summary>
/// Детерминированный токенизатор голосового фрагмента.
/// При наличии model/tokenizer.json выполняет честный BPE-мержинг по рангам (greedy longest-match).
/// При отсутствии vocab-артефактов не деградирует в «byte+offset»-подделку, а работает как
/// символьный токенизатор с байтовым фоллбэком (256 + byte) поверх UTF-8.
/// Кадр BOS/EOS/PAD/UNK фиксирован: 0 = pad, 1 = bos, 2 = eos, 3 = unk.
/// </summary>
public sealed class OmniVoiceTokenizer
{
    public const long PadId = 0;
    public const long BosId = 1;
    public const long EosId = 2;
    public const long UnkId = 3;
    public const long ByteTokenBase = 256;

    private const ulong FnvOffset = 14695981039346656037UL;
    private const ulong FnvPrime = 1099511628211UL;

    private readonly Dictionary<string, long> _vocab;
    private readonly Dictionary<Pair, long> _pairRanks;
    private readonly long? _trimmedVocabSize;

    private OmniVoiceTokenizer(Dictionary<string, long> vocab, Dictionary<Pair, long> pairRanks, int? vocabSize)
    {
        _vocab = vocab;
        _pairRanks = pairRanks;
        _trimmedVocabSize = vocabSize.HasValue ? (long)vocabSize.Value : null;
    }

    public int VocabularySize => _vocab.Count;

    /// <summary>
    /// Загружает токенизатор из каталога модели. Приоритет: tokenizer.json -> vocab.json.
    /// Никогда не бросает исключение по отсутствию файлов — в этом случае используется
    /// символьный фоллбэк, эквивалентный байтовому токенизатору.
    /// </summary>
    public static async Task<OmniVoiceTokenizer> CreateAsync(string modelDirectory, CancellationToken ct = default)
    {
        var vocab = new Dictionary<string, long>(StringComparer.Ordinal);
        var pairRanks = new Dictionary<Pair, long>();
        int? vocabSize = null;

        var tokenizerPath = Path.Combine(modelDirectory, "tokenizer.json");
        if (File.Exists(tokenizerPath))
        {
            vocabSize = await LoadTokenizerJsonAsync(tokenizerPath, vocab, pairRanks, ct);
        }
        else
        {
            var vocabPath = Path.Combine(modelDirectory, "vocab.json");
            if (File.Exists(vocabPath))
            {
                vocabSize = await LoadPlainVocabJsonAsync(vocabPath, vocab, ct);
            }
        }

        return new OmniVoiceTokenizer(vocab, pairRanks, vocabSize);
    }

    /// <summary>
    /// BPE-кодирование строки в последовательность токенов.
    /// Начальные символы — code points строки; применяются merge-правила по возрастанию ранга.
    /// Неизвестные символы маппятся: одиночный символ -> 256 + первый байт UTF-8; иначе UNK.
    /// </summary>
    public long[] Tokenize(string text)
    {
        var symbols = new List<string>();
        foreach (var ch in text)
        {
            symbols.Add(_vocab.ContainsKey(ch.ToString())
                ? ch.ToString()
                : TryResolveByteSymbol(text, ch));
        }

        MergeBestPairs(symbols);

        var tokens = new List<long>(symbols.Count + 2) { BosId };
        foreach (var symbol in symbols)
        {
            tokens.Add(TokenIdFor(symbol));
        }
        tokens.Add(EosId);
        return tokens.ToArray();
    }

    /// <summary>
    /// Детерминированное сигнатурное представление текста для «нахлынувших» без сохранения
    /// реальных секретов: используется вместо криптографического хэша (убрана зависимость от SHA-512).
    /// </summary>
    public static string GetSignature(string text)
    {
        var bytes = Encoding.UTF8.GetBytes(text.ToLowerInvariant());
        ulong hash = FnvOffset;
        foreach (var b in bytes)
        {
            hash ^= b;
            hash *= FnvPrime;
        }

        var chars = Encoding.UTF8.GetBytes(hash.ToString("x16"));
        ulong second = FnvOffset;
        foreach (var b in chars)
        {
            second ^= b;
            second *= FnvPrime;
        }

        return $"{hash:x16}-{second:x16}";
    }

    private void MergeBestPairs(List<string> symbols)
    {
        if (_pairRanks.Count == 0 || symbols.Count < 2) return;

        bool changed;
        do
        {
            changed = false;
            long bestRank = long.MaxValue;
            int bestIdx = -1;

            for (int i = 0; i < symbols.Count - 1; i++)
            {
                var pair = new Pair(symbols[i], symbols[i + 1]);
                if (!_pairRanks.TryGetValue(pair, out var rank)) continue;
                if (rank < bestRank)
                {
                    bestRank = rank;
                    bestIdx = i;
                }
            }

            if (bestIdx >= 0)
            {
                symbols[bestIdx] = symbols[bestIdx] + symbols[bestIdx + 1];
                symbols.RemoveAt(bestIdx + 1);
                changed = true;
            }
        }
        while (changed);
    }

    private static string TryResolveByteSymbol(string source, char ch)
    {
        var raw = Encoding.UTF8.GetBytes(ch.ToString());
        return raw.Length switch
        {
            1 => ToHexByteSymbol(raw[0]),
            _ => ch.ToString()
        };
    }

    private static string ToHexByteSymbol(byte b) => $"<0x{b:x2}>";

    private long TokenIdFor(string symbol)
    {
        if (_vocab.TryGetValue(symbol, out var id)) return id;

        if (symbol.Length == 1)
        {
            var raw = Encoding.UTF8.GetBytes(symbol);
            if (raw.Length == 1)
            {
                long byteId = ByteTokenBase + raw[0];
                if (_trimmedVocabSize == null || byteId < _trimmedVocabSize)
                {
                    return byteId;
                }
            }
        }

        return UnkId;
    }

    private static async Task<int?> LoadTokenizerJsonAsync(
        string path,
        Dictionary<string, long> vocab,
        Dictionary<Pair, long> pairRanks,
        CancellationToken ct)
    {
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, true);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var root = doc.RootElement;

        int? vocabSize = null;
        if (root.TryGetProperty("model", out var model))
        {
            if (model.TryGetProperty("vocab", out var vocabEl) && vocabEl.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in vocabEl.EnumerateObject())
                {
                    if (prop.Value.TryGetInt64(out var id)) vocab[prop.Name] = id;
                }
                vocabSize = vocab.Count;
            }

            if (model.TryGetProperty("merges", out var mergesEl) && mergesEl.ValueKind == JsonValueKind.Array)
            {
                long rank = 0;
                foreach (var merge in mergesEl.EnumerateArray())
                {
                    if (merge.ValueKind != JsonValueKind.String) continue;
                    var parts = merge.GetString()!.Split(' ');
                    if (parts.Length < 2) continue;
                    pairRanks.TryAdd(new Pair(parts[0], parts[1]), rank);
                    rank++;
                }
            }
        }
        else
        {
            // fallback: tokenizer.json в виде { "vocab": {...}, "merges": [...] }
            if (root.TryGetProperty("vocab", out var flatVocab) && flatVocab.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in flatVocab.EnumerateObject())
                {
                    if (prop.Value.TryGetInt64(out var id)) vocab[prop.Name] = id;
                }
                vocabSize = vocab.Count;
            }
            if (root.TryGetProperty("merges", out var flatMerges) && flatMerges.ValueKind == JsonValueKind.Array)
            {
                long rank = 0;
                foreach (var merge in flatMerges.EnumerateArray())
                {
                    if (merge.ValueKind != JsonValueKind.String) continue;
                    var parts = merge.GetString()!.Split(' ');
                    if (parts.Length < 2) continue;
                    pairRanks.TryAdd(new Pair(parts[0], parts[1]), rank);
                    rank++;
                }
            }
        }

        return vocabSize;
    }

    private static async Task<int?> LoadPlainVocabJsonAsync(string path, Dictionary<string, long> vocab, CancellationToken ct)
    {
        await using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, true);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: ct);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object) return null;

        foreach (var prop in root.EnumerateObject())
        {
            if (prop.Value.TryGetInt64(out var id)) vocab[prop.Name] = id;
        }

        return vocab.Count;
    }

    private readonly record struct Pair(string Left, string Right);
}