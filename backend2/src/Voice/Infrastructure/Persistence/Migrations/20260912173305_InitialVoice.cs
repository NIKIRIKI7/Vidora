using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Voice.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialVoice : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "voice_speaker_profiles",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    SpeakerId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    SourceType = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    Engine = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Language = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    Gender = table.Column<string>(type: "TEXT", maxLength: 16, nullable: true),
                    IsDefault = table.Column<bool>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    DesignedDescription = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    CloneReferenceAudioPath = table.Column<string>(type: "TEXT", maxLength: 512, nullable: true),
                    CloneReferenceText = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    PreviewAudioPath = table.Column<string>(type: "TEXT", maxLength: 512, nullable: true),
                    LocalEngineId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    LocalEmbeddingPath = table.Column<string>(type: "TEXT", maxLength: 512, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_voice_speaker_profiles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "voice_tts_jobs",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Text = table.Column<string>(type: "TEXT", maxLength: 8000, nullable: false),
                    Spec = table.Column<string>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    RawAudioPath = table.Column<string>(type: "TEXT", maxLength: 512, nullable: true),
                    ProcessedAudioPath = table.Column<string>(type: "TEXT", maxLength: 512, nullable: true),
                    RegisteredMediaAssetId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    DurationSeconds = table.Column<double>(type: "REAL", nullable: true),
                    FileSizeBytes = table.Column<long>(type: "INTEGER", nullable: true),
                    Alignment = table.Column<string>(type: "TEXT", nullable: false),
                    ErrorMessage = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_voice_tts_jobs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_voice_speaker_profiles_IsActive",
                table: "voice_speaker_profiles",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_voice_speaker_profiles_SourceType",
                table: "voice_speaker_profiles",
                column: "SourceType");

            migrationBuilder.CreateIndex(
                name: "IX_voice_tts_jobs_CreatedAt",
                table: "voice_tts_jobs",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_voice_tts_jobs_Status",
                table: "voice_tts_jobs",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "voice_speaker_profiles");

            migrationBuilder.DropTable(
                name: "voice_tts_jobs");
        }
    }
}
