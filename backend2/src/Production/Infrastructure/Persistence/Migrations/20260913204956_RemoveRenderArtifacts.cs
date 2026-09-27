using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProductionContext.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveRenderArtifacts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RenderedVideoAssetId",
                table: "production_scenes");

            migrationBuilder.DropColumn(
                name: "FinalDurationSeconds",
                table: "production_projects");

            migrationBuilder.DropColumn(
                name: "FinalFileSizeBytes",
                table: "production_projects");

            migrationBuilder.DropColumn(
                name: "FinalVideoPath",
                table: "production_projects");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RenderedVideoAssetId",
                table: "production_scenes",
                type: "TEXT",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "FinalDurationSeconds",
                table: "production_projects",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "FinalFileSizeBytes",
                table: "production_projects",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FinalVideoPath",
                table: "production_projects",
                type: "TEXT",
                maxLength: 512,
                nullable: true);
        }
    }
}
