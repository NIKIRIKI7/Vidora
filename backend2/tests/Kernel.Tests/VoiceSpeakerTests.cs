using Kernel.Exceptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Voice.Domain;
using Voice.Domain.Entities;
using Voice.Domain.Events;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;
using Voice.Infrastructure.Persistence;
using Xunit;

namespace Kernel.Tests;

public class VoiceSpeakerTests
{
    [Fact]
    public void SpeakerId_New_ShouldGenerateValidId()
    {
        var id = SpeakerId.New();
        Assert.NotNull(id.Value);
        Assert.StartsWith("spk-", id.Value);
        Assert.Matches(@"^[a-z0-9_\-]+$", id.Value);
    }

    [Fact]
    public void SpeakerId_InvalidFormat_ShouldThrowValidation()
    {
        Assert.Throws<ValidationException>(() => new SpeakerId(""));
        Assert.Throws<ValidationException>(() => new SpeakerId("   "));
    }

    [Fact]
    public void SpeakerProfile_CreateBuiltIn_ShouldInitializeCorrectly()
    {
        var profile = SpeakerProfile.CreateBuiltIn(
            new SpeakerId("alloy"), "Alloy", VoiceEngineType.CloudOpenAi, "multilingual", "Neutral");

        Assert.Equal("alloy", profile.SpeakerId.Value);
        Assert.Equal("Alloy", profile.Name);
        Assert.Equal(SpeakerSourceType.BuiltIn, profile.SourceType);
        Assert.Equal(VoiceEngineType.CloudOpenAi, profile.Engine);
        Assert.True(profile.IsDefault);
        Assert.True(profile.IsActive);
        Assert.Empty(profile.DomainEvents);
    }

    [Fact]
    public void SpeakerProfile_Deactivate_BuiltIn_ShouldThrowDomainConflict()
    {
        var profile = SpeakerProfile.CreateBuiltIn(
            new SpeakerId("alloy"), "Alloy", VoiceEngineType.CloudOpenAi, "multilingual");

        Assert.Throws<DomainConflictException>(() => profile.Deactivate());
    }

    [Fact]
    public void SpeakerProfile_UpdateName_BuiltIn_ShouldThrowDomainConflict()
    {
        var profile = SpeakerProfile.CreateBuiltIn(
            new SpeakerId("alloy"), "Alloy", VoiceEngineType.CloudOpenAi, "multilingual");

        Assert.Throws<DomainConflictException>(() => profile.UpdateName("New Name"));
    }

    [Fact]
    public void SpeakerProfile_CreateDesigned_ShouldHaveDesignedEvents()
    {
        var spec = new VoiceDesignSpec("Deep male voice", "ru-RU", gender: "Male");
        var profile = SpeakerProfile.CreateDesigned(
            new SpeakerId("designed_001"), "Designed Voice", VoiceEngineType.LocalOmniVoice,
            spec, "Deep male voice for narration");

        Assert.Equal(SpeakerSourceType.Designed, profile.SourceType);
        Assert.False(profile.IsDefault);
        Assert.Equal("Deep male voice", profile.Description);
        Assert.Contains(profile.DomainEvents, e => e is SpeakerVoiceDesignedEvent);
    }

    [Fact]
    public void SpeakerProfile_CreateCloned_ShouldHaveCloneEvents()
    {
        var spec = new ClonedVoiceSpec(
            VoiceEngineType.LocalOmniVoice, "/path/to/ref.wav", "My Clone",
            referenceText: "Hello world");

        var profile = SpeakerProfile.CreateCloned(
            new SpeakerId("clone_001"), VoiceEngineType.LocalOmniVoice, spec);

        Assert.Equal(SpeakerSourceType.Cloned, profile.SourceType);
        Assert.Equal("/path/to/ref.wav", profile.CloneReferenceAudioPath);
        Assert.Equal("Hello world", profile.CloneReferenceText);
        Assert.Contains(profile.DomainEvents, e => e is SpeakerClonedEvent);
    }

    private static (VoiceDbContext db, ServiceProvider sp) CreateInMemoryDb()
    {
        var sp = new ServiceCollection()
            .AddEntityFrameworkSqlite()
            .BuildServiceProvider();

        var options = new DbContextOptionsBuilder<VoiceDbContext>()
            .UseSqlite("Data Source=:memory:")
            .UseInternalServiceProvider(sp)
            .Options;

        var db = new VoiceDbContext(options);
        return (db, sp);
    }

    [Fact]
    public async Task EfSpeakerProfileRepository_InMemorySqlite_ShouldPersistAndRetrieve()
    {
        var (db, sp) = CreateInMemoryDb();
        await using var _ = db;
        await using var __ = sp;
        await db.Database.OpenConnectionAsync();
        await db.Database.EnsureCreatedAsync();

        var repo = new EfSpeakerProfileRepository(db, new Microsoft.Extensions.Logging.Abstractions.NullLogger<EfSpeakerProfileRepository>());

        var profile = SpeakerProfile.CreateBuiltIn(
            new SpeakerId("alloy"), "Alloy", VoiceEngineType.CloudOpenAi, "multilingual", "Neutral");

        await repo.AddAsync(profile);
        await repo.SaveChangesAsync();

        var retrieved = await repo.GetByIdAsync(profile.Id);
        Assert.NotNull(retrieved);
        Assert.Equal("Alloy", retrieved.Name);
        Assert.Equal("alloy", retrieved.SpeakerId.Value);
        Assert.Equal(VoiceEngineType.CloudOpenAi, retrieved.Engine);
        Assert.True(retrieved.IsDefault);
    }

    [Fact]
    public async Task EfSpeakerProfileRepository_ShouldSeedDefaultSpeakers()
    {
        var (db, sp) = CreateInMemoryDb();
        await using var _ = db;
        await using var __ = sp;
        await db.Database.OpenConnectionAsync();
        await db.Database.EnsureCreatedAsync();

        var defaults = new[]
        {
            SpeakerProfile.CreateBuiltIn(new SpeakerId("ru_speaker_sergey"), "Сергей", VoiceEngineType.LocalOmniVoice, "ru-RU", "Male"),
            SpeakerProfile.CreateBuiltIn(new SpeakerId("ru_speaker_elena"), "Елена", VoiceEngineType.LocalOmniVoice, "ru-RU", "Female"),
            SpeakerProfile.CreateBuiltIn(new SpeakerId("alloy"), "Alloy", VoiceEngineType.CloudOpenAi, "multilingual", "Neutral"),
            SpeakerProfile.CreateBuiltIn(new SpeakerId("echo"), "Echo", VoiceEngineType.CloudOpenAi, "multilingual", "Male"),
            SpeakerProfile.CreateBuiltIn(new SpeakerId("shimmer"), "Shimmer", VoiceEngineType.CloudOpenAi, "multilingual", "Female"),
            SpeakerProfile.CreateBuiltIn(new SpeakerId("male-qn-qingse"), "QingSe", VoiceEngineType.CloudMiniMax, "multilingual", "Male"),
        };

        await db.SpeakerProfiles.AddRangeAsync(defaults);
        await db.SaveChangesAsync();

        var all = await db.SpeakerProfiles.ToListAsync();
        Assert.Equal(6, all.Count);
        Assert.All(all, p => Assert.True(p.IsDefault));
        Assert.All(all, p => Assert.Equal(SpeakerSourceType.BuiltIn, p.SourceType));
    }

    [Fact]
    public async Task EfSpeakerProfileRepository_ShouldFilterActiveOnly()
    {
        var (db, sp) = CreateInMemoryDb();
        await using var _ = db;
        await using var __ = sp;
        await db.Database.OpenConnectionAsync();
        await db.Database.EnsureCreatedAsync();

        var repo = new EfSpeakerProfileRepository(db, new Microsoft.Extensions.Logging.Abstractions.NullLogger<EfSpeakerProfileRepository>());

        var active = SpeakerProfile.CreateBuiltIn(new SpeakerId("active_speaker"), "Active", VoiceEngineType.CloudOpenAi, "en");
        var inactive = SpeakerProfile.CreateDesigned(
            new SpeakerId("inactive_speaker"), "Inactive", VoiceEngineType.LocalOmniVoice,
            new VoiceDesignSpec("test", "en"), "desc");
        inactive.Deactivate();

        await repo.AddAsync(active);
        await repo.AddAsync(inactive);
        await repo.SaveChangesAsync();

        var activeProfiles = await repo.GetActiveAsync();
        Assert.Single(activeProfiles);
        Assert.Equal("active_speaker", activeProfiles[0].SpeakerId.Value);
    }

    [Fact]
    public void VoiceDesignSpec_ShouldValidateRequiredFields()
    {
        Assert.Throws<ValidationException>(() => new VoiceDesignSpec("", "ru-RU"));
        Assert.Throws<ValidationException>(() => new VoiceDesignSpec("desc", ""));
        Assert.Throws<ValidationException>(() => new VoiceDesignSpec("desc", "ru-RU", speed: 0.1));
        Assert.Throws<ValidationException>(() => new VoiceDesignSpec("desc", "ru-RU", speed: 5.0));

        var spec = new VoiceDesignSpec("Deep voice", "ru-RU", gender: "Male", speed: 1.2);
        Assert.Equal("Deep voice", spec.Description);
        Assert.Equal("ru-RU", spec.Language);
        Assert.Equal(1.2, spec.Speed);
    }

    [Fact]
    public void ClonedVoiceSpec_ShouldValidateRequiredFields()
    {
        Assert.Throws<ValidationException>(() => new ClonedVoiceSpec(VoiceEngineType.LocalOmniVoice, "", "Name"));
        Assert.Throws<ValidationException>(() => new ClonedVoiceSpec(VoiceEngineType.LocalOmniVoice, "/path.wav", ""));

        var spec = new ClonedVoiceSpec(
            VoiceEngineType.LocalOmniVoice, "/ref.wav", "My Clone",
            referenceText: "Hello", language: "en");

        Assert.Equal("/ref.wav", spec.ReferenceAudioPath);
        Assert.Equal("My Clone", spec.Name);
        Assert.Equal("Hello", spec.ReferenceText);
    }
}
