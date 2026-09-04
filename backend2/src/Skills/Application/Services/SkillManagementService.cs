using Kernel.Exceptions;
using Microsoft.Extensions.Logging;
using Skills.Application.Commands;
using Skills.Application.Queries;
using Skills.Contracts;
using Skills.Domain;
using Skills.Domain.Entities;
using Skills.Domain.Ports;

namespace Skills.Application.Services;

public sealed class SkillManagementService : ISkillManagementService
{
    private readonly ISkillRepository _repository;
    private readonly ILogger<SkillManagementService> _logger;

    public SkillManagementService(
        ISkillRepository repository,
        ILogger<SkillManagementService> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    public Task<IReadOnlyList<SkillDto>> GetAllSkillsAsync(CancellationToken ct = default) =>
        GetAllSkillsAsync(new GetAllSkillsQuery(), ct);

    public async Task<IReadOnlyList<SkillDto>> GetAllSkillsAsync(GetAllSkillsQuery query, CancellationToken ct = default)
    {
        var skills = await _repository.GetAllAsync(ct);
        return skills.Select(MapToDto).ToList();
    }

    public Task<IReadOnlyList<SkillDto>> GetSkillsByStageAsync(SkillStage stage, bool onlyEnabled = false, CancellationToken ct = default) =>
        GetSkillsByStageAsync(new GetSkillsByStageQuery(stage, onlyEnabled), ct);

    public async Task<IReadOnlyList<SkillDto>> GetSkillsByStageAsync(GetSkillsByStageQuery query, CancellationToken ct = default)
    {
        var skills = await _repository.GetByStageAsync(query.Stage, query.OnlyEnabled, ct);
        return skills.Select(MapToDto).ToList();
    }

    public Task<SkillDto> GetSkillByIdAsync(string id, CancellationToken ct = default) =>
        GetSkillByIdAsync(new GetSkillByIdQuery(id), ct);

    public async Task<SkillDto> GetSkillByIdAsync(GetSkillByIdQuery query, CancellationToken ct = default)
    {
        var skill = await _repository.GetByIdAsync(query.Id, ct)
            ?? throw new ResourceNotFoundException("Skill", query.Id);
        return MapToDto(skill);
    }

    public async Task<SkillDto> CreateCustomSkillAsync(CreateCustomSkillCommand command, CancellationToken ct = default)
    {
        if (await _repository.ExistsAsync(command.Id, ct))
        {
            throw new ValidationException("id", $"Скил с идентификатором '{command.Id}' уже существует.");
        }

        var skill = Skill.CreateCustom(
            id: command.Id,
            name: command.Name,
            description: command.Description,
            stage: command.Stage,
            content: command.Content,
            priority: command.Priority,
            tags: command.Tags);

        await _repository.AddAsync(skill, ct);
        await _repository.SaveChangesAsync(ct);

        _logger.LogInformation("[Skills] Создан пользовательский скил: {SkillId} ({Stage})", skill.Id, skill.Stage);
        return MapToDto(skill);
    }

    public async Task<SkillDto> UpdateSkillAsync(UpdateSkillCommand command, CancellationToken ct = default)
    {
        var skill = await _repository.GetByIdAsync(command.Id, ct)
            ?? throw new ResourceNotFoundException("Skill", command.Id);

        skill.Update(
            name: command.Name,
            description: command.Description,
            content: command.Content,
            priority: command.Priority,
            isEnabled: command.IsEnabled,
            tags: command.Tags);

        await _repository.UpdateAsync(skill, ct);
        await _repository.SaveChangesAsync(ct);

        _logger.LogInformation("[Skills] Обновлен скил: {SkillId}, новая версия: {Version}", skill.Id, skill.Version);
        return MapToDto(skill);
    }

    public async Task<SkillDto> ResetSkillToDefaultAsync(ResetSkillToDefaultCommand command, CancellationToken ct = default)
    {
        var skill = await _repository.GetByIdAsync(command.Id, ct)
            ?? throw new ResourceNotFoundException("Skill", command.Id);

        skill.ResetToDefault();
        await _repository.UpdateAsync(skill, ct);
        await _repository.SaveChangesAsync(ct);

        _logger.LogInformation("[Skills] Скил сброшен к дефолту: {SkillId}, версия: {Version}", skill.Id, skill.Version);
        return MapToDto(skill);
    }

    public async Task DeleteSkillAsync(DeleteSkillCommand command, CancellationToken ct = default)
    {
        var skill = await _repository.GetByIdAsync(command.Id, ct)
            ?? throw new ResourceNotFoundException("Skill", command.Id);

        skill.PrepareDelete();
        await _repository.DeleteAsync(skill, ct);
        await _repository.SaveChangesAsync(ct);

        _logger.LogInformation("[Skills] Удален скил: {SkillId}", skill.Id);
    }

    private static SkillDto MapToDto(Skill s) => SkillDto.FromEntity(s, s.Content.EstimateTokens());
}
