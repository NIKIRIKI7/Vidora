using System.Text.Json;
using Api.Common.Middleware;
using Kernel.Exceptions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Kernel.Tests;

public class ExceptionHandlingMiddlewareTests
{
    [Fact]
    public async Task InvokeAsync_DomainNotFoundException_ShouldReturn404AndEnvelope()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new ResourceNotFoundException("Scene", "scene-01"),
            NullLogger<ExceptionHandlingMiddleware>.Instance,
            new FakeHostEnvironment { EnvironmentName = Environments.Production });

        await middleware.InvokeAsync(context);

        Assert.Equal(404, context.Response.StatusCode);
        context.Response.Body.Seek(0, SeekOrigin.Begin);

        using var reader = new StreamReader(context.Response.Body);
        var body = await reader.ReadToEndAsync();
        var envelope = JsonSerializer.Deserialize<ErrorEnvelope>(body);

        Assert.NotNull(envelope);
        Assert.Equal("RESOURCE_NOT_FOUND", envelope.ErrorCode);
        Assert.Contains("scene-01", envelope.Detail);
    }

    [Fact]
    public async Task InvokeAsync_UnhandledException_InProduction_ShouldReturn500WithoutStackTrace()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new InvalidOperationException("Секретные детали базы данных"),
            NullLogger<ExceptionHandlingMiddleware>.Instance,
            new FakeHostEnvironment { EnvironmentName = Environments.Production });

        await middleware.InvokeAsync(context);

        Assert.Equal(500, context.Response.StatusCode);
        context.Response.Body.Seek(0, SeekOrigin.Begin);

        using var reader = new StreamReader(context.Response.Body);
        var body = await reader.ReadToEndAsync();
        var envelope = JsonSerializer.Deserialize<ErrorEnvelope>(body);

        Assert.NotNull(envelope);
        Assert.Equal("INTERNAL_SERVER_ERROR", envelope.ErrorCode);
        Assert.Null(envelope.Details);
    }

    [Fact]
    public async Task InvokeAsync_UnhandledException_InDevelopment_ShouldIncludeDetails()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new InvalidOperationException("Сбой для отладки"),
            NullLogger<ExceptionHandlingMiddleware>.Instance,
            new FakeHostEnvironment { EnvironmentName = Environments.Development });

        await middleware.InvokeAsync(context);

        Assert.Equal(500, context.Response.StatusCode);
        context.Response.Body.Seek(0, SeekOrigin.Begin);

        using var reader = new StreamReader(context.Response.Body);
        var body = await reader.ReadToEndAsync();
        var envelope = JsonSerializer.Deserialize<ErrorEnvelope>(body);

        Assert.NotNull(envelope);
        Assert.NotNull(envelope.Details);
    }

    [Fact]
    public async Task InvokeAsync_WhenClientAborts_ShouldNotWriteResponse()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        using var cts = new CancellationTokenSource();
        cts.Cancel(); // Имитируем разрыв сокета клиентом
        context.RequestAborted = cts.Token;

        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new OperationCanceledException(context.RequestAborted),
            NullLogger<ExceptionHandlingMiddleware>.Instance,
            new FakeHostEnvironment());

        await middleware.InvokeAsync(context);

        // При клиентском обрыве ответ не формируется
        Assert.Equal(200, context.Response.StatusCode); // Default unchanged
        Assert.Equal(0, context.Response.Body.Length);
    }

    [Fact]
    public async Task InvokeAsync_WhenInternalTimeout_ShouldReturn504()
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        using var internalCts = new CancellationTokenSource();
        internalCts.Cancel(); // Отмена внутренним таймаутом, context.RequestAborted НЕ взведен

        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new OperationCanceledException(internalCts.Token),
            NullLogger<ExceptionHandlingMiddleware>.Instance,
            new FakeHostEnvironment());

        await middleware.InvokeAsync(context);

        Assert.Equal(StatusCodes.Status504GatewayTimeout, context.Response.StatusCode);
        context.Response.Body.Seek(0, SeekOrigin.Begin);

        using var reader = new StreamReader(context.Response.Body);
        var body = await reader.ReadToEndAsync();
        var envelope = JsonSerializer.Deserialize<ErrorEnvelope>(body);

        Assert.NotNull(envelope);
        Assert.Equal("REQUEST_TIMEOUT", envelope.ErrorCode);
    }

    private sealed class FakeHostEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "Kernel.Tests";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
