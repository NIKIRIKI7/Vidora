using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SystemContext.Infrastructure.Persistence.Migrations;

public partial class InitialSystem : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "system_settings",
            columns: table => new
            {
                Id = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                Value = table.Column<string>(type: "TEXT", maxLength: 4096, nullable: false),
                Description = table.Column<string>(type: "TEXT", maxLength: 512, nullable: false),
                DataType = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                IsReadOnly = table.Column<bool>(type: "INTEGER", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_system_settings", x => x.Id);
            });

        migrationBuilder.CreateTable(
            name: "ai_models",
            columns: table => new
            {
                Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                Name = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                Category = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                TargetDirectory = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                DownloadUrl = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: false),
                ExpectedSizeBytes = table.Column<long>(type: "INTEGER", nullable: false),
                DownloadedSizeBytes = table.Column<long>(type: "INTEGER", nullable: false),
                Status = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                ErrorMessage = table.Column<string>(type: "TEXT", maxLength: 1024, nullable: true),
                Sha256Checksum = table.Column<string>(type: "TEXT", maxLength: 128, nullable: true),
                Version = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                IsRequired = table.Column<bool>(type: "INTEGER", nullable: false),
                CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_ai_models", x => x.Id);
            });

        migrationBuilder.CreateTable(
            name: "system_maintenance_logs",
            columns: table => new
            {
                Id = table.Column<long>(type: "INTEGER", nullable: false)
                    .Annotation("Sqlite:Autoincrement", true),
                Operation = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                DurationMs = table.Column<long>(type: "INTEGER", nullable: false),
                IsSuccess = table.Column<bool>(type: "INTEGER", nullable: false),
                Details = table.Column<string>(type: "TEXT", nullable: true),
                CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_system_maintenance_logs", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_ai_models_Category",
            table: "ai_models",
            column: "Category");

        migrationBuilder.CreateIndex(
            name: "IX_ai_models_Status",
            table: "ai_models",
            column: "Status");

        migrationBuilder.CreateIndex(
            name: "IX_system_maintenance_logs_CreatedAt",
            table: "system_maintenance_logs",
            column: "CreatedAt");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "system_settings");
        migrationBuilder.DropTable(name: "ai_models");
        migrationBuilder.DropTable(name: "system_maintenance_logs");
    }
}
