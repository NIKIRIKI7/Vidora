using Api.Common.Middleware;
using Api.Endpoints.Media;
using Api.Endpoints.Motion;
using Api.Endpoints.Skills;
using Api.Endpoints.System;
using Api.Endpoints.Voice;
using Api.WebSockets;
using Integrations;
using Integrations.YouTube;
using Kernel;
using MediaContext;
using MotionContext;
using Skills;
using SystemContext;
using Voice;

var builder = WebApplication.CreateBuilder(args);

// 1. Инфраструктура ядра
builder.Services.AddKernelServices(builder.Configuration, builder.Logging);

// 2. Интеграции
builder.Services.AddYouTubeIntegration(builder.Configuration);
builder.Services.AddIntegrationServices(builder.Configuration);

// 3. Контексты
builder.Services.AddSkillsContext(builder.Configuration);
builder.Services.AddSystemContext(builder.Configuration);
builder.Services.AddMediaContext(builder.Configuration);
builder.Services.AddVoiceContext(builder.Configuration);
builder.Services.AddMotionContext(builder.Configuration);

var app = builder.Build();

app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseWebSockets();

app.MapGet("/", () => Results.Json(new { service = "vidora-backend2", status = "ok" }));
app.MapGet("/health", () => Results.Json(new { status = "healthy" }));

app.MapSkillsEndpoints();
app.MapSystemEndpoints();
app.MapMediaEndpoints();
app.MapVoiceEndpoints();
app.MapMotionEndpoints();

app.MapWebSocketEndpoints();

app.Run();
