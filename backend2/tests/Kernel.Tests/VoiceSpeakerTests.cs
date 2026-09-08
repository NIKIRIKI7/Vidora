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
        var spec = new VoiceDesignSpec("Deep male voice for narration");
        var profile = SpeakerProfile.CreateDesigned(
            new SpeakerId("designed_001"), VoiceEngineType.CloudOpenAi,
            spec, "Deep male voice for narration");

        Assert.Equal(SpeakerSourceType.Designed, profile.SourceType);
        Assert.False(profile.IsDefault);
        Assert.Equal("Deep male voice for narration", profile.Description);
        Assert.Equal("multilingual", profile.Language);
        Assert.Contains(profile.DomainEvents, e => e is SpeakerVoiceDesignedEvent);
    }

    [Fact]
    public void SpeakerProfile_CreateCloned_ShouldHaveCloneEvents()
    {
        var spec = new ClonedVoiceSpec(
            VoiceEngineType.CloudOpenAi, "/path/to/ref.wav", "My Clone",
            referenceText: "Hello world");

        var profile = SpeakerProfile.CreateCloned(
            new SpeakerId("clone_001"), VoiceEngineType.CloudOpenAi, spec);

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
            SpeakerProfile.CreateBuiltIn(new SpeakerId("alloy"), "Alloy", VoiceEngineType.CloudOpenAi, "multilingual", "Neutral"),
            SpeakerProfile.CreateBuiltIn(new SpeakerId("echo"), "Echo", VoiceEngineType.CloudOpenAi, "multilingual", "Male"),
            SpeakerProfile.CreateBuiltIn(new SpeakerId("shimmer"), "Shimmer", VoiceEngineType.CloudOpenAi, "multilingual", "Female"),
            SpeakerProfile.CreateBuiltIn(new SpeakerId("male-qn-qingse"), "QingSe", VoiceEngineType.CloudMiniMax, "multilingual", "Male"),
        };

        await db.SpeakerProfiles.AddRangeAsync(defaults);
        await db.SaveChangesAsync();

        var all = await db.SpeakerProfiles.ToListAsync();
        Assert.Equal(4, all.Count);
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
            new SpeakerId("inactive_speaker"), VoiceEngineType.CloudOpenAi,
            new VoiceDesignSpec("test"), "desc");
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
        Assert.Throws<ValidationException>(() => new VoiceDesignSpec(""));
        Assert.Throws<ValidationException>(() => new VoiceDesignSpec(new string('a', 2001)));

        var spec = new VoiceDesignSpec("Deep voice", localEngineId: "omni_voice_v1");
        Assert.Equal("Deep voice", spec.Prompt);
        Assert.Equal("omni_voice_v1", spec.LocalEngineId);
        Assert.Equal("Deep voice", spec.ToInstructString());
    }

    [Fact]
    public void ClonedVoiceSpec_ShouldValidateRequiredFields()
    {
        Assert.Throws<ValidationException>(() => new ClonedVoiceSpec(VoiceEngineType.CloudOpenAi, "", "Name"));
        Assert.Throws<ValidationException>(() => new ClonedVoiceSpec(VoiceEngineType.CloudOpenAi, "/path.wav", ""));

        var spec = new ClonedVoiceSpec(
            VoiceEngineType.CloudOpenAi, "/ref.wav", "My Clone",
            referenceText: "Hello", language: "en");

        Assert.Equal("/ref.wav", spec.ReferenceAudioPath);
        Assert.Equal("My Clone", spec.Name);
        Assert.Equal("Hello", spec.ReferenceText);
    }

    [Fact]
    public void VoiceSpec_ValidParameters_ShouldInstantiateSuccessfully()
    {
        var spec = new VoiceSpec(
            VoiceEngineType.CloudOpenAi,
            "alloy",
            AlignmentEngineType.Whisper,
            speed: 1.25,
            pitch: 0.8,
            guidanceScale: 3.5,
            numSteps: 40);

        Assert.Equal(1.25, spec.Speed);
        Assert.Equal(0.8, spec.Pitch);
        Assert.Equal(3.5, spec.GuidanceScale);
        Assert.Equal(40, spec.NumSteps);

        var defaults = new VoiceSpec(VoiceEngineType.CloudOpenAi, "alloy");
        Assert.Equal(2.0, defaults.GuidanceScale);
        Assert.Equal(24, defaults.NumSteps);
    }

    [Fact]
    public void VoiceSpec_InvalidGuidanceScale_ShouldThrowValidationException()
    {
        Assert.Throws<ValidationException>(() =>
            new VoiceSpec(VoiceEngineType.CloudOpenAi, "alloy", guidanceScale: 0.9));
        Assert.Throws<ValidationException>(() =>
            new VoiceSpec(VoiceEngineType.CloudOpenAi, "alloy", guidanceScale: 10.5));
    }

    [Fact]
    public void VoiceSpec_InvalidNumSteps_ShouldThrowValidationException()
    {
        Assert.Throws<ValidationException>(() =>
            new VoiceSpec(VoiceEngineType.CloudOpenAi, "alloy", numSteps: 7));
        Assert.Throws<ValidationException>(() =>
            new VoiceSpec(VoiceEngineType.CloudOpenAi, "alloy", numSteps: 129));
    }

    [Fact]
    public void VoiceSpec_InvalidPitch_ShouldThrowValidationException()
    {
        Assert.Throws<ValidationException>(() =>
            new VoiceSpec(VoiceEngineType.CloudOpenAi, "alloy", pitch: 0.4));
        Assert.Throws<ValidationException>(() =>
            new VoiceSpec(VoiceEngineType.CloudOpenAi, "alloy", pitch: 2.5));
    }
}
