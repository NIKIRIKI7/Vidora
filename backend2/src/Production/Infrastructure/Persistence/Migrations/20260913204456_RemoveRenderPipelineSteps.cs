using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProductionContext.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class RemoveRenderPipelineSteps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Шаги SceneRendering/AudioMuxing/FinalAssembly удалены из PipelineStep (рендер убран).
            // CurrentStep хранится строкой, поэтому переносим существующие значения на последний
            // оставшийся шаг, иначе чтение проектов упадёт на неизвестном члене enum.
            migrationBuilder.Sql(
                "UPDATE production_projects SET CurrentStep = 'MotionCodeGeneration' " +
                "WHERE CurrentStep IN ('SceneRendering', 'AudioMuxing', 'FinalAssembly');");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Обратная миграция невозможна: исходное значение шага рендера не восстанавливается.
        }
    }
}
