using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProductionContext.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialProduction : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "production_projects",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Slug = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    RelativePath = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    CurrentStep = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    MontageSettings = table.Column<string>(type: "TEXT", nullable: false),
                    FinalVideoPath = table.Column<string>(type: "TEXT", maxLength: 512, nullable: true),
                    FinalDurationSeconds = table.Column<double>(type: "REAL", nullable: true),
                    FinalFileSizeBytes = table.Column<long>(type: "INTEGER", nullable: true),
                    ErrorMessage = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_production_projects", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "production_scenes",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    ProjectId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    SceneId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Index = table.Column<int>(type: "INTEGER", nullable: false),
                    Title = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    VisualNote = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: false),
                    StartSeconds = table.Column<double>(type: "REAL", nullable: false),
                    EndSeconds = table.Column<double>(type: "REAL", nullable: false),
                    SceneCodeId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    RenderedVideoAssetId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_production_scenes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_production_scenes_production_projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "production_projects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "production_scene_fragments",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    FragmentId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    SceneEntityId = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    Index = table.Column<int>(type: "INTEGER", nullable: false),
                    Text = table.Column<string>(type: "TEXT", maxLength: 4000, nullable: false),
                    VisualNote = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: false),
                    ContentHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    DeclaredStartSeconds = table.Column<double>(type: "REAL", nullable: false),
                    DeclaredEndSeconds = table.Column<double>(type: "REAL", nullable: false),
                    StartSeconds = table.Column<double>(type: "REAL", nullable: false),
                    EndSeconds = table.Column<double>(type: "REAL", nullable: false),
                    VoiceAssetId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    BrollAssetId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    IsMediaMissing = table.Column<bool>(type: "INTEGER", nullable: false),
                    IsAnimationMissing = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_production_scene_fragments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_production_scene_fragments_production_scenes_SceneEntityId",
                        column: x => x.SceneEntityId,
                        principalTable: "production_scenes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_production_projects_Slug",
                table: "production_projects",
                column: "Slug");

            migrationBuilder.CreateIndex(
                name: "IX_production_projects_Status",
                table: "production_projects",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_production_scene_fragments_Index",
                table: "production_scene_fragments",
                column: "Index");

            migrationBuilder.CreateIndex(
                name: "IX_production_scene_fragments_SceneEntityId",
                table: "production_scene_fragments",
                column: "SceneEntityId");

            migrationBuilder.CreateIndex(
                name: "IX_production_scenes_Index",
                table: "production_scenes",
                column: "Index");

            migrationBuilder.CreateIndex(
                name: "IX_production_scenes_ProjectId_SceneId",
                table: "production_scenes",
                columns: new[] { "ProjectId", "SceneId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "production_scene_fragments");

            migrationBuilder.DropTable(
                name: "production_scenes");

            migrationBuilder.DropTable(
                name: "production_projects");
        }
    }
}
