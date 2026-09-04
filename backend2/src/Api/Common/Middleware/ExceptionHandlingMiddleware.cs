using System.Net;
using System.Text.Json;
using Kernel.Exceptions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Api.Common.Middleware;

public sealed class ExceptionHandlingMiddleware
{
    private const string InternalServerErrorCode = "INTERNAL_SERVER_ERROR";
    private const string RequestTimeoutErrorCode = "REQUEST_TIMEOUT";

    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;
    private readonly IHostEnvironment _environment;

    public ExceptionHandlingMiddleware(
        RequestDelegate next,
        ILogger<ExceptionHandlingMiddleware> logger,
        IHostEnvironment environment)
    {
        _next = next;
        _logger = logger;
        _environment = environment;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (DomainException ex)
        {
            _logger.LogWarning(ex, "Доменное исключение [{ErrorCode}] на {Path}: {Message}",
                ex.ErrorCode, context.Request.Path, ex.Message);

            await WriteResponseAsync(context, ex.StatusCode, ErrorEnvelope.FromException(ex));
        }
        catch (OperationCanceledException ex) when (context.RequestAborted.IsCancellationRequested)
        {
            // Клиент оборвал HTTP-соединение — не пишем в закрытый сокет
            _logger.LogInformation(ex, "Клиент прервал запрос на {Path}", context.Request.Path);
        }
        catch (OperationCanceledException ex)
        {
            // Внутренний таймаут/отмена по CancellationTokenSource
            _logger.LogWarning(ex, "Внутренний таймаут выполнения на {Path}", context.Request.Path);

            var envelope = new ErrorEnvelope
            {
                ErrorCode = RequestTimeoutErrorCode,
                Detail = "Время ожидания выполнения запроса истекло.",
                Details = _environment.IsDevelopment() ? new { ex.Message } : null
            };

            await WriteResponseAsync(context, StatusCodes.Status504GatewayTimeout, envelope);
        }
        catch (Exception ex)
        {
            _logger.LogCritical(ex, "Необработанный системный сбой на {Path}: {Message}",
                context.Request.Path, ex.Message);

            var envelope = new ErrorEnvelope
            {
                ErrorCode = InternalServerErrorCode,
                Detail = "Внутренняя непредвиденная ошибка сервера. Подробности зафиксированы в журнале.",
                Details = _environment.IsDevelopment()
                    ? new { ex.Message, ex.StackTrace }
                    : null
            };

            await WriteResponseAsync(context, (int)HttpStatusCode.InternalServerError, envelope);
        }
    }

    private static async Task WriteResponseAsync(HttpContext context, int statusCode, ErrorEnvelope envelope)
    {
        if (context.Response.HasStarted)
        {
            return;
        }

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = statusCode;
        await context.Response.WriteAsync(JsonSerializer.Serialize(envelope));
    }
}
