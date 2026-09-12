using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MotionContext.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialMotion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "motion_render_jobs",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    SceneCodeId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    TargetRevisionNumber = table.Column<int>(type: "INTEGER", nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    OutputPath = table.Column<string>(type: "TEXT", maxLength: 512, nullable: true),
                    ErrorMessage = table.Column<string>(type: "TEXT", maxLength: 2048, nullable: true),
                    StartedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    CompletedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    current_fps = table.Column<double>(type: "REAL", nullable: false),
                    rendered_frames = table.Column<int>(type: "INTEGER", nullable: false),
                    total_frames = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_motion_render_jobs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "motion_scene_codes",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    ProjectId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    SceneId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    CurrentRevisionNumber = table.Column<int>(type: "INTEGER", nullable: false),
                    duration_in_frames = table.Column<int>(type: "INTEGER", nullable: false),
                    fps = table.Column<int>(type: "INTEGER", nullable: false),
                    height = table.Column<int>(type: "INTEGER", nullable: false),
                    width = table.Column<int>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_motion_scene_codes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "motion_scene_revisions",
                columns: table => new
                {
                    Id = table.Column<long>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    SceneCodeId = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    RevisionNumber = table.Column<int>(type: "INTEGER", nullable: false),
                    SourceCode = table.Column<string>(type: "TEXT", nullable: false),
                    SourceHash = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    Origin = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_motion_scene_revisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_motion_scene_revisions_motion_scene_codes_SceneCodeId",
                        column: x => x.SceneCodeId,
                        principalTable: "motion_scene_codes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_motion_render_jobs_SceneCodeId",
                table: "motion_render_jobs",
                column: "SceneCodeId");

            migrationBuilder.CreateIndex(
                name: "IX_motion_render_jobs_Status",
                table: "motion_render_jobs",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_motion_scene_codes_ProjectId_SceneId",
                table: "motion_scene_codes",
                columns: new[] { "ProjectId", "SceneId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_motion_scene_revisions_SceneCodeId_RevisionNumber",
                table: "motion_scene_revisions",
                columns: new[] { "SceneCodeId", "RevisionNumber" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "motion_render_jobs");

            migrationBuilder.DropTable(
                name: "motion_scene_revisions");

            migrationBuilder.DropTable(
                name: "motion_scene_codes");
        }
    }
}
