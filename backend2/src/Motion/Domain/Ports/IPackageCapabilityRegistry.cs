using MotionContext.Domain.Entities;

namespace MotionContext.Domain.Ports;

public interface IPackageCapabilityRegistry
{
    IReadOnlyList<PackageCapability> GetAll();
    bool IsPackageAllowed(string packageName);
    PackageCapability? Find(string packageName);
    string GetCombinedPromptGuidelines(IEnumerable<string>? requestedCapabilityIds = null);
}
