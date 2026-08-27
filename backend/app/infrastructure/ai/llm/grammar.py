"""GBNF-грамматика для сэмплирования строго валидного JSON через llama-cpp."""

JSON_GBNF_GRAMMAR = r"""
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
    [^"\\] |
    "\\" (["\\/bfnrt] | "u" [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F] [0-9a-fA-F])
  )* "\"" ws

number ::= ("-"? ([0-9] | [1-9] [0-9]*)) ("." [0-9]+)? ([eE] [-+]? [0-9]+)? ws

ws ::= ([ \t\n\r])*
"""


def get_llama_json_grammar():
    """Возвращает LlamaGrammar для llama-cpp-python или None, если библиотека недоступна."""
    try:
        from llama_cpp import LlamaGrammar
        return LlamaGrammar.from_string(JSON_GBNF_GRAMMAR)
    except Exception:
        return None
