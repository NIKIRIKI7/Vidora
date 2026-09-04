using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Skills.Infrastructure.Persistence.Migrations;

/// <inheritdoc />
public partial class InitialSkills : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "skills",
            columns: table => new
            {
                Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                Name = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                Description = table.Column<string>(type: "TEXT", maxLength: 512, nullable: false),
                Stage = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                Content = table.Column<string>(type: "TEXT", maxLength: 32000, nullable: false),
                DefaultContent = table.Column<string>(type: "TEXT", maxLength: 32000, nullable: true),
                Priority = table.Column<int>(type: "INTEGER", nullable: false),
                Version = table.Column<int>(type: "INTEGER", nullable: false),
                IsDefault = table.Column<bool>(type: "INTEGER", nullable: false),
                IsEnabled = table.Column<bool>(type: "INTEGER", nullable: false),
                Tags = table.Column<string>(type: "TEXT", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_skills", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_skills_IsEnabled",
            table: "skills",
            column: "IsEnabled");

        migrationBuilder.CreateIndex(
            name: "IX_skills_Priority",
            table: "skills",
            column: "Priority");

        migrationBuilder.CreateIndex(
            name: "IX_skills_Stage",
            table: "skills",
            column: "Stage");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "skills");
    }
}
