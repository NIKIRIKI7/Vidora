using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Kernel.Ports;
using MediaContext.Application.Services;
using MediaContext.Contracts;
using MediaContext.Domain;
using MediaContext.Domain.Entities;
using MediaContext.Domain.Ports;
using MediaContext.Domain.ValueObjects;
using MediaContext.Infrastructure.Catalog;
using MediaContext.Infrastructure.Normalization;
using Microsoft.Extensions.Logging;
using Moq;
using Xunit;

namespace Kernel.Tests;

public class MediaTests
{
    private readonly Mock<IMediaAssetRepository> _repo = new();
    private readonly Mock<IMediaStorageService> _storageService = new();
    private readonly Mock<IBrollNormalizer> _normalizer = new();
    private readonly Mock<IMusicCatalogProvider> _musicCatalog = new();
    private readonly Mock<IPexelsClient> _pexels = new();
    private readonly Mock<IPathResolver> _pathResolver = new();
    private readonly Mock<ILogger<MediaModule>> _logger = new();

    private MediaModule CreateModule()
    {
        _pathResolver.Setup(p => p.ResolveSafePath(It.IsAny<string>(), It.IsAny<string?>())).Returns((string s, string? _) => s);
        _pathResolver.Setup(p => p.SanitizeFileName(It.IsAny<string>())).Returns((string s) => s);

        return new MediaModule(
            _repo.Object,
            _storageService.Object,
            _normalizer.Object,
            _musicCatalog.Object,
            _pexels.Object,
            _pathResolver.Object,
            _logger.Object);
    }

    [Fact]
    public async Task GetAssetByIdAsync_InvalidId_ShouldThrowNotFound()
    {
        var module = CreateModule();
        await Assert.ThrowsAsync<ResourceNotFoundException>(() => module.GetAssetByIdAsync("nonexistent-id"));
    }

    [Fact]
    public async Task GetAssetsAsync_Paged_ShouldReturnPagedResult()
    {
        var module = CreateModule();
        _repo.Setup(r => r.CountAsync(It.IsAny<MediaType?>(), It.IsAny<CancellationToken>())).ReturnsAsync(25);
        _repo.Setup(r => r.GetPagedAsync(It.IsAny<MediaType?>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<MediaAsset>());

        var result = await module.GetAssetsAsync(null, page: 2, pageSize: 10);
        Assert.Equal(25, result.TotalCount);
        Assert.Equal(2, result.Page);
        Assert.Equal(10, result.PageSize);
    }

    [Fact]
    public async Task DeleteAssetAsync_InvalidId_ShouldThrowNotFound()
    {
        var module = CreateModule();
        await Assert.ThrowsAsync<ResourceNotFoundException>(() => module.DeleteAssetAsync("bad-id"));
    }

    [Fact]
    public void MediaType_ShouldHaveExpectedValues()
    {
        Assert.True(Enum.IsDefined(typeof(MediaType), MediaType.Video));
        Assert.True(Enum.IsDefined(typeof(MediaType), MediaType.Image));
        Assert.True(Enum.IsDefined(typeof(MediaType), MediaType.Audio));
    }

    [Fact]
    public async Task GetMusicCatalogAsync_ShouldDelegateToProvider()
    {
        var expected = new List<MusicTrackDto>
        {
            new("t1", "Track 1", "Lo-Fi", "peaceful", 120.0, "music/t1.mp3", 85)
        };

        _musicCatalog.Setup(m => m.GetTracksAsync("peaceful", It.IsAny<CancellationToken>()))
            .ReturnsAsync(expected);

        var module = CreateModule();
        var result = await module.GetMusicCatalogAsync("peaceful");

        Assert.Single(result);
        Assert.Equal("Track 1", result[0].Name);
        _musicCatalog.Verify(m => m.GetTracksAsync("peaceful", It.IsAny<CancellationToken>()), Times.Once);
    }
}
