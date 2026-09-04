using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Kernel.Tests;

public class PathResolverTests : IDisposable
{
    private readonly string _testRoot;
    private readonly PathResolver _resolver;

    public PathResolverTests()
    {
        _testRoot = Path.Combine(Path.GetTempPath(), "vidora_sandbox_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_testRoot);
        _resolver = new PathResolver(NullLogger<PathResolver>.Instance, [_testRoot]);
    }

    [Fact]
    public void ResolveSafePath_ValidSubPath_ShouldReturnFullPath()
    {
        var relativePath = Path.Combine(_testRoot, "projects", "proj_1", "SCENARIO.md");
        var resolved = _resolver.ResolveSafePath(relativePath);
        Assert.Equal(Path.GetFullPath(relativePath), resolved);
    }

    [Theory]
    [InlineData("../../windows/system32/cmd.exe")]
    [InlineData("../outside.txt")]
    [InlineData("..\\..\\secret.env")]
    public void ResolveSafePath_PathTraversal_ShouldThrowSecurityException(string attackPath)
    {
        var fullTarget = Path.Combine(_testRoot, attackPath);
        Assert.Throws<SecurityPathViolationException>(() =>
        {
            _resolver.ResolveSafePath(fullTarget);
        });
    }

    [Theory]
    [InlineData("test/file:name*?.mp4", "test_file_name__.mp4")]
    [InlineData("файл_сценария!?.md", "файл_сценария__.md")]
    [InlineData("  ..hidden_file.. ", "hidden_file")]
    [InlineData("", "unnamed_file")]
    [InlineData("CON.txt", "_CON.txt")]
    [InlineData("aux.mp4", "_aux.mp4")]
    [InlineData("nul", "_nul")]
    public void SanitizeFileName_ShouldHandleDangerousAndReservedNames(string input, string expected)
    {
        var clean = _resolver.SanitizeFileName(input);
        Assert.Equal(expected, clean);
    }

    public void Dispose()
    {
        if (Directory.Exists(_testRoot))
        {
            try { Directory.Delete(_testRoot, true); } catch { }
        }
    }
}
