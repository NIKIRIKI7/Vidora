namespace Integrations.LLM.Local;

/// <summary>
/// GBNF (GGML BNF) грамматика для принудительного вывода валидного JSON локальными моделями.
/// Предотвращает галлюцинации и вводный текст модели.
/// </summary>
public static class JsonGbnfGrammar
{
    public const string StrictJsonGbnf = """
    root   ::= object
    value  ::= object | array | string | number | ("true" | "false" | "null") ws

    object ::=
      "{" ws (
                string ":" ws value
        ("," ws string ":" ws value)*
      )? "}" ws

    array  ::=
      "[" ws (
                value
        ("," ws value)*
      )? "]" ws

    string ::=
      "\"" (
        [^"\\\x7F\x00-\x1F] |
        "\\" (["\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F])
      )* "\"" ws

    number ::= ("-"? ([0-9] | [1-9] [0-9]*)) ("." [0-9]+)? ([eE] [-+]? [0-9]+)? ws

    ws ::= ([ \t\n\r])*
    """;
}
