using Api.Common.Middleware;
using Api.Endpoints.Media;
using Api.Endpoints.Motion;
using Api.Endpoints.Production;
using Api.Endpoints.Research;
using Api.Endpoints.Skills;
using Api.Endpoints.System;
using Api.Endpoints.Voice;
using Api.OpenApi;
using Api.WebSockets;
using Integrations;
using Integrations.YouTube;
using Kernel;
using Kernel.Platform.Persistence;
using MediaContext;
using MotionContext;
using ProductionContext;
using Research;
using Skills;
using SystemContext;
using Voice;

var builder = WebApplication.CreateBuilder(args);

// 1. CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// OpenAPI / Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new() { Title = "Vidora API", Version = "v1" });
    c.CustomSchemaIds(type => type.FullName?.Replace("+", "_"));
    c.OperationFilter<ApiDocumentationOperationFilter>();
});

// 2. Инфраструктура ядра
builder.Services.AddKernelServices(builder.Configuration, builder.Logging);

// 3. Интеграции
builder.Services.AddYouTubeIntegration(builder.Configuration);
builder.Services.AddIntegrationServices(builder.Configuration);

// 4. Контексты
builder.Services.AddSkillsContext(builder.Configuration);
builder.Services.AddSystemContext(builder.Configuration);
builder.Services.AddMediaContext(builder.Configuration);
builder.Services.AddVoiceContext(builder.Configuration);
builder.Services.AddMotionContext(builder.Configuration);
builder.Services.AddProductionContext(builder.Configuration);
builder.Services.AddResearchContext(builder.Configuration);

var app = builder.Build();

// CLI: dotnet run -- --migrate
if (args.Any(a => a.Equals("--migrate", StringComparison.OrdinalIgnoreCase) || a.Equals("migrate", StringComparison.OrdinalIgnoreCase)))
{
    using var scope = app.Services.CreateScope();
    var migrator = scope.ServiceProvider.GetRequiredService<DatabaseMigrationManager>();
    await migrator.ApplyAllMigrationsAsync();
    return;
}

app.UseCors("AllowAll");
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseWebSockets();

app.UseSwagger();
app.UseSwaggerUI(c => c.SwaggerEndpoint("/swagger/v1/swagger.json", "Vidora API v1"));

app.MapGet("/", () => Results.Json(new { service = "vidora-backend2", status = "ok" })).ExcludeFromDescription();
app.MapGet("/health", () => Results.Json(new { status = "healthy" })).Produces<HealthResponse>();
app.MapGet("/api/health", () => Results.Json(new { status = "healthy" })).Produces<HealthResponse>();

app.MapSkillsEndpoints();
app.MapSystemEndpoints();
app.MapMediaEndpoints();
app.MapVoiceEndpoints();
app.MapMotionEndpoints();
app.MapProductionEndpoints();
app.MapScenarioEngineEndpoints();
app.MapResearchEndpoints();
app.MapYouTubeAgentEndpoints();

app.MapWebSocketEndpoints();

app.Run();

public record HealthResponse(string status);
