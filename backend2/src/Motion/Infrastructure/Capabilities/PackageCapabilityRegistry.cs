using System.Text;
using Microsoft.Extensions.Logging;
using MotionContext.Domain.Entities;
using MotionContext.Domain.Ports;

namespace MotionContext.Infrastructure.Capabilities;

public sealed class PackageCapabilityRegistry : IPackageCapabilityRegistry
{
    private readonly Dictionary<string, PackageCapability> _capabilities;
    private readonly ILogger<PackageCapabilityRegistry> _logger;

    public PackageCapabilityRegistry(ILogger<PackageCapabilityRegistry> logger)
    {
        _logger = logger;

        var list = new List<PackageCapability>
        {
            new(
                id: "react",
                packageName: "react",
                allowedImports: ["useState", "useEffect", "useCallback", "useMemo", "useRef", "useContext", "createContext", "memo", "forwardRef"],
                isVisualComponent: false,
                promptGuideline: "React core. Use functional components and hooks."),

            new(
                id: "remotion",
                packageName: "remotion",
                allowedImports: ["useCurrentFrame", "useVideoConfig", "spring", "interpolate", "Sequence", "Img", "Audio", "Video", "AbsoluteFill"],
                isVisualComponent: true,
                promptGuideline: "Remotion core hooks and components. Always use spring() with clamp: true."),

            new(
                id: "tailwind",
                packageName: "tailwindcss",
                allowedImports: [],
                isVisualComponent: false,
                promptGuideline: "Tailwind CSS is available. Use utility classes (flex, items-center, justify-center, font-bold, text-white, drop-shadow-md, bg-surface, text-accent). Do NOT write external css imports."),

            new(
                id: "lucide-react",
                packageName: "lucide-react",
                allowedImports: ["*"],
                isVisualComponent: true,
                promptGuideline: "Import icons as: `import { Check, Flame, Trophy, TrendingUp, AlertCircle, ArrowRight } from 'lucide-react'`. Pass size={48} and className."),

            new(
                id: "remotion-lottie",
                packageName: "@remotion/lottie",
                allowedImports: ["Lottie", "LottieAnimationData"],
                isVisualComponent: true,
                promptGuideline: "Used for vector animations. Import { Lottie } from '@remotion/lottie'."),

            new(
                id: "three-fiber",
                packageName: "@react-three/fiber",
                allowedImports: ["Canvas", "useFrame"],
                isVisualComponent: true,
                promptGuideline: "ThreeJS in Remotion. Must dispose geometry and materials explicitly in useEffect.")
        };

        _capabilities = list.ToDictionary(c => c.PackageName, StringComparer.OrdinalIgnoreCase);

        _logger.LogInformation("[CapabilityRegistry] Инициализирован реестр пакетов. Зарегистрировано: {Count} ({Packages})",
            _capabilities.Count, string.Join(", ", _capabilities.Keys));
    }

    public IReadOnlyList<PackageCapability> GetAll() => _capabilities.Values.ToList();

    public bool IsPackageAllowed(string packageName)
    {
        var clean = packageName.Trim().Trim('\'', '"');
        if (clean.StartsWith("./") || clean.StartsWith("../"))
            return true;

        bool allowed = _capabilities.ContainsKey(clean);
        if (!allowed)
        {
            _logger.LogDebug("[CapabilityRegistry] Проверка пакета '{Package}': ЗАПРЕЩЕН", clean);
        }
        return allowed;
    }

    public PackageCapability? Find(string packageName)
    {
        var clean = packageName.Trim().Trim('\'', '"');
        return _capabilities.GetValueOrDefault(clean);
    }

    public string GetCombinedPromptGuidelines(IEnumerable<string>? requestedCapabilityIds = null)
    {
        var sb = new StringBuilder();
        var selected = requestedCapabilityIds != null
            ? _capabilities.Values.Where(c => requestedCapabilityIds.Contains(c.Id, StringComparer.OrdinalIgnoreCase)).ToList()
            : _capabilities.Values.ToList();

        _logger.LogDebug("[CapabilityRegistry] Сборка промпт-правил для: {Caps}", string.Join(", ", selected.Select(s => s.Id)));

        foreach (var cap in selected)
        {
            sb.AppendLine($"- Package `{cap.PackageName}` ({cap.Id}): {cap.PromptGuideline}");
        }
        return sb.ToString();
    }
}
