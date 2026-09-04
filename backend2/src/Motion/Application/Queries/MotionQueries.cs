namespace MotionContext.Application.Queries;

public sealed record GetSceneCodeByIdQuery(string SceneCodeId);
public sealed record GetSceneRevisionQuery(string SceneCodeId, int RevisionNumber);
public sealed record GetRenderJobByIdQuery(string RenderJobId);
