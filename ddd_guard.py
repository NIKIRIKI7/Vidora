#!/usr/bin/env python3
"""
ddd-guard: Production-grade architectural linter for Python DDD projects.
Based on 'Learning Domain-Driven Design' by Vlad Khononov (O'Reilly).
"""

import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set


@dataclass(frozen=True)
class Rule:
    code: str
    name: str
    description: str


RULES = {
    "DDD001": Rule("DDD001", "Domain Layer Purity", "Domain cannot import infrastructure, application, presentation or framework I/O libraries"),
    "DDD002": Rule("DDD002", "Application Flow Direction", "Application layer cannot import presentation/UI framework primitives"),
    "DDD003": Rule("DDD003", "Port Ownership", "Port interfaces must reside in domain/application, never in infrastructure"),
    "DDD004": Rule("DDD004", "Bounded Context Isolation", "Direct imports of private modules from another bounded context are forbidden"),
    "DDD006": Rule("DDD006", "Aggregate Reference by ID", "Aggregates must reference other aggregates by ID, not by direct object pointer"),
    "DDD007": Rule("DDD007", "Multiple Aggregate Mutation", "Use case cannot mutate/save more than one aggregate instance directly"),
    "DDD009": Rule("DDD009", "Value Object Immutability", "Value Objects must be immutable (frozen=True) and must not define an 'id' field"),
    "DDD010": Rule("DDD010", "Domain Event Past Tense", "Domain Events must be named in the past tense (*Created, *Placed, *Event)"),
    "DDD011": Rule("DDD011", "No In-Aggregate Dispatch", "Aggregates cannot inject or call message buses directly; use recorded events / outbox"),
    "DDD013": Rule("DDD013", "Stateless Domain Service", "Domain Services must be stateless"),
}


@dataclass
class Violation:
    rule: Rule
    file_path: Path
    line: int
    message: str
    hint: str


class DDDAstVisitor(ast.NodeVisitor):
    def __init__(self, file_path: Path, root_path: Path):
        self.file_path = file_path
        self.root_path = root_path
        self.violations: List[Violation] = []
        
        # Контекст текущего файла
        self.bounded_context, self.layer = self._resolve_layer(file_path, root_path)
        
        self.forbidden_domain_frameworks = {
            "fastapi", "flask", "django", "starlette", "tornado",
            "sqlalchemy", "tortoise", "ormar", "peewee", "pony",
            "celery", "aiohttp", "httpx", "requests", "urllib3", "pika"
        }
        self.past_tense_endings = (
            "ed", "created", "updated", "deleted", "placed", "submitted",
            "confirmed", "failed", "processed", "closed", "opened", "initialized", "event"
        )

    def _resolve_layer(self, file_path: Path, root: Path) -> tuple[Optional[str], Optional[str]]:
        try:
            rel = file_path.relative_to(root)
            parts = rel.parts
            if len(parts) >= 2:
                # Пример структуры: src/billing/domain/...
                bc = parts[0]
                layer = parts[1].lower() if parts[1].lower() in {
                    "domain", "application", "infrastructure", "presentation", "ports"
                } else None
                return bc, layer
        except Exception:
            pass
        return None, None

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            self._check_import(alias.name, node.lineno)
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom):
        if node.module:
            self._check_import(node.module, node.lineno)
        self.generic_visit(node)

    def _check_import(self, module_name: str, line_no: int):
        # DDD001: Чистота слоя Domain
        if self.layer == "domain":
            parts = module_name.split(".")
            # Запрет на импорт внешних слоев
            for bad_layer in ("infrastructure", "application", "presentation"):
                if bad_layer in parts:
                    self.violations.append(Violation(
                        rule=RULES["DDD001"],
                        file_path=self.file_path,
                        line=line_no,
                        message=f"Слой domain импортирует внешний слой '{bad_layer}' из '{module_name}'.",
                        hint="Используйте интерфейс (порт) в domain/ports и внедряйте реализацию через DI."
                    ))
            
            # Запрет на фреймворки в ядре
            root_mod = parts[0]
            if root_mod in self.forbidden_domain_frameworks:
                self.violations.append(Violation(
                    rule=RULES["DDD001"],
                    file_path=self.file_path,
                    line=line_no,
                    message=f"Фреймворк '{root_mod}' обнаружен в доменном слое.",
                    hint="Бизнес-модель должна быть выражена на чистом Python (Plain Old Python Objects)."
                ))

        # DDD002: Слой Application не должен знать о представлении
        if self.layer == "application":
            if any(ui in module_name.split(".") for ui in ("presentation", "fastapi", "flask")):
                self.violations.append(Violation(
                    rule=RULES["DDD002"],
                    file_path=self.file_path,
                    line=line_no,
                    message=f"Слой application зависит от представления: '{module_name}'.",
                    hint="Передавайте входные данные через чистые DTO-команды."
                ))

        # DDD004: Изоляция Bounded Context
        if self.bounded_context:
            parts = module_name.split(".")
            # Если импортируется другой контекст
            if len(parts) >= 2 and parts[0] not in {"shared_kernel", "common", self.bounded_context}:
                target_bc = parts[0]
                if len(parts) > 1 and parts[1] not in {"public", "contract", "api", "events"}:
                    self.violations.append(Violation(
                        rule=RULES["DDD004"],
                        file_path=self.file_path,
                        line=line_no,
                        message=f"Контекст '{self.bounded_context}' лезет во внутренние модули '{target_bc}.{parts[1]}'.",
                        hint=f"Используйте фасад 'src/{target_bc}/public.py' или опубликованный язык контрактов."
                    ))

    def visit_ClassDef(self, node: ast.ClassDef):
        name_lower = node.name.lower()

        # DDD009: Правила для Value Objects
        if "valueobject" in name_lower or "vo" in name_lower or "value_objects" in self.file_path.parts:
            self._audit_value_object(node)

        # DDD010: Правила именования Domain Events
        if "event" in name_lower or "events" in self.file_path.parts:
            self._audit_domain_event(node)

        # DDD006 & DDD011: Правила для Aggregates
        if "aggregate" in name_lower or "aggregates" in self.file_path.parts or "models" in self.file_path.parts:
            self._audit_aggregate(node)

        # DDD013: Domain Service Statelessness
        if "service" in name_lower and self.layer == "domain":
            self._audit_domain_service(node)

        self.generic_visit(node)

    def _audit_value_object(self, node: ast.ClassDef):
        # Проверка frozen=True
        is_frozen = False
        for dec in node.decorator_list:
            if isinstance(dec, ast.Call) and getattr(dec.func, "id", None) == "dataclass":
                for kw in dec.keywords:
                    if kw.arg == "frozen" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
                        is_frozen = True
            elif isinstance(dec, ast.Name) and dec.id == "dataclass":
                pass

        if not is_frozen:
            # Проверяем Pydantic model_config
            has_pydantic_frozen = any(
                isinstance(item, ast.Assign) and any(getattr(t, "id", "") == "model_config" for t in item.targets)
                for item in node.body
            )
            if not has_pydantic_frozen:
                self.violations.append(Violation(
                    rule=RULES["DDD009"],
                    file_path=self.file_path,
                    line=node.lineno,
                    message=f"Value Object '{node.name}' не объявлен как неизменяемый.",
                    hint="Используйте @dataclass(frozen=True) или ConfigDict(frozen=True)."
                ))

        # Проверка отсутствия поля id
        for item in node.body:
            if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                if item.target.id == "id" and not node.name.endswith("Id"):
                    self.violations.append(Violation(
                        rule=RULES["DDD009"],
                        file_path=self.file_path,
                        line=item.lineno,
                        message=f"У Value Object '{node.name}' обнаружен идентификатор '{item.target.id}'.",
                        hint="Value Objects идентифицируются значениями свойств, у них не может быть независимого ID."
                    ))

    def _audit_domain_event(self, node: ast.ClassDef):
        # Имя должно быть в прошедшем времени
        name = node.name
        if not any(name.lower().endswith(ending) for ending in self.past_tense_endings):
            self.violations.append(Violation(
                rule=RULES["DDD010"],
                file_path=self.file_path,
                line=node.lineno,
                message=f"Доменное событие '{name}' сформулировано не в прошедшем времени.",
                hint="Событие описывает свершившийся факт: OrderPaid, InvoiceIssued, TicketEscalated."
            ))

    def _audit_aggregate(self, node: ast.ClassDef):
        for item in node.body:
            # DDD006: Проверка типов полей агрегата на ссылки на другие агрегаты
            if isinstance(item, ast.AnnAssign) and isinstance(item.target, ast.Name):
                field_name = item.target.id
                type_annot = ast.unparse(item.annotation)
                # Сигнатура подозрительных типов (User, Agent, Account вместо UserId, AgentId)
                if field_name in {"agent", "customer", "user", "order", "account", "ticket"}:
                    if not (type_annot.endswith("Id") or type_annot in {"UUID", "str", "int"}):
                        self.violations.append(Violation(
                            rule=RULES["DDD006"],
                            file_path=self.file_path,
                            line=item.lineno,
                            message=f"Агрегат ссылается на внешний агрегат объектом: '{field_name}: {type_annot}'.",
                            hint=f"Используйте внешний идентификатор: '{field_name}_id: {type_annot}Id'."
                        ))

            # DDD011: Проверка на вызов шины сообщений внутри методов агрегата
            if isinstance(item, ast.FunctionDef):
                for param in item.args.args:
                    if any(bus_term in param.arg.lower() for bus_term in ("bus", "publisher", "sender", "broker")):
                        self.violations.append(Violation(
                            rule=RULES["DDD011"],
                            file_path=self.file_path,
                            line=item.lineno,
                            message=f"Метод агрегата '{item.name}' принимает шину сообщений '{param.arg}'.",
                            hint="Агрегат должен сохранять события в массив self._events. Публикацию выполняет Outbox."
                        ))

    def _audit_domain_service(self, node: ast.ClassDef):
        for item in node.body:
            if isinstance(item, ast.FunctionDef) and item.name == "__init__":
                for sub in item.body:
                    if isinstance(sub, ast.Assign):
                        for t in sub.targets:
                            if isinstance(t, ast.Attribute) and isinstance(t.value, ast.Name) and t.value.id == "self":
                                # Служба хранит мутабельное состояние
                                if t.attr not in {"_repo", "_gateway", "_client", "_calculator"}:
                                    self.violations.append(Violation(
                                        rule=RULES["DDD013"],
                                        file_path=self.file_path,
                                        line=sub.lineno,
                                        message=f"Доменная служба '{node.name}' сохраняет внутреннее состояние: 'self.{t.attr}'.",
                                        hint="Доменные службы должны быть stateless. Передавайте параметры напрямую в методы."
                                    ))


class DDDLinter:
    def __init__(self, target_dir: str):
        self.target_dir = Path(target_dir).resolve()

    def check(self) -> List[Violation]:
        all_violations = []
        for file in self.target_dir.rglob("*.py"):
            if self._should_skip(file):
                continue
            try:
                tree = ast.parse(file.read_text(encoding="utf-8"), filename=str(file))
                visitor = DDDAstVisitor(file, self.target_dir)
                visitor.visit(tree)
                all_violations.extend(visitor.violations)
            except SyntaxError:
                continue
        return all_violations

    def _should_skip(self, file: Path) -> bool:
        # Внешние/сгенерированные/фронтенд/модельные деревья не сканируем:
        # зависимости Python (site-packages, venv-*), модели (ai-models), фронтенд,
        # node_modules и сборки — туда линтер не должен лезть.
        ignored_dirs = {
            ".git", "__pycache__", "migrations", "tests", "node_modules",
            "dist", "build", ".next", "ai-models", "data_storage",
            "frontend", "remotion-project", "out", "public", "site-packages",
        }
        return any(
            p in ignored_dirs or p.lower().startswith("venv")
            for p in file.parts
        )


def cli():
    path = sys.argv[1] if len(sys.argv) > 1 else "."
    linter = DDDLinter(path)
    violations = linter.check()

    if not violations:
        print("\033[92m✔ [DDD-GUARD] Архитектурный аудит пройден: нарушений DDD не обнаружено!\033[0m")
        sys.exit(0)

    print(f"\033[91m✖ [DDD-GUARD] Обнаружено {len(violations)} архитектурных нарушений:\033[0m\n")
    for v in violations:
        rel_file = v.file_path.relative_to(linter.target_dir)
        print(f"  \033[93m{rel_file}:{v.line}\033[0m — \033[1m[{v.rule.code} {v.rule.name}]\033[0m")
        print(f"    │ {v.message}")
        print(f"    └─► \033[96mСовет: {v.hint}\033[0m\n")

    sys.exit(1)


if __name__ == "__main__":
    cli()
