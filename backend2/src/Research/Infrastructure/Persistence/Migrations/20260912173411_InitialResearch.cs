using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Research.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialResearch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "research_runs",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    TopicQuery = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Niche = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    ErrorMessage = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_research_runs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "research_early_signals",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    ResearchRunId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Topic = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    KeywordClusterJson = table.Column<string>(type: "TEXT", nullable: false),
                    GrowthVelocityPercent = table.Column<double>(type: "REAL", nullable: false),
                    SupportingVideoCount = table.Column<int>(type: "INTEGER", nullable: false),
                    AggregateVph = table.Column<double>(type: "REAL", nullable: false),
                    Confidence = table.Column<double>(type: "REAL", nullable: false),
                    SourceUrl = table.Column<string>(type: "TEXT", maxLength: 512, nullable: false, defaultValue: ""),
                    SourcePlatform = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false, defaultValue: ""),
                    GrowthPct = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false, defaultValue: ""),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_research_early_signals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_research_early_signals_research_runs_ResearchRunId",
                        column: x => x.ResearchRunId,
                        principalTable: "research_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "research_opportunities",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    ResearchRunId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    AngleTitle = table.Column<string>(type: "TEXT", maxLength: 512, nullable: false),
                    HookHypothesis = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: false),
                    TargetAudience = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    RecommendedFormat = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    FrictionPoint = table.Column<string>(type: "TEXT", maxLength: 512, nullable: false),
                    WhyItWorks = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: false),
                    ReferenceVideoIdsJson = table.Column<string>(type: "TEXT", nullable: false),
                    competition_index = table.Column<double>(type: "REAL", nullable: false),
                    demand_velocity = table.Column<double>(type: "REAL", nullable: false),
                    opportunity_score = table.Column<double>(type: "REAL", nullable: false),
                    viral_confidence = table.Column<double>(type: "REAL", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_research_opportunities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_research_opportunities_research_runs_ResearchRunId",
                        column: x => x.ResearchRunId,
                        principalTable: "research_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "research_video_candidates",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    ResearchRunId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    VideoId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 512, nullable: false),
                    ChannelTitle = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    ChannelId = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    ChannelSubscriberCount = table.Column<long>(type: "INTEGER", nullable: false),
                    ViewCount = table.Column<long>(type: "INTEGER", nullable: false),
                    PublishedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    DurationSeconds = table.Column<double>(type: "REAL", nullable: false),
                    ThumbnailUrl = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: false),
                    TopCommentsJson = table.Column<string>(type: "TEXT", nullable: false),
                    outlier_multiplier = table.Column<double>(type: "REAL", nullable: false),
                    momentum_score = table.Column<double>(type: "REAL", nullable: false),
                    views_per_hour = table.Column<double>(type: "REAL", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_research_video_candidates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_research_video_candidates_research_runs_ResearchRunId",
                        column: x => x.ResearchRunId,
                        principalTable: "research_runs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_research_early_signals_ResearchRunId",
                table: "research_early_signals",
                column: "ResearchRunId");

            migrationBuilder.CreateIndex(
                name: "IX_research_opportunities_ResearchRunId",
                table: "research_opportunities",
                column: "ResearchRunId");

            migrationBuilder.CreateIndex(
                name: "IX_research_runs_CreatedAt",
                table: "research_runs",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_research_runs_Status",
                table: "research_runs",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_research_video_candidates_ResearchRunId",
                table: "research_video_candidates",
                column: "ResearchRunId");

            migrationBuilder.CreateIndex(
                name: "IX_research_video_candidates_VideoId",
                table: "research_video_candidates",
                column: "VideoId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "research_early_signals");

            migrationBuilder.DropTable(
                name: "research_opportunities");

            migrationBuilder.DropTable(
                name: "research_video_candidates");

            migrationBuilder.DropTable(
                name: "research_runs");
        }
    }
}
