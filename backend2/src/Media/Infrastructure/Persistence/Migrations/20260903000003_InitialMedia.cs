using System;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MediaContext.Infrastructure.Persistence.Migrations;

public partial class InitialMedia : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "media_assets",
            columns: table => new
            {
                Id = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                Title = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                Type = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                Source = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                StoragePath = table.Column<string>(type: "TEXT", maxLength: 512, nullable: false),
                Extension = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                FileSizeBytes = table.Column<long>(type: "INTEGER", nullable: false),
                Dimensions = table.Column<string>(type: "TEXT", maxLength: 32, nullable: true),
                Duration = table.Column<double>(type: "REAL", nullable: true),
                Fps = table.Column<double>(type: "REAL", nullable: true),
                IsNormalized = table.Column<bool>(type: "INTEGER", nullable: false),
                NormalizedStoragePath = table.Column<string>(type: "TEXT", maxLength: 512, nullable: true),
                Sha256Hash = table.Column<string>(type: "TEXT", maxLength: 128, nullable: true),
                CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_media_assets", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_media_assets_IsNormalized",
            table: "media_assets",
            column: "IsNormalized");

        migrationBuilder.CreateIndex(
            name: "IX_media_assets_Source",
            table: "media_assets",
            column: "Source");

        migrationBuilder.CreateIndex(
            name: "IX_media_assets_Type",
            table: "media_assets",
            column: "Type");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "media_assets");
    }
}
