using System.Text;
using Kernel.Ports;
using LLama;

namespace Integrations.LLM.Local;

public interface IChatTemplateFormatter
{
    string Format(IReadOnlyList<LlmPromptMessage> messages);
    IReadOnlyList<string> StopTokens { get; }
}

public sealed class ChatMlFormatter : IChatTemplateFormatter
{
    public IReadOnlyList<string> StopTokens => ["<|im_end|>", "<|endoftext|>"];

    public string Format(IReadOnlyList<LlmPromptMessage> messages)
    {
        var sb = new StringBuilder();
        foreach (var msg in messages)
        {
            var role = msg.Role.ToLowerInvariant() switch
            {
                "system" => "system",
                "assistant" or "model" => "assistant",
                _ => "user"
            };
            sb.Append("<|im_start|>").Append(role).Append('\n');
            sb.Append(msg.Content.Trim()).Append("<|im_end|>\n");
        }
        sb.Append("<|im_start|>assistant\n");
        return sb.ToString();
    }
}

public sealed class Llama3Formatter : IChatTemplateFormatter
{
    public IReadOnlyList<string> StopTokens => ["<|eot_id|>", "<|end_of_text|>"];

    public string Format(IReadOnlyList<LlmPromptMessage> messages)
    {
        var sb = new StringBuilder("<|begin_of_text|>");
        foreach (var msg in messages)
        {
            var role = msg.Role.ToLowerInvariant() switch
            {
                "system" => "system",
                "assistant" or "model" => "assistant",
                _ => "user"
            };
            sb.Append("<|start_header_id|>").Append(role).Append("<|end_header_id|>\n\n");
            sb.Append(msg.Content.Trim()).Append("<|eot_id|>");
        }
        sb.Append("<|start_header_id|>assistant<|end_header_id|>\n\n");
        return sb.ToString();
    }
}

public sealed class GemmaFormatter : IChatTemplateFormatter
{
    public IReadOnlyList<string> StopTokens => ["<end_of_turn>", "<eos>"];

    public string Format(IReadOnlyList<LlmPromptMessage> messages)
    {
        var sb = new StringBuilder();
        var systemMsg = messages.FirstOrDefault(m => m.Role.Equals("system", StringComparison.OrdinalIgnoreCase))?.Content;
        var conversation = messages.Where(m => !m.Role.Equals("system", StringComparison.OrdinalIgnoreCase)).ToList();

        bool firstUser = true;
        foreach (var msg in conversation)
        {
            if (msg.Role.Equals("user", StringComparison.OrdinalIgnoreCase))
            {
                sb.Append("<start_of_turn>user\n");
                if (firstUser && !string.IsNullOrWhiteSpace(systemMsg))
                {
                    sb.Append("[System Instructions]\n").Append(systemMsg.Trim()).Append("\n\n");
                    firstUser = false;
                }
                sb.Append(msg.Content.Trim()).Append("<end_of_turn>\n");
            }
            else
            {
                sb.Append("<start_of_turn>model\n");
                sb.Append(msg.Content.Trim()).Append("<end_of_turn>\n");
            }
        }
        sb.Append("<start_of_turn>model\n");
        return sb.ToString();
    }
}

public sealed class MistralFormatter : IChatTemplateFormatter
{
    public IReadOnlyList<string> StopTokens => ["</s>", "[/INST]"];

    public string Format(IReadOnlyList<LlmPromptMessage> messages)
    {
        var sb = new StringBuilder();
        var systemMsg = messages.FirstOrDefault(m => m.Role.Equals("system", StringComparison.OrdinalIgnoreCase))?.Content;
        var userMsg = string.Join("\n\n", messages.Where(m => m.Role.Equals("user", StringComparison.OrdinalIgnoreCase)).Select(m => m.Content.Trim()));

        sb.Append("<s>[INST] ");
        if (!string.IsNullOrWhiteSpace(systemMsg))
        {
            sb.Append(systemMsg.Trim()).Append("\n\n");
        }
        sb.Append(userMsg).Append(" [/INST]");
        return sb.ToString();
    }
}

public static class ChatTemplateResolver
{
    public static IChatTemplateFormatter Resolve(LLamaWeights? weights, string modelPath)
    {
        if (weights != null)
        {
            if (weights.Metadata.TryGetValue("tokenizer.chat_template", out var template) && !string.IsNullOrWhiteSpace(template))
            {
                if (template.Contains("<|im_start|>")) return new ChatMlFormatter();
                if (template.Contains("<start_of_turn>")) return new GemmaFormatter();
                if (template.Contains("<|start_header_id|>") || template.Contains("<|eot_id|>")) return new Llama3Formatter();
                if (template.Contains("[INST]")) return new MistralFormatter();
            }

            if (weights.Metadata.TryGetValue("general.architecture", out var arch) && !string.IsNullOrWhiteSpace(arch))
            {
                var archLower = arch.ToLowerInvariant();
                if (archLower.Contains("qwen") || archLower.Contains("deepseek")) return new ChatMlFormatter();
                if (archLower.Contains("gemma")) return new GemmaFormatter();
                if (archLower.Contains("llama")) return new Llama3Formatter();
                if (archLower.Contains("mistral")) return new MistralFormatter();
            }
        }

        var pathLower = modelPath.ToLowerInvariant();
        if (pathLower.Contains("qwen") || pathLower.Contains("deepseek") || pathLower.Contains("chatml")) return new ChatMlFormatter();
        if (pathLower.Contains("gemma")) return new GemmaFormatter();
        if (pathLower.Contains("llama-3") || pathLower.Contains("llama3")) return new Llama3Formatter();
        if (pathLower.Contains("mistral") || pathLower.Contains("mixtral")) return new MistralFormatter();

        return new ChatMlFormatter(); // Современный стандарт по умолчанию
    }
}