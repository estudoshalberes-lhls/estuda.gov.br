# -*- coding: utf-8 -*-
"""Local Python API and static web application for Central de Estudos."""
from __future__ import annotations

import base64
import hashlib
import html
import json
import math
import os
import re
import subprocess
import threading
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
import unicodedata
import sys

from flask import Flask, abort, jsonify, request, send_file, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.utils import secure_filename

MODULE_DIR = Path(__file__).resolve().parent
RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", MODULE_DIR))
BASE_DIR = Path(os.environ.get("CENTRALESTUDOS_DATA_DIR", MODULE_DIR)).resolve()
WEB_DIR = RESOURCE_DIR / "web"
QUESTIONS_DIR = BASE_DIR / "questoes"
SUBMITTED_SIMULATIONS_DIR = BASE_DIR / "simulados_enviados"
LAWS_DIR = BASE_DIR / "lei_seca"
PDFS_DIR = BASE_DIR / "pdfs_pessoais"
PROOFS_DIR = BASE_DIR / "provas"
PROOFS_WITH_KEY_DIR = BASE_DIR / "provas_com_gabarito"
SUMMARIES_DIR = BASE_DIR / "resumos_mapas"
REDACTIONS_DIR = BASE_DIR / "redacoes"
WEEKDAYS = [
    "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira",
    "Sexta-feira", "Sábado", "Domingo",
]
LOCK = threading.RLock()
app = Flask(__name__, static_folder=str(WEB_DIR), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024


def _data_path(name: str) -> Path:
    return BASE_DIR / name


def _read_json(path: Path, default):
    try:
        with path.open("r", encoding="utf-8") as stream:
            data = json.load(stream)
        return data
    except FileNotFoundError:
        return default
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Não foi possível ler {path.name}: {exc}") from exc


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    os.replace(temporary, path)


def _read_lines(path: Path) -> list[str]:
    try:
        return path.read_text(encoding="utf-8", errors="replace").splitlines()
    except FileNotFoundError:
        return []


def _write_lines(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(line.rstrip("\r\n") + "\n" for line in lines), encoding="utf-8")


def _safe_child(root: Path, *parts: str) -> Path:
    root = root.resolve()
    candidate = root.joinpath(*parts).resolve()
    if os.path.commonpath((str(root), str(candidate))) != str(root):
        abort(400, description="Caminho de arquivo inválido.")
    return candidate


def _clean_name(name: str, fallback: str = "Item") -> str:
    name = secure_filename((name or "").strip())
    return name or fallback


def _display_name(name: str) -> str:
    return re.sub(r"\s+", " ", name.rsplit(".", 1)[0].replace("_", " ")).strip()


def _read_text_file(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        try:
            from PyPDF2 import PdfReader
            return "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
        except Exception as exc:
            raise RuntimeError(f"Não foi possível extrair texto do PDF: {exc}") from exc
    if suffix == ".docx":
        try:
            with zipfile.ZipFile(path) as archive:
                body = archive.read("word/document.xml").decode("utf-8", errors="replace")
            body = re.sub(r"</w:p>", "\n", body)
            body = re.sub(r"<[^>]+>", "", body)
            return html.unescape(body)
        except (OSError, KeyError, zipfile.BadZipFile) as exc:
            raise RuntimeError(f"Não foi possível ler o documento: {exc}") from exc
    return path.read_text(encoding="utf-8", errors="replace")


def _normalize_question_options(prompt: str) -> str:
    marker = re.compile(r"(?<!\w)(?:\(([A-E])\)|([A-E])[).:\-])\s+", re.I)
    matches = list(marker.finditer(prompt))
    labels = {
        (match.group(1) or match.group(2)).upper()
        for match in matches
    }
    if len(labels) >= 2:
        return marker.sub(
            lambda match: f"[{(match.group(1) or match.group(2)).upper()}] ",
            prompt,
        )

    bare_marker = re.compile(r"(?m)^[ \t]*([A-E])(?=[ \t]+)")
    bare_matches = list(bare_marker.finditer(prompt))
    for index in range(len(bare_matches) - 4):
        sequence = bare_matches[index:index + 5]
        if [match.group(1) for match in sequence] != list("ABCDE"):
            continue
        if any(
            not prompt[sequence[offset].end():sequence[offset + 1].start()].strip()
            for offset in range(4)
        ):
            continue
        normalized = prompt
        for match in reversed(sequence):
            start, end = match.span(1)
            normalized = normalized[:start] + f"[{match.group(1)}]" + normalized[end:]
        return normalized
    return prompt


def _question_type(prompt: str, answer: str, explicit: str = "") -> str:
    if explicit.upper() in {"ME", "CE"}:
        return explicit.upper()
    prompt = _normalize_question_options(prompt)
    labels = set(re.findall(r"\[([A-E])\]", prompt, re.I))
    if len(labels) >= 3 or (answer in {"A", "B", "D"} and labels):
        return "ME"
    return "CE"


def _normalize_alternatives(value) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    alternatives = []
    for item in value:
        if not isinstance(item, dict):
            continue
        letter = str(item.get("letra") or item.get("key") or item.get("letter") or "").strip().upper()
        text = str(item.get("texto") or item.get("text") or "").strip()
        if re.fullmatch(r"[A-E]", letter) and text:
            alternatives.append({"letra": letter, "texto": text})
    return alternatives


def _normalize_answer(answer: str) -> str:
    answer = (answer or "").strip().upper()
    if answer.startswith("E") and ("ERRADO" in answer or answer == "E"):
        return "E"
    if answer.startswith("C") and ("CERTO" in answer or answer == "C"):
        return "C"
    match = re.search(r"\b([A-E])\b", answer)
    return match.group(1) if match else answer


def _parse_questions_file(path: Path) -> list[dict]:
    questions = []
    material = _display_name(path.name)
    for line_number, raw in enumerate(_read_lines(path), start=1):
        line = raw.strip().lstrip("\ufeff")
        if not line or line.startswith("#"):
            continue
        if line.startswith("{"):
            try:
                obj = json.loads(line)
                prompt = str(obj.get("enunciado", "")).strip()
                if _question_header_count(prompt) > 1:
                    continue
                alternatives = _normalize_alternatives(obj.get("alternativas"))
                if not alternatives:
                    prompt, alternatives = _split_exam_question(_normalize_question_options(prompt))
                answer = _normalize_answer(str(obj.get("gabarito", "")))
                comment = str(obj.get("comentario", "")).strip()
                explicit = str(obj.get("tipo", ""))
            except (json.JSONDecodeError, AttributeError):
                continue
        else:
            parts = [part.strip() for part in (line.split("|||") if "|||" in line else line.split("|"))]
            if len(parts) < 3:
                continue
            prompt = _normalize_question_options(parts[0])
            prompt, alternatives = _split_exam_question(prompt)
            answer = _normalize_answer(parts[1])
            comment = "|".join(parts[2:-1] if len(parts) >= 4 and parts[-1].upper() in {"ME", "CE"} else parts[2:]).strip()
            explicit = parts[-1] if len(parts) >= 4 and parts[-1].upper() in {"ME", "CE"} else ""
        if not prompt or not answer:
            continue
        identifier = hashlib.sha256(f"{path.name}:{line_number}:{prompt}".encode("utf-8")).hexdigest()[:20]
        questions.append({
            "id": identifier, "materia": material, "enunciado": prompt,
            "alternativas": alternatives,
            "gabarito": answer, "comentario": comment,
            "tipo": _question_type(prompt, answer, explicit)
            if explicit.upper() in {"ME", "CE"}
            else "ME" if alternatives else _question_type(prompt, answer),
        })
    return questions


def _question_header_count(prompt: str) -> int:
    return len(re.findall(
        r"(?im)^[ \t]*(?:quest(?:ão|ao)|question)[ \t]+\d{1,4}\b",
        prompt,
    ))


def _question_import_warnings() -> list[str]:
    warnings = []
    if not QUESTIONS_DIR.is_dir():
        return warnings
    for path in sorted(QUESTIONS_DIR.glob("*.txt"), key=lambda item: item.name.lower()):
        for line in _read_lines(path):
            if not line.lstrip().startswith("{"):
                continue
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            prompt = str(record.get("enunciado", "")) if isinstance(record, dict) else ""
            if _question_header_count(prompt) > 1:
                warnings.append(_display_name(path.name))
                break
    return warnings


def _all_questions() -> list[dict]:
    QUESTIONS_DIR.mkdir(exist_ok=True)
    return [
        question
        for path in sorted(QUESTIONS_DIR.glob("*.txt"))
        for question in _parse_questions_file(path)
    ]


def _submitted_simulations() -> list[dict]:
    SUBMITTED_SIMULATIONS_DIR.mkdir(exist_ok=True)
    simulations = []
    for path in sorted(SUBMITTED_SIMULATIONS_DIR.glob("*.json"), key=lambda item: item.name.lower()):
        record = _read_json(path, {})
        if isinstance(record, dict) and isinstance(record.get("questoes"), list):
            simulations.append(record)
    return sorted(simulations, key=lambda item: str(item.get("criado_em", "")), reverse=True)


def _ordered_simulation_questions(questions: list[dict]) -> list[dict]:
    indexed = list(enumerate(questions))
    return [
        question for _, question in sorted(
            indexed,
            key=lambda item: (
                item[1].get("numero") if isinstance(item[1].get("numero"), int) else item[0],
                item[0],
            ),
        )
    ]


def _submitted_simulation_questions() -> list[dict]:
    return [
        question
        for simulation in _submitted_simulations()
        for question in _ordered_simulation_questions(simulation["questoes"])
        if isinstance(question, dict)
    ]


def _simulation_results() -> list[dict]:
    records = _read_json(_data_path("simulados_realizados.json"), [])
    if not isinstance(records, list) or any(not isinstance(item, dict) for item in records):
        raise RuntimeError("O arquivo simulados_realizados.json possui uma estrutura inválida.")
    return records


def _simulation_result_title(result: dict) -> str:
    date = str(result.get("data", "")).strip().split(" ", 1)[0]
    if not date:
        try:
            date = datetime.fromisoformat(str(result.get("criado_em", ""))).strftime("%d/%m/%Y")
        except ValueError:
            date = "Data indisponível"
    if result.get("prova_id") and result.get("prova_id") != "montado":
        filename = str(result.get("arquivo") or result.get("titulo") or "Prova PDF")
        filename = filename.replace("\\", "/").rsplit("/", 1)[-1].strip()
        return f"Simulado enviado - {filename} - {date}"
    return f"Montado por disciplinas - {date}"


def _save_submitted_simulation(
    title: str,
    subject: str,
    filename: str,
    questions: list[dict],
) -> dict:
    simulation_id = uuid.uuid4().hex
    ordered = _ordered_simulation_questions(questions)
    for index, question in enumerate(ordered, start=1):
        question["id"] = hashlib.sha256(
            f"{simulation_id}:{index}:{question['enunciado']}".encode("utf-8")
        ).hexdigest()[:24]
        question["numero"] = index
        question["materia"] = subject
    created_at = datetime.now()
    record = {
        "id": simulation_id,
        "titulo": title,
        "materia": subject,
        "arquivo": filename,
        "data": created_at.strftime("%d/%m/%Y %H:%M"),
        "criado_em": created_at.isoformat(timespec="seconds"),
        "questoes": ordered,
    }
    SUBMITTED_SIMULATIONS_DIR.mkdir(exist_ok=True)
    with LOCK:
        _write_json(_safe_child(SUBMITTED_SIMULATIONS_DIR, f"{simulation_id}.json"), record)
    return record


def _parse_pipe_line(line: str, min_fields: int) -> list[str] | None:
    parts = line.split("|||") if "|||" in line else line.split("|")
    parts = [part.strip() for part in parts]
    return parts if len(parts) >= min_fields else None


def _annotations() -> list[dict]:
    rows = []
    for index, line in enumerate(_read_lines(_data_path("anotacoes_revisao.txt"))):
        parts = _parse_pipe_line(line, 4)
        if parts:
            text = " | ".join(parts[3:])
            question = None
            marker = "\t[[QUESTION_DETAILS:"
            if marker in text:
                text, encoded = text.rsplit(marker, 1)
                if encoded.endswith("]]"):
                    try:
                        decoded = base64.urlsafe_b64decode(encoded[:-2].encode("ascii"))
                        question = json.loads(decoded.decode("utf-8"))
                    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
                        raise RuntimeError(
                            "Os detalhes de uma questão no caderno de erros estão inválidos."
                        ) from exc
            if question is None and parts[2].casefold() == "erro em questão (auto)".casefold():
                legacy = re.fullmatch(
                    r"(?is)Item:\s*(.*?)\s*\(Marcado:\s*([A-E])\s*[/|]\s*Gabarito:\s*([A-E])\s*\)",
                    text,
                )
                if legacy:
                    prompt = legacy.group(1)
                    comment = ""
                    if " — " in prompt:
                        prompt, comment = prompt.rsplit(" — ", 1)
                    prompt, alternatives = _split_exam_question(prompt)
                    question = {
                        "enunciado": prompt,
                        "alternativas": _normalize_alternatives(alternatives),
                        "resposta": legacy.group(2).upper(),
                        "gabarito": legacy.group(3).upper(),
                        "comentario": comment,
                    }
                    text = comment or "Revisar a regra aplicada e comparar a alternativa marcada com o gabarito."
            rows.append({
                "id": index, "data": parts[0], "materia": parts[1],
                "tipo": parts[2], "texto": text,
                **({"questao": question} if isinstance(question, dict) else {}),
            })
    return rows


def _save_annotations(rows: list[dict]) -> None:
    lines = []
    for row in rows:
        text = str(row["texto"]).replace("|", "/")
        question = row.get("questao")
        if isinstance(question, dict):
            encoded = base64.urlsafe_b64encode(
                json.dumps(question, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
            ).decode("ascii")
            text += f"\t[[QUESTION_DETAILS:{encoded}]]"
        lines.append(f"{row['data']} ||| {row['materia']} ||| {row['tipo']} ||| {text}")
    _write_lines(_data_path("anotacoes_revisao.txt"), lines)


def _contests() -> list[dict]:
    rows = []
    for index, line in enumerate(_read_lines(_data_path("concursos_dados.txt"))):
        parts = _parse_pipe_line(line, 6)
        if parts:
            rows.append({
                "id": index, "concurso": parts[0], "data_abertura": parts[1],
                "data_pagamento": parts[2], "status_pagamento": parts[3],
                "local_prova": parts[4], "observacoes": " | ".join(parts[5:]),
            })
    return rows


def _save_contests(rows: list[dict]) -> None:
    _write_lines(_data_path("concursos_dados.txt"), [
        " ||| ".join(str(row.get(key, "-")).replace("|", "/") for key in
                     ("concurso", "data_abertura", "data_pagamento",
                      "status_pagamento", "local_prova", "observacoes"))
        for row in rows
    ])


def _schedule() -> dict:
    data = _read_json(_data_path("cronograma_semanal.txt"), {})
    if not isinstance(data, dict):
        data = {}
    for day in WEEKDAYS:
        topics = data.get(day, [])
        if isinstance(topics, dict):
            topics = [topics]
        if not isinstance(topics, list):
            topics = []
        for topic in topics:
            if isinstance(topic, dict):
                topic.setdefault("id", uuid.uuid4().hex[:8])
                topic.setdefault("data", datetime.now().strftime("%d/%m/%Y"))
                topic.setdefault("materia", "")
                topic.setdefault("tempo", "")
                topic.setdefault("observacoes", "")
        data[day] = topics
    return data


def _normalized_weekday(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.strip().casefold())
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return next(
        (day for day in WEEKDAYS if unicodedata.normalize("NFD", day.casefold())
         .encode("ascii", "ignore").decode("ascii") == normalized),
        "",
    )


def _parse_schedule_text(text: str) -> list[dict]:
    topics = []
    today = datetime.now().strftime("%d/%m/%Y")
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        fields = [part.strip() for part in line.split("|")]
        if fields and fields[0].casefold() in {"dia", "dia da semana"}:
            continue
        if len(fields) not in {3, 4, 5}:
            raise ValueError(f"Linha {line_number}: use Dia | Matéria | Tempo [| Observações] ou Dia | Data | Matéria | Tempo | Observações.")
        day = _normalized_weekday(fields[0])
        if not day:
            raise ValueError(f"Linha {line_number}: dia da semana inválido.")
        if len(fields) == 5:
            date, subject, duration, notes = fields[1:]
        else:
            date, subject, duration = today, fields[1], fields[2]
            notes = fields[3] if len(fields) == 4 else ""
        if not subject:
            raise ValueError(f"Linha {line_number}: informe a matéria.")
        topics.append({
            "day": day,
            "topic": {
                "id": uuid.uuid4().hex[:8],
                "data": date or today,
                "materia": subject,
                "tempo": duration,
                "observacoes": notes,
            },
        })
    if not topics:
        raise ValueError("O arquivo não contém linhas de cronograma válidas.")
    return topics


def _schedule_duration_seconds(value) -> int:
    text = str(value or "").strip().lower()
    hours = re.search(r"(\d+)\s*h", text)
    minutes = re.search(r"(\d+)\s*(?:min|m)\b", text)
    seconds = re.search(r"(\d+)\s*(?:s|seg)\b", text)
    return (
        (int(hours.group(1)) * 3600 if hours else 0)
        + (int(minutes.group(1)) * 60 if minutes else 0)
        + (int(seconds.group(1)) if seconds else 0)
    )


def _format_schedule_duration(seconds: int) -> str:
    hours, remainder = divmod(seconds, 3600)
    minutes, remaining_seconds = divmod(remainder, 60)
    parts = []
    if hours:
        parts.append(f"{hours}h")
    if minutes:
        parts.append(f"{minutes}min")
    if remaining_seconds:
        parts.append(f"{remaining_seconds}s")
    return " ".join(parts) or "0min"


def _history() -> dict:
    totals: dict[str, dict[str, int]] = {}
    for line in _read_lines(_data_path("historico_geral.txt")):
        parts = [part.strip() for part in line.split("|")]
        if len(parts) != 3:
            continue
        _, subject, status = parts
        totals.setdefault(subject, {"Acertos": 0, "Erros": 0})
        if status.lower() == "certo":
            totals[subject]["Acertos"] += 1
        elif status.lower() == "errado":
            totals[subject]["Erros"] += 1
    return totals


def _folder_names(root: Path) -> list[str]:
    root.mkdir(exist_ok=True)
    return sorted(item.name for item in root.iterdir() if item.is_dir() and not item.name.startswith("."))


def _split_law_devices(text: str) -> list[dict[str, str]]:
    marker = re.compile(
        r"(?P<article>(?<!\w)Art(?:igo)?\.?\s*\d{1,4}(?:[º°ªo])?(?:-[A-Za-z])?)"
        r"|(?P<paragraph>(?<!\w)(?:§\s*(?:\d{1,4}(?:[º°ªo])?(?:-[A-Za-z])?|único)|Parágrafo\s+único)\.?)"
        r"|(?P<inciso>(?:^|(?<=[;\n])|(?<=\s))[ \t]*[IVXLCDM]{1,8}[ \t]*[-–—.)][ \t]+)",
        re.IGNORECASE | re.MULTILINE,
    )
    matches = list(marker.finditer(text))
    if not any(match.group("article") for match in matches):
        return []

    segments: list[dict[str, str]] = []
    preamble = re.sub(r"\s+", " ", text[:matches[0].start()]).strip()
    if preamble:
        segments.append({
            "dispositivo": "Preâmbulo",
            "artigo_base": "",
            "tipo_dispositivo": "Preâmbulo",
            "texto": preamble,
        })
    current_article = ""
    current_device = ""
    current_type = ""
    content_start = 0

    def flush(end: int) -> None:
        if not current_device:
            return
        content = re.sub(r"\s+", " ", text[content_start:end]).strip(" \t\r\n:;.-–—")
        if content:
            segments.append({
                "dispositivo": current_device,
                "artigo_base": current_article,
                "tipo_dispositivo": current_type,
                "texto": content,
            })

    for match in matches:
        kind = match.lastgroup
        if not kind:
            continue
        flush(match.start())
        if kind == "article":
            current_article = re.sub(r"^Artigo", "Art.", match.group("article"), flags=re.IGNORECASE)
            current_device = current_article
            current_type = "Artigo (caput)"
            marker_end = match.end()
        elif kind == "paragraph":
            paragraph = re.sub(r"\s+", " ", match.group("paragraph")).strip().rstrip(".")
            current_device = f"{current_article}, {paragraph}" if current_article else paragraph
            current_type = "Parágrafo"
            marker_end = match.end()
        else:
            roman = re.search(r"[IVXLCDM]{1,8}", match.group("inciso"), re.IGNORECASE)
            if not roman:
                continue
            current_device = (
                f"{current_article}, inciso {roman.group().upper()}"
                if current_article else f"Inciso {roman.group().upper()}"
            )
            current_type = "Inciso"
            marker_end = match.end()
        content_start = marker_end

    flush(len(text))
    return segments


def _list_files(folder: str, root: Path, extensions: set[str]) -> list[dict]:
    directory = _safe_child(root, folder)
    if not directory.is_dir():
        return []
    result = []
    for path in sorted(directory.iterdir(), key=lambda item: item.name.lower()):
        if path.is_file() and path.suffix.lower() in extensions:
            result.append({"name": path.name, "size": path.stat().st_size})
    return result


def _law_entries(folder: str) -> list[dict]:
    directory = _safe_child(LAWS_DIR, folder)
    if not directory.is_dir():
        abort(404, description="Pasta de legislação não encontrada.")
    grades = _read_json(directory / "graus.json", {})
    notes = _read_json(directory / "observacoes.json", {})
    entries = []
    for path in sorted(directory.iterdir(), key=lambda item: item.name.lower()):
        if not path.is_file() or path.suffix.lower() not in {".txt", ".md", ".pdf", ".docx"}:
            continue
        try:
            text = _read_text_file(path)
        except RuntimeError:
            continue
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        if lines and not any(_parse_pipe_line(line, 3) for line in lines):
            devices = _split_law_devices(text)
            if devices:
                lines = [
                    f"{item['dispositivo']} ||| Não Classificado ||| {item['texto']}"
                    for item in devices
                ]
        parsed = []
        for line_index, line in enumerate(lines):
            parts = _parse_pipe_line(line, 3)
            if parts:
                device, grade, content = parts[:3]
                tip = " | ".join(parts[3:]) if len(parts) > 3 else ""
            else:
                article = re.match(
                    r"^(Art(?:igo)?\.?\s*\d+(?:[º°o])?(?:-[A-Za-z])?)\s*[:.\-–—]?\s*(.*)$",
                    line, re.IGNORECASE,
                )
                device = article.group(1).strip() if article else (path.stem if len(lines) == 1 else "Dispositivo")
                grade = "Não Classificado"
                content = article.group(2).strip() if article and article.group(2).strip() else line
                tip = ""
            if re.fullmatch(r"Trecho\s+\d+", device, re.IGNORECASE):
                article = re.match(
                    r"^(Art(?:igo)?\.?\s*\d+(?:[º°o])?(?:-[A-Za-z])?)\s*[:.\-–—]?\s*(.*)$",
                    content, re.IGNORECASE,
                )
                if article:
                    device = article.group(1).strip()
                    content = article.group(2).strip() or content
            legacy_keys = (
                f"{path.name}::{line_index}",
                f"{path.name}::{path.name}::{line_index}",
                f"{device}.docx", device, _display_name(device),
            )
            entry_key = legacy_keys[0]
            saved_grade = grades.get(entry_key)
            if saved_grade is None:
                saved_grade = next(
                    (grades[key] for key in legacy_keys[1:] if key in grades),
                    grade,
                )
            note = notes.get(entry_key)
            if note is None:
                note = next(
                    (notes[key] for key in legacy_keys[1:] if key in notes),
                    "",
                )
            article_base_match = re.match(
                r"^(Art(?:igo)?\.?\s*\d+(?:[º°ªo])?(?:-[A-Za-z])?)",
                device, re.IGNORECASE,
            )
            parsed.append({
                "id": f"{path.name}::{line_index}", "arquivo": path.name,
                "dispositivo": device, "grau": saved_grade,
                "texto": content, "dica": tip, "observacao": note,
                "artigo_base": article_base_match.group(1) if article_base_match else "",
                "tipo_dispositivo": (
                    "Preâmbulo" if device.casefold() == "preâmbulo"
                    else "Parágrafo" if re.search(r"§|Parágrafo", device, re.IGNORECASE)
                    else "Inciso" if re.search(r"\binciso\b", device, re.IGNORECASE)
                    else "Artigo (caput)" if re.match(r"^Art(?:igo)?\.?\s*\d+", device, re.IGNORECASE)
                    else "Dispositivo"
                ),
            })
        entries.extend(parsed)

    unique_entries = []
    article_indexes = {}
    for item in entries:
        article = re.match(
            r"^\s*Art(?:igo)?\.?\s*(\d+)(?:\s*(?:º|°|o))?(.*)$",
            item["dispositivo"], re.IGNORECASE,
        )
        if not article:
            unique_entries.append(item)
            continue
        suffix = unicodedata.normalize("NFD", article.group(2).casefold())
        suffix = "".join(char for char in suffix if unicodedata.category(char) != "Mn")
        suffix = re.sub(r"[\W_]+", "", suffix)
        key = (int(article.group(1)), suffix)
        existing_index = article_indexes.get(key)
        if existing_index is None:
            article_indexes[key] = len(unique_entries)
            unique_entries.append(item)
            continue
        current = unique_entries[existing_index]
        current_rank = (
            len(current["texto"]), bool(current["observacao"]), bool(current["dica"]),
        )
        incoming_rank = (
            len(item["texto"]), bool(item["observacao"]), bool(item["dica"]),
        )
        if incoming_rank > current_rank:
            if not item["observacao"]:
                item["observacao"] = current["observacao"]
            if not item["dica"]:
                item["dica"] = current["dica"]
            if current["grau"] != "Não Classificado":
                item["grau"] = current["grau"]
            unique_entries[existing_index] = item
        else:
            if not current["observacao"]:
                current["observacao"] = item["observacao"]
            if not current["dica"]:
                current["dica"] = item["dica"]
            if current["grau"] == "Não Classificado":
                current["grau"] = item["grau"]
    return unique_entries


def _upload_file(root: Path, folder: str, uploaded, extensions: set[str], unique: bool = True) -> str:
    if not uploaded or not uploaded.filename:
        abort(400, description="Selecione um arquivo.")
    suffix = Path(uploaded.filename).suffix.lower()
    if suffix not in extensions:
        abort(400, description=f"Tipo de arquivo não permitido: {suffix or '(sem extensão)'}.")
    safe_folder = (folder or "").strip()
    if not safe_folder or Path(safe_folder).name != safe_folder or safe_folder in {".", ".."}:
        abort(400, description="Pasta de destino inválida.")
    target_dir = _safe_child(root, safe_folder)
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = secure_filename(Path(uploaded.filename).name)
    if not filename:
        abort(400, description="Nome de arquivo inválido.")
    target = _safe_child(target_dir, filename)
    if unique and target.exists():
        stem, ext = target.stem, target.suffix
        count = 1
        while target.exists():
            target = _safe_child(target_dir, f"{stem} ({count}){ext}")
            count += 1
    uploaded.save(target)
    return target.name


@app.get("/")
def home():
    return send_from_directory(WEB_DIR, "index.html")


@app.get("/api/state")
def api_state():
    questions = _all_questions()
    history = _history()
    completed_simulations = _simulation_results()
    schedule = _schedule()
    archived = []
    for index, line in enumerate(_read_lines(_data_path("cronograma_concluidos.txt"))):
        parts = _parse_pipe_line(line, 5)
        if parts:
            archived.append({
                "id": index, "data": parts[0], "dia_semana": parts[1],
                "materia": parts[2], "tempo": parts[3],
                "observacoes": " | ".join(parts[4:]),
            })
    incomplete = []
    for index, line in enumerate(_read_lines(_data_path("cronograma_nao_concluidos.txt"))):
        parts = _parse_pipe_line(line, 6)
        if parts:
            incomplete.append({
                "id": index, "data": parts[0], "dia_semana": parts[1],
                "materia": parts[2], "tempo": parts[3],
                "observacoes": parts[4], "arquivado_em": parts[5],
            })
    disciplines = sorted({question["materia"] for question in questions})
    counts = {subject: sum(q["materia"] == subject for q in questions) for subject in disciplines}
    contests = _contests()
    phrases = [line.strip() for line in _read_lines(_data_path("frases_motivacionais.txt")) if line.strip()]
    return jsonify({
        "disciplinas": disciplines,
        "questoes": len(questions),
        "questoes_por_materia": counts,
        "avisos_questoes": _question_import_warnings(),
        "historico": history,
        "anotacoes": _all_error_notebook_entries(),
        "simulados_concluidos": len(completed_simulations),
        "concursos": contests,
        "cronograma": schedule,
        "metas_concluidas": archived,
        "metas_nao_concluidas": incomplete,
        "leis": _folder_names(LAWS_DIR),
        "provas": _folder_names(PROOFS_DIR),
        "pdfs": _folder_names(PDFS_DIR),
        "resumos": _folder_names(SUMMARIES_DIR),
        "frase": phrases[0] if phrases else "Foco na missão.",
        "frases": phrases,
        "preferencias": _read_json(_data_path("preferencias_interface.json"), {}),
    })


@app.get("/api/questoes")
def api_questions():
    subject = request.args.get("materia", "")
    questions = _all_questions()
    if request.args.get("incluir_simulados_enviados") == "1":
        questions.extend(_submitted_simulation_questions())
    if subject and subject != "Todas as Matérias":
        questions = [question for question in questions if question["materia"] == subject]
    return jsonify({"materias": sorted({q["materia"] for q in _all_questions()}), "questoes": questions})


@app.get("/api/simulados-enviados")
def api_submitted_simulations():
    simulations = [
        {
            "id": item["id"],
            "titulo": item["titulo"],
            "materia": item["materia"],
            "arquivo": item["arquivo"],
            "data": item["data"],
            "questoes": len(item["questoes"]),
        }
        for item in _submitted_simulations()
    ]
    return jsonify({"simulados": simulations})


@app.get("/api/simulados-enviados/<simulation_id>")
def api_submitted_simulation(simulation_id: str):
    if not re.fullmatch(r"[a-f0-9]{32}", simulation_id):
        abort(400, description="Identificador de simulado inválido.")
    path = _safe_child(SUBMITTED_SIMULATIONS_DIR, f"{simulation_id}.json")
    if not path.is_file():
        abort(404, description="Simulado enviado não encontrado.")
    record = _read_json(path, {})
    if not isinstance(record, dict) or not isinstance(record.get("questoes"), list):
        abort(422, description="O arquivo do simulado possui dados inválidos.")
    public_questions = []
    for question in _ordered_simulation_questions(
        [item for item in record["questoes"] if isinstance(item, dict)]
    ):
        public_question = dict(question)
        alternatives = _normalize_alternatives(question.get("alternativas"))
        if not alternatives:
            statement, alternatives = _split_exam_question(str(question.get("enunciado", "")))
            if alternatives:
                public_question["enunciado"] = statement
        if alternatives:
            public_question["alternativas"] = alternatives
            public_question["tipo"] = "ME"
        public_question.pop("gabarito", None)
        public_question.pop("comentario", None)
        public_questions.append(public_question)
    record["questoes"] = public_questions
    return jsonify(record)


@app.delete("/api/simulados-enviados/<simulation_id>")
def api_delete_submitted_simulation(simulation_id: str):
    if not re.fullmatch(r"[a-f0-9]{32}", simulation_id):
        abort(400, description="Identificador de simulado inválido.")
    path = _safe_child(SUBMITTED_SIMULATIONS_DIR, f"{simulation_id}.json")
    tombstone = path.with_name(path.name + ".deleting")
    results_path = _data_path("simulados_realizados.json")
    with LOCK:
        if not path.is_file():
            abort(404, description="Simulado enviado não encontrado.")
        if tombstone.exists():
            abort(409, description="Este simulado já está sendo removido.")
        results = _simulation_results()
        remaining = [item for item in results if item.get("prova_id") != simulation_id]
        removed_attempts = len(results) - len(remaining)
        try:
            os.replace(path, tombstone)
            _write_json(results_path, remaining)
            tombstone.unlink()
        except OSError as exc:
            try:
                if tombstone.exists() and not path.exists():
                    os.replace(tombstone, path)
                _write_json(results_path, results)
            except OSError as restore_exc:
                raise RuntimeError(
                    "Falha ao remover o simulado e não foi possível restaurar todos os dados."
                ) from restore_exc
            raise RuntimeError(f"Não foi possível remover o simulado: {exc}") from exc
    return jsonify({"ok": True, "tentativas_removidas": removed_attempts})


@app.route("/api/simulados-realizados", methods=["GET", "POST"])
def api_completed_simulations():
    if request.method == "GET":
        results = _simulation_results()
        simulation_id = request.args.get("prova", "").strip()
        if simulation_id:
            results = [item for item in results if item.get("prova_id") == simulation_id]
        return jsonify({"simulados": [
            {**item, "titulo": _simulation_result_title(item)}
            for item in results
        ]})

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        abort(400, description="Informe o resultado do simulado.")
    attempt_id = str(body.get("id", ""))
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", attempt_id):
        abort(400, description="Identificador da tentativa inválido.")
    try:
        elapsed = int(body.get("tempo_segundos", 0))
    except (TypeError, ValueError):
        abort(400, description="Tempo do simulado inválido.")
    if isinstance(body.get("tempo_segundos"), bool) or elapsed < 0 or elapsed > 24 * 60 * 60:
        abort(400, description="O tempo do simulado deve estar entre 0 segundos e 24 horas.")
    submitted_id = str(body.get("prova_id", "")).strip()
    submitted = None
    if submitted_id:
        if not re.fullmatch(r"[a-f0-9]{32}", submitted_id):
            abort(400, description="Identificador da prova enviada inválido.")
        submitted_path = _safe_child(SUBMITTED_SIMULATIONS_DIR, f"{submitted_id}.json")
        if not submitted_path.is_file():
            abort(404, description="A prova enviada não foi encontrada.")
        submitted = _read_json(submitted_path, {})
        if not isinstance(submitted, dict) or not isinstance(submitted.get("questoes"), list):
            abort(422, description="O arquivo da prova enviada possui dados inválidos.")
        questions = _ordered_simulation_questions(
            [question for question in submitted["questoes"] if isinstance(question, dict)]
        )
    else:
        all_questions = {question["id"]: question for question in _all_questions()}
        question_ids = body.get("ordem_questoes")
        if (not isinstance(question_ids, list) or not question_ids
                or any(not isinstance(item, str) for item in question_ids)
                or len(question_ids) != len(set(question_ids))):
            abort(400, description="A ordem das questões do simulado é inválida.")
        if any(question_id not in all_questions for question_id in question_ids):
            abort(404, description="Uma questão do simulado não foi encontrada no banco.")
        questions = [all_questions[question_id] for question_id in question_ids]

    supplied_answers = body.get("respostas")
    if (not isinstance(supplied_answers, list) or not supplied_answers
            or len(supplied_answers) != len(questions)):
        abort(400, description="O resultado deve conter todas as respostas do simulado.")
    question_by_id = {question["id"]: question for question in questions if question.get("id")}
    answer_by_id = {}
    for answer in supplied_answers:
        if not isinstance(answer, dict):
            abort(400, description="Uma resposta do simulado é inválida.")
        question_id = str(answer.get("id", ""))
        selected = _normalize_answer(str(answer.get("resposta", "")))
        if question_id not in question_by_id or question_id in answer_by_id:
            abort(400, description="A lista de respostas não corresponde à prova.")
        if selected not in {"A", "B", "C", "D", "E"}:
            abort(400, description="Uma alternativa marcada é inválida.")
        answer_by_id[question_id] = selected
    expected_ids = [str(question.get("id", "")) for question in questions]
    if [str(answer.get("id", "")) for answer in supplied_answers] != expected_ids:
        abort(400, description="As respostas devem seguir a ordem original das questões.")

    question_results = []
    for number, question in enumerate(questions, start=1):
        selected = answer_by_id[str(question["id"])]
        correct_answer = _normalize_answer(str(question.get("gabarito", "")))
        question_results.append({
            "numero": number,
            "id": str(question["id"]),
            "materia": str(question.get("materia", "")),
            "enunciado": str(question.get("enunciado", "")),
            "alternativas": question.get("alternativas") or _split_exam_question(
                str(question.get("enunciado", ""))
            )[1],
            "tipo": str(question.get("tipo", "")),
            "resposta": selected,
            "gabarito": correct_answer,
            "correta": selected == correct_answer,
            "comentario": str(question.get("comentario", "")),
        })

    correct_count = sum(item["correta"] for item in question_results)
    wrong_count = len(question_results) - correct_count
    created_at = datetime.now()
    result = {
        "id": attempt_id,
        "prova_id": submitted_id or "montado",
        "titulo": str((submitted or {}).get("titulo") or body.get("titulo") or "Simulado por disciplinas"),
        "materia": str((submitted or {}).get("materia") or body.get("materia") or "Geral"),
        "arquivo": str((submitted or {}).get("arquivo") or ""),
        "data": created_at.strftime("%d/%m/%Y %H:%M"),
        "criado_em": created_at.isoformat(timespec="seconds"),
        "tempo_segundos": elapsed,
        "total": len(question_results),
        "acertos": correct_count,
        "erros": wrong_count,
        "aproveitamento": round(correct_count / len(question_results) * 100),
        "questoes": question_results,
    }
    result["titulo"] = _simulation_result_title(result)
    with LOCK:
        if submitted_id and not submitted_path.is_file():
            abort(404, description="A prova enviada foi removida antes do arquivamento.")
        results = _simulation_results()
        previous = next((item for item in results if item.get("id") == attempt_id), None)
        if previous:
            previous = {**previous, "titulo": _simulation_result_title(previous)}
            return jsonify({"ok": True, "simulado": previous, "duplicado": True})
        results.insert(0, result)
        _write_json(_data_path("simulados_realizados.json"), results)
    return jsonify({"ok": True, "simulado": result}), 201


@app.post("/api/responder")
def api_answer():
    body = request.get_json(force=True)
    question_id = str(body.get("id", ""))
    selected = _normalize_answer(str(body.get("resposta", "")))
    question = next(
        (q for q in (*_all_questions(), *_submitted_simulation_questions()) if q["id"] == question_id),
        None,
    )
    if question is None:
        abort(404, description="Questão não encontrada; atualize o treino.")
    if selected not in {"A", "B", "C", "D", "E"}:
        abort(400, description="Resposta inválida.")
    correct = selected == question["gabarito"]
    with LOCK:
        with _data_path("historico_geral.txt").open("a", encoding="utf-8") as stream:
            stream.write(f"{datetime.now():%Y-%m-%d} | {question['materia']} | {'certo' if correct else 'errado'}\n")
        if not correct:
            alternatives = _normalize_alternatives(question.get("alternativas"))
            prompt = str(question.get("enunciado", ""))
            prompt, detected_alternatives = _split_exam_question(prompt)
            if not alternatives:
                alternatives = detected_alternatives
            notes = _annotations()
            notes.insert(0, {
                "data": datetime.now().strftime("%d/%m/%Y"),
                "materia": question["materia"], "tipo": "Erro em Questão (Auto)",
                "texto": str(question.get("comentario", "")).strip()
                or "Revisar a regra aplicada e comparar a alternativa marcada com o gabarito.",
                "questao": {
                    "enunciado": prompt,
                    "alternativas": alternatives,
                    "resposta": selected,
                    "gabarito": question["gabarito"],
                    "comentario": str(question.get("comentario", "")),
                },
            })
            _save_annotations(notes)
        return jsonify({"correta": correct, "gabarito": question["gabarito"], "comentario": question["comentario"], "tipo": question["tipo"]})


def _pdf_safe_text(value: object) -> str:
    return str(value).encode("latin-1", errors="replace").decode("latin-1")


@app.get("/api/anotacoes/exportar")
def api_export_annotations():
    subject = request.args.get("materia", "").strip()
    include_question = request.args.get("incluir_questao") == "1"
    rows = _all_error_notebook_entries()
    if subject and subject != "Todas as Matérias":
        rows = [row for row in rows if row["materia"] == subject]
    if not rows:
        abort(404, description="Não há registros para exportar com esse filtro.")

    try:
        from fpdf import FPDF

        pdf = FPDF()
        pdf.set_compression(True)
        pdf.set_title("Caderno de erros")
        pdf.set_auto_page_break(auto=True, margin=14)
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 16)
        pdf.multi_cell(pdf.epw, 9, "Caderno de erros")
        pdf.set_font("Helvetica", size=9)
        pdf.set_text_color(90, 90, 90)
        pdf.multi_cell(pdf.epw, 6, _pdf_safe_text(f"{len(rows)} registro(s)" + (f" | {subject}" if subject and subject != "Todas as Matérias" else " | Todas as matérias")))
        pdf.ln(3)

        for index, row in enumerate(rows, start=1):
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_fill_color(235, 238, 242)
            heading = f"{index}. {row.get('tipo', 'Anotação')} - {row.get('materia', 'Geral')} - {row.get('data', '')}"
            pdf.multi_cell(pdf.epw, 7, _pdf_safe_text(heading), border=1, fill=True, padding=1)
            pdf.set_font("Helvetica", size=10)
            pdf.set_text_color(35, 35, 35)
            if (row.get("observacao_prova") or row.get("correcao_prova")) and row.get("arquivo_prova"):
                pdf.multi_cell(pdf.epw, 6, _pdf_safe_text(f"Prova: {row['arquivo_prova']}"))
            pdf.multi_cell(pdf.epw, 6, _pdf_safe_text(f"Ponto para revisar: {row.get('texto', '')}"))

            question = row.get("questao")
            if include_question and isinstance(question, dict):
                pdf.ln(1)
                pdf.set_font("Helvetica", "B", 10)
                pdf.multi_cell(pdf.epw, 6, "Questão")
                pdf.set_font("Helvetica", size=9)
                pdf.multi_cell(pdf.epw, 5, _pdf_safe_text(question.get("enunciado", "")))
                alternatives = question.get("alternativas")
                if isinstance(alternatives, list):
                    for alternative in alternatives:
                        if isinstance(alternative, dict):
                            key = alternative.get("key", alternative.get("letra", ""))
                            text = alternative.get("text", alternative.get("texto", ""))
                            pdf.multi_cell(pdf.epw, 5, _pdf_safe_text(f"[{key}] {text}".strip()))
                if question.get("resposta"):
                    pdf.multi_cell(pdf.epw, 5, _pdf_safe_text(f"Resposta marcada: {question['resposta']}"))
                if question.get("gabarito"):
                    pdf.multi_cell(pdf.epw, 5, _pdf_safe_text(f"Gabarito: {question['gabarito']}"))
                if question.get("comentario"):
                    pdf.multi_cell(pdf.epw, 5, _pdf_safe_text(f"Comentário: {question['comentario']}"))
            pdf.ln(4)

        data = pdf.output()
    except Exception as exc:
        app.logger.exception("Falha ao gerar PDF do caderno de erros")
        abort(500, description=f"Não foi possível gerar o PDF do caderno de erros: {exc}")

    from io import BytesIO

    name = "caderno_erros_geral" if not subject or subject == "Todas as Matérias" else f"caderno_erros_{_clean_name(subject)}"
    return send_file(
        BytesIO(data),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"{name}.pdf",
    )


@app.route("/api/anotacoes", methods=["GET", "POST", "PUT", "DELETE"])
def api_annotations():
    if request.method == "GET":
        return jsonify(_all_error_notebook_entries())
    rows = _annotations()
    body = request.get_json(force=True)
    with LOCK:
        rows = _annotations()
        if request.method == "POST":
            if not str(body.get("texto", "")).strip():
                abort(400, description="O texto da anotação não pode ficar vazio.")
            rows.insert(0, {
                "data": datetime.now().strftime("%d/%m/%Y"),
                "materia": str(body.get("materia") or "Geral").strip(),
                "tipo": str(body.get("tipo") or "Ponto Importante").strip(),
                "texto": str(body["texto"]).strip().replace("|", "/"),
            })
        else:
            index = int(body.get("id", -1))
            if index < 0 or index >= len(rows):
                abort(404, description="Anotação não encontrada.")
            if request.method == "DELETE":
                rows.pop(index)
            else:
                rows[index].update({
                    "materia": str(body.get("materia", rows[index]["materia"])).strip(),
                    "tipo": str(body.get("tipo", rows[index]["tipo"])).strip(),
                    "texto": str(body.get("texto", rows[index]["texto"])).strip().replace("|", "/"),
                })
        _save_annotations(rows)
    return jsonify(rows)


@app.route("/api/sumulas-jurisprudencia", methods=["GET", "POST", "PUT", "DELETE"])
def api_case_law():
    path = _data_path("sumulas_jurisprudencia.json")
    rows = _read_json(path, [])
    if not isinstance(rows, list) or any(not isinstance(item, dict) for item in rows):
        raise RuntimeError("O arquivo sumulas_jurisprudencia.json contém dados inválidos.")
    if request.method == "GET":
        return jsonify(rows)

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        abort(400, description="Informe os dados da súmula ou jurisprudência.")
    item_id = str(body.get("id", "")).strip()
    with LOCK:
        rows = _read_json(path, [])
        if not isinstance(rows, list) or any(not isinstance(item, dict) for item in rows):
            raise RuntimeError("O arquivo sumulas_jurisprudencia.json contém dados inválidos.")
        if request.method == "POST":
            title = str(body.get("titulo", "")).strip()
            text = str(body.get("texto", "")).strip()
            if not title or not text:
                abort(400, description="Preencha o título e o texto.")
            item = {
                "id": uuid.uuid4().hex,
                "categoria": str(body.get("categoria") or "Jurisprudência").strip(),
                "titulo": title,
                "tribunal": str(body.get("tribunal") or "").strip(),
                "identificador": str(body.get("identificador") or "").strip(),
                "fonte": str(body.get("fonte") or "").strip(),
                "texto": text,
                "criado_em": datetime.now().isoformat(timespec="seconds"),
            }
            rows.insert(0, item)
            _write_json(path, rows)
            return jsonify(item), 201

        index = next((i for i, item in enumerate(rows) if item.get("id") == item_id), None)
        if not item_id or index is None:
            abort(404, description="Referência não encontrada.")
        if request.method == "DELETE":
            rows.pop(index)
        else:
            title = str(body.get("titulo", "")).strip()
            text = str(body.get("texto", "")).strip()
            if not title or not text:
                abort(400, description="Preencha o título e o texto.")
            rows[index].update({
                "categoria": str(body.get("categoria") or "Jurisprudência").strip(),
                "titulo": title,
                "tribunal": str(body.get("tribunal") or "").strip(),
                "identificador": str(body.get("identificador") or "").strip(),
                "fonte": str(body.get("fonte") or "").strip(),
                "texto": text,
                "atualizado_em": datetime.now().isoformat(timespec="seconds"),
            })
        _write_json(path, rows)
    return jsonify({"ok": True})


@app.route("/api/metas/observacoes-semanais", methods=["GET", "PUT"])
def api_weekly_goal_notes():
    if request.method == "GET":
        week = request.args.get("semana", "").strip()
    else:
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            abort(400, description="Informe a semana e as observações.")
        week = str(body.get("semana", "")).strip()
    try:
        week_date = datetime.strptime(week, "%Y-%m-%d").date()
    except ValueError:
        abort(400, description="A semana deve usar o formato AAAA-MM-DD.")
    monday = week_date.fromordinal(week_date.toordinal() - week_date.weekday()).isoformat()
    path = _data_path("metas_concluidas_observacoes.json")
    if request.method == "GET":
        notes = _read_json(path, {})
        if not isinstance(notes, dict):
            raise RuntimeError("O arquivo de observações semanais possui dados inválidos.")
        return jsonify({"semana": monday, "observacoes": str(notes.get(monday, ""))})

    observation = str(body.get("observacoes", "")).strip()
    if len(observation) > 20000:
        abort(400, description="As observações semanais devem ter até 20.000 caracteres.")
    with LOCK:
        notes = _read_json(path, {})
        if not isinstance(notes, dict):
            raise RuntimeError("O arquivo de observações semanais possui dados inválidos.")
        if observation:
            notes[monday] = observation
        else:
            notes.pop(monday, None)
        _write_json(path, notes)
    return jsonify({"ok": True, "semana": monday})


@app.route("/api/concursos", methods=["GET", "POST", "PUT", "DELETE"])
def api_contests():
    rows = _contests()
    if request.method == "GET":
        return jsonify(rows)
    body = request.get_json(force=True)
    with LOCK:
        rows = _contests()
        if request.method == "POST":
            if not str(body.get("concurso", "")).strip():
                abort(400, description="Informe o órgão ou cargo.")
            rows.insert(0, {
                "concurso": str(body["concurso"]).strip(),
                "data_abertura": str(body.get("data_abertura") or "-").strip(),
                "data_pagamento": str(body.get("data_pagamento") or "-").strip(),
                "status_pagamento": str(body.get("status_pagamento") or "Não Pago"),
                "local_prova": str(body.get("local_prova") or "-").strip(),
                "observacoes": str(body.get("observacoes") or "-").strip(),
            })
        else:
            index = int(body.get("id", -1))
            if index < 0 or index >= len(rows):
                abort(404, description="Concurso não encontrado.")
            if request.method == "DELETE":
                rows.pop(index)
            else:
                rows[index].update({key: str(body.get(key, value)).strip() for key, value in rows[index].items() if key != "id"})
        _save_contests(rows)
    return jsonify(rows)


@app.route("/api/cronograma", methods=["GET", "PUT"])
def api_schedule():
    if request.method == "GET":
        return jsonify(_schedule())
    body = request.get_json(force=True)
    if not isinstance(body, dict):
        abort(400, description="Formato de cronograma inválido.")
    normalized = {day: body.get(day, []) for day in WEEKDAYS}
    for day in WEEKDAYS:
        if not isinstance(normalized[day], list):
            abort(400, description=f"Lista de tópicos inválida: {day}.")
        for topic in normalized[day]:
            if not isinstance(topic, dict):
                abort(400, description="Tópico inválido.")
            topic.setdefault("id", uuid.uuid4().hex[:8])
    with LOCK:
        _write_json(_data_path("cronograma_semanal.txt"), normalized)
    return jsonify(normalized)


@app.post("/api/cronograma/arquivar-semana")
def api_archive_schedule_week():
    body = request.get_json(force=True)
    if not isinstance(body, dict):
        abort(400, description="Formato de cronograma inválido.")

    pending = []
    for day in WEEKDAYS:
        topics = body.get(day, [])
        if not isinstance(topics, list):
            abort(400, description=f"Lista de tópicos inválida: {day}.")
        for topic in topics:
            if not isinstance(topic, dict):
                abort(400, description="Tópico inválido.")
            item = {
                "data": str(topic.get("data") or "").strip(),
                "materia": str(topic.get("materia") or "").strip(),
                "tempo": str(topic.get("tempo") or "").strip(),
                "observacoes": str(topic.get("observacoes") or "").strip(),
            }
            if item["materia"] or item["observacoes"]:
                pending.append((day, item))
    if not pending:
        abort(400, description="Não há tópicos para arquivar.")

    archived_at = datetime.now().strftime("%d/%m/%Y %H:%M")
    archive_path = _data_path("cronograma_nao_concluidos.txt")
    with LOCK:
        lines = _read_lines(archive_path)
        for day, item in pending:
            fields = (
                item["data"], day, item["materia"], item["tempo"],
                item["observacoes"], archived_at,
            )
            lines.append(" ||| ".join(value.replace("|", "/") for value in fields))
        _write_lines(archive_path, lines)
        _write_json(_data_path("cronograma_semanal.txt"), {day: [] for day in WEEKDAYS})
    return jsonify({"arquivados": len(pending), "arquivado_em": archived_at})


@app.route("/api/metas-nao-concluidas", methods=["GET", "POST", "DELETE"])
def api_incomplete_goals():
    path = _data_path("cronograma_nao_concluidos.txt")
    lines = _read_lines(path)
    if request.method == "GET":
        entries = []
        for index, line in enumerate(lines):
            parts = _parse_pipe_line(line, 6)
            if parts:
                entries.append({
                    "id": index, "data": parts[0], "dia_semana": parts[1],
                    "materia": parts[2], "tempo": parts[3],
                    "observacoes": parts[4], "arquivado_em": parts[5],
                })
        return jsonify(entries)

    if request.method == "POST":
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            abort(400, description="Informe o tópico que deseja arquivar.")
        if body.get("acao") == "concluir":
            try:
                index = int(body.get("id", -1))
            except (TypeError, ValueError):
                abort(400, description="Identificador de meta inválido.")
            completed_path = _data_path("cronograma_concluidos.txt")
            with LOCK:
                lines = _read_lines(path)
                if index < 0 or index >= len(lines):
                    abort(404, description="Meta não concluída não encontrada.")
                fields = _parse_pipe_line(lines[index], 6)
                if not fields:
                    abort(409, description="A meta selecionada possui dados inválidos.")
                previous_completed_lines = _read_lines(completed_path)
                completed_lines = previous_completed_lines + [
                    " ||| ".join(value.replace("|", "/") for value in fields[:5])
                ]
                remaining_lines = lines[:index] + lines[index + 1:]
                try:
                    _write_lines(completed_path, completed_lines)
                    _write_lines(path, remaining_lines)
                except OSError:
                    _write_lines(completed_path, previous_completed_lines)
                    _write_lines(path, lines)
                    raise
            return jsonify({"ok": True, "meta_concluida": True})

        day = str(body.get("dia", ""))
        topic = body.get("topico")
        schedule = body.get("cronograma")
        if day not in WEEKDAYS or not isinstance(topic, dict) or not isinstance(schedule, dict):
            abort(400, description="Dados do tópico ou cronograma inválidos.")
        normalized = {}
        for weekday in WEEKDAYS:
            topics = schedule.get(weekday, [])
            if not isinstance(topics, list) or any(not isinstance(item, dict) for item in topics):
                abort(400, description=f"Lista de tópicos inválida: {weekday}.")
            normalized[weekday] = topics
        item = {
            "data": str(topic.get("data") or "").strip(),
            "materia": str(topic.get("materia") or "").strip(),
            "tempo": str(topic.get("tempo") or "").strip(),
            "observacoes": str(topic.get("observacoes") or "").strip(),
        }
        if not item["materia"] and not item["observacoes"]:
            abort(400, description="Preencha a matéria ou as observações antes de arquivar.")
        archived_at = datetime.now().strftime("%d/%m/%Y %H:%M")
        fields = (
            item["data"], day, item["materia"], item["tempo"],
            item["observacoes"], archived_at,
        )
        with LOCK:
            lines = _read_lines(path)
            lines.append(" ||| ".join(value.replace("|", "/") for value in fields))
            _write_lines(path, lines)
            _write_json(_data_path("cronograma_semanal.txt"), normalized)
        return jsonify({"ok": True, "arquivado_em": archived_at})

    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        abort(400, description="Informe a meta que deseja excluir.")
    try:
        index = int(body.get("id", -1))
    except (TypeError, ValueError):
        abort(400, description="Identificador de meta inválido.")
    with LOCK:
        lines = _read_lines(path)
        if index < 0 or index >= len(lines):
            abort(404, description="Meta não concluída não encontrada.")
        lines.pop(index)
        _write_lines(path, lines)
    return jsonify({"ok": True})


@app.post("/api/utilidades/cronograma")
def api_import_schedule():
    uploaded = request.files.get("arquivo")
    if not uploaded or Path(uploaded.filename).suffix.lower() != ".txt":
        abort(400, description="Selecione um arquivo .txt.")
    content = uploaded.read(1024 * 1024 + 1)
    if len(content) > 1024 * 1024:
        abort(413, description="O arquivo de cronograma excede 1 MB.")
    try:
        imported = _parse_schedule_text(content.decode("utf-8-sig"))
    except UnicodeDecodeError:
        abort(400, description="O arquivo deve estar codificado em UTF-8.")
    except ValueError as exc:
        abort(400, description=str(exc))

    with LOCK:
        schedule = _schedule()
        for item in imported:
            schedule[item["day"]].append(item["topic"])
        _write_json(_data_path("cronograma_semanal.txt"), schedule)
    return jsonify({"importados": len(imported), "cronograma": schedule}), 201


@app.post("/api/quiz/<quiz_id>/study-time")
def api_quiz_study_time(quiz_id: str):
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", quiz_id):
        abort(400, description="Identificador de sessão inválido.")
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        abort(400, description="Dados de tempo inválidos.")

    elapsed = body.get("elapsed_seconds")
    answers = body.get("answers")
    if (isinstance(elapsed, bool) or not isinstance(elapsed, int)
            or elapsed < 1 or elapsed > 24 * 60 * 60):
        abort(400, description="O tempo ativo deve estar entre 1 segundo e 24 horas.")
    if not isinstance(answers, list) or not answers:
        abort(400, description="Informe as matérias respondidas na sessão.")

    counts: dict[str, int] = {}
    for answer in answers:
        if not isinstance(answer, dict):
            abort(400, description="Resposta de matéria inválida.")
        subject = str(answer.get("subject", "")).strip()
        count = answer.get("count")
        if (not subject or len(subject) > 200 or isinstance(count, bool)
                or not isinstance(count, int) or count < 1 or count > 10000):
            abort(400, description="Matéria ou quantidade de respostas inválida.")
        counts[subject] = counts.get(subject, 0) + count

    answer_total = sum(counts.values())
    base_allocations = {
        subject: (elapsed * count) // answer_total
        for subject, count in counts.items()
    }
    remaining = elapsed - sum(base_allocations.values())
    remainders = sorted(
        counts,
        key=lambda subject: (elapsed * counts[subject]) % answer_total,
        reverse=True,
    )
    for subject in remainders[:remaining]:
        base_allocations[subject] += 1

    records_path = _data_path("quiz_study_time_records.json")
    with LOCK:
        records = _read_json(records_path, {})
        if not isinstance(records, dict):
            raise RuntimeError("O registro de tempos de sessão está inválido.")
        if quiz_id in records:
            return jsonify({"ok": True, "already_recorded": True, **records[quiz_id]})

        schedule = _schedule()
        now = datetime.now()
        today = now.strftime("%d/%m/%Y")
        day = WEEKDAYS[now.weekday()]
        allocations = []
        for subject, seconds in base_allocations.items():
            if not seconds:
                continue
            topic = next(
                (item for item in schedule[day]
                 if str(item.get("materia", "")).strip().casefold() == subject.casefold()),
                None,
            )
            if topic is None:
                topic = {
                    "id": uuid.uuid4().hex[:8],
                    "data": today,
                    "materia": subject,
                    "tempo": "0min",
                    "observacoes": "",
                }
                schedule[day].append(topic)
            total_seconds = _schedule_duration_seconds(topic.get("tempo", "")) + seconds
            topic["tempo"] = _format_schedule_duration(total_seconds)
            allocations.append({"subject": subject, "seconds": seconds})

        result = {
            "recorded": True,
            "day": day,
            "date": now.strftime("%Y-%m-%d"),
            "allocations": allocations,
        }
        _write_json(_data_path("cronograma_semanal.txt"), schedule)
        records[quiz_id] = result
        _write_json(records_path, records)
    return jsonify({"ok": True, **result})


@app.get("/api/desempenho")
def api_performance():
    today = datetime.now().date()
    days = [(today.fromordinal(today.toordinal() - offset)) for offset in range(13, -1, -1)]
    daily = {
        day.isoformat(): {"date": day.isoformat(), "answered": 0, "correct": 0, "study_seconds": 0}
        for day in days
    }
    subjects: dict[str, dict[str, int]] = {}
    for line in _read_lines(_data_path("historico_geral.txt")):
        parts = [part.strip() for part in line.split("|")]
        if len(parts) != 3:
            continue
        try:
            date_key = datetime.strptime(parts[0], "%Y-%m-%d").date().isoformat()
        except ValueError:
            continue
        subject, status = parts[1], parts[2].casefold()
        if status not in {"certo", "errado"}:
            continue
        subject_stats = subjects.setdefault(subject, {"answered": 0, "correct": 0})
        subject_stats["answered"] += 1
        if status == "certo":
            subject_stats["correct"] += 1
        if date_key in daily:
            daily[date_key]["answered"] += 1
            daily[date_key]["correct"] += status == "certo"

    records = _read_json(_data_path("quiz_study_time_records.json"), {})
    if not isinstance(records, dict):
        raise RuntimeError("O registro de tempos de sessão está inválido.")
    total_study_seconds = 0
    for record in records.values():
        if not isinstance(record, dict):
            continue
        allocations = record.get("allocations", [])
        if not isinstance(allocations, list):
            continue
        for allocation in allocations:
            if not isinstance(allocation, dict):
                continue
            seconds = allocation.get("seconds", 0)
            if isinstance(seconds, bool) or not isinstance(seconds, int) or seconds < 0:
                continue
            total_study_seconds += seconds
            try:
                date_key = datetime.strptime(str(record.get("date", "")), "%Y-%m-%d").date().isoformat()
            except ValueError:
                continue
            if date_key in daily:
                daily[date_key]["study_seconds"] += seconds

    subject_rows = [
        {
            "subject": subject,
            **values,
            "accuracy": round(values["correct"] / values["answered"] * 100) if values["answered"] else 0,
        }
        for subject, values in subjects.items()
    ]
    subject_rows.sort(key=lambda item: (-item["answered"], item["subject"].casefold()))
    return jsonify({
        "daily": list(daily.values()),
        "subjects": subject_rows,
        "total_answered": sum(item["answered"] for item in subject_rows),
        "total_correct": sum(item["correct"] for item in subject_rows),
        "total_study_seconds": total_study_seconds,
    })


@app.route("/api/metas", methods=["GET", "POST", "DELETE"])
def api_goals():
    path = _data_path("cronograma_concluidos.txt")
    lines = _read_lines(path)
    if request.method == "GET":
        entries = []
        for index, line in enumerate(lines):
            parts = _parse_pipe_line(line, 5)
            if parts:
                entries.append({"id": index, "data": parts[0], "dia_semana": parts[1], "materia": parts[2], "tempo": parts[3], "observacoes": " | ".join(parts[4:])})
        return jsonify(entries)
    body = request.get_json(force=True)
    with LOCK:
        lines = _read_lines(path)
        if request.method == "POST":
            if body.get("acao") == "reabrir":
                try:
                    index = int(body.get("id", -1))
                except (TypeError, ValueError):
                    abort(400, description="Identificador de meta inválido.")
                if index < 0 or index >= len(lines):
                    abort(404, description="Meta concluída não encontrada.")
                fields = _parse_pipe_line(lines[index], 5)
                if not fields:
                    abort(409, description="A meta selecionada possui dados inválidos.")
                incomplete_path = _data_path("cronograma_nao_concluidos.txt")
                previous_incomplete_lines = _read_lines(incomplete_path)
                reopened_at = datetime.now().strftime("%d/%m/%Y %H:%M")
                observations = " | ".join(fields[4:])
                reopened_fields = (*fields[:4], observations, reopened_at)
                incomplete_lines = previous_incomplete_lines + [
                    " ||| ".join(value.replace("|", "/") for value in reopened_fields)
                ]
                remaining_lines = lines[:index] + lines[index + 1:]
                try:
                    _write_lines(incomplete_path, incomplete_lines)
                    _write_lines(path, remaining_lines)
                except OSError:
                    _write_lines(incomplete_path, previous_incomplete_lines)
                    _write_lines(path, lines)
                    raise
                return jsonify({"ok": True, "meta_reaberta": True})
            lines.append(" ||| ".join(str(body.get(k, "")).replace("|", "/") for k in ("data", "dia_semana", "materia", "tempo", "observacoes")))
        else:
            index = int(body.get("id", -1))
            if index < 0 or index >= len(lines):
                abort(404, description="Meta não encontrada.")
            lines.pop(index)
        _write_lines(path, lines)
    return jsonify({"ok": True})


@app.get("/api/leis")
def api_laws():
    folders = _folder_names(LAWS_DIR)
    folder = request.args.get("pasta", "")
    if not folder:
        return jsonify({"pastas": folders})
    entries = _law_entries(folder)
    grade = request.args.get("grau", "")
    query = request.args.get("q", "").casefold()
    if grade:
        entries = [item for item in entries if item["grau"] == grade]
    if query:
        entries = [item for item in entries if query in item["texto"].casefold() or query in item["dispositivo"].casefold()]
    return jsonify({
        "pastas": folders,
        "itens": entries,
        "pdfs": _list_files(folder, LAWS_DIR, {".pdf"}),
    })


@app.post("/api/leis/pasta")
def api_law_folder():
    body = request.get_json(force=True)
    name = _clean_name(str(body.get("nome", "")))
    _safe_child(LAWS_DIR, name).mkdir(parents=True, exist_ok=True)
    return jsonify({"nome": name}), 201


@app.post("/api/leis/arquivo")
def api_law_upload():
    folder = str(request.form.get("pasta", ""))
    name = _upload_file(LAWS_DIR, folder, request.files.get("arquivo"), {".txt", ".md", ".pdf", ".docx"})
    return jsonify({"arquivo": name}), 201


@app.post("/api/leis/artigo")
def api_law_add():
    body = request.get_json(force=True)
    folder = _clean_name(str(body.get("pasta", "")))
    device = str(body.get("dispositivo", "")).strip()
    text = str(body.get("texto", "")).strip()
    grade = str(body.get("grau", "Não Classificado")).strip()
    if not device or not text:
        abort(400, description="Informe o dispositivo e o texto.")
    if grade not in {"Não Classificado", "Muito Alto", "Alto", "Médio", "Baixo"}:
        abort(400, description="O grau de incidência selecionado é inválido.")
    directory = _safe_child(LAWS_DIR, folder)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "artigos_adicionados.txt"
    with LOCK:
        with path.open("a", encoding="utf-8") as stream:
            stream.write(f"{device} ||| {grade} ||| {' '.join(text.split())} ||| {' '.join(str(body.get('dica', '')).split())}\n")
    return jsonify({"ok": True}), 201


@app.put("/api/leis/item")
def api_law_update():
    body = request.get_json(force=True)
    folder = str(body.get("pasta", "")).strip()
    file_name = str(body.get("arquivo", "")).strip()
    if Path(folder).name != folder or Path(file_name).name != file_name:
        abort(400, description="Caminho inválido.")
    try:
        index = int(body.get("indice", -1))
    except (TypeError, ValueError):
        abort(400, description="O índice do dispositivo é inválido.")
    directory = _safe_child(LAWS_DIR, folder)
    path = _safe_child(directory, file_name)
    if not path.is_file():
        abort(404, description="Arquivo de legislação não encontrado.")
    grade = str(body.get("grau", "")).strip()
    if grade not in {"Não Classificado", "Muito Alto", "Alto", "Médio", "Baixo"}:
        abort(400, description="O grau de incidência selecionado é inválido.")
    if index < 0:
        abort(400, description="O índice do dispositivo é inválido.")

    with LOCK:
        if path.suffix.lower() in {".txt", ".md"}:
            lines = _read_lines(path)
            if lines and not any(_parse_pipe_line(line, 3) for line in lines):
                devices = _split_law_devices("\n".join(lines))
                if devices:
                    lines = [
                        f"{item['dispositivo']} ||| Não Classificado ||| {item['texto']}"
                        for item in devices
                    ]
            content_index = -1
            for pos, line in enumerate(lines):
                if not line.strip():
                    continue
                content_index += 1
                if content_index != index:
                    continue
                parts = _parse_pipe_line(line, 3)
                if not parts:
                    abort(400, description="O dispositivo não pode ser editado neste arquivo.")
                device = str(body.get("dispositivo", parts[0])).strip()
                text = " ".join(str(body.get("texto", parts[2])).split())
                tip = " ".join(str(body.get("dica", parts[3] if len(parts) > 3 else "")).split())
                lines[pos] = f"{device} ||| {grade} ||| {text} ||| {tip}"
                break
            else:
                abort(404, description="Dispositivo não encontrado.")
            _write_lines(path, lines)
        elif not any(
            item["id"] == f"{file_name}::{index}"
            for item in _law_entries(folder)
        ):
            abort(404, description="Dispositivo não encontrado.")
        grades_path = directory / "graus.json"
        grades = _read_json(grades_path, {})
        grades[f"{file_name}::{index}"] = grade
        _write_json(grades_path, grades)
        notes_path = directory / "observacoes.json"
        notes = _read_json(notes_path, {})
        key = f"{file_name}::{index}"
        notes[key] = str(body.get("observacao", "")).strip()
        _write_json(notes_path, notes)
    return jsonify({"ok": True})


@app.route("/api/arquivos/<kind>/<path:relative_path>", methods=["GET", "PUT"])
def api_file(kind: str, relative_path: str):
    roots = {
        "pdfs": PDFS_DIR,
        "provas": PROOFS_DIR,
        "provas-com-gabarito": PROOFS_WITH_KEY_DIR,
        "resumos": SUMMARIES_DIR,
        "leis": LAWS_DIR,
        "redacoes": REDACTIONS_DIR,
    }
    root = roots.get(kind)
    if root is None:
        abort(404)
    path = _safe_child(root, *relative_path.split("/"))
    if not path.is_file():
        abort(404)
    if request.method == "PUT":
        if kind not in {"pdfs", "provas", "provas-com-gabarito"} or path.suffix.lower() != ".pdf":
            abort(400, description="A substituição está disponível somente para PDFs pessoais e provas.")
        uploaded = request.files.get("arquivo")
        if not uploaded or not uploaded.filename or Path(uploaded.filename).suffix.lower() != ".pdf":
            abort(400, description="Selecione um arquivo PDF para substituir o original.")
        header = uploaded.stream.read(1024)
        uploaded.stream.seek(0)
        if b"%PDF-" not in header:
            abort(400, description="O arquivo selecionado não contém um cabeçalho PDF válido.")
        temporary = _safe_child(
            root,
            *relative_path.split("/")[:-1],
            f".{path.name}.{uuid.uuid4().hex}.tmp",
        )
        try:
            with LOCK:
                uploaded.save(temporary)
                os.replace(temporary, path)
        except OSError as exc:
            app.logger.exception("Falha ao substituir PDF %s", path.name)
            abort(500, description=f"Não foi possível substituir o PDF original: {exc}")
        finally:
            temporary.unlink(missing_ok=True)
        return jsonify({"ok": True, "arquivo": path.name})
    response = send_file(path, as_attachment=request.args.get("download") == "1")
    if path.suffix.lower() == ".pdf":
        response.headers["Cache-Control"] = "no-store"
    return response


@app.post("/api/pdf/marcacoes")
def api_save_pdf_highlights():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        abort(400, description="Informe as marcações do PDF.")
    roots = {
        "pdfs": PDFS_DIR,
        "provas": PROOFS_DIR,
        "provas-com-gabarito": PROOFS_WITH_KEY_DIR,
        "resumos": SUMMARIES_DIR,
        "leis": LAWS_DIR,
        "redacoes": REDACTIONS_DIR,
    }
    kind = str(body.get("kind", ""))
    root = roots.get(kind)
    if root is None:
        abort(400, description="Tipo de arquivo inválido.")
    relative_path = str(body.get("path", ""))
    path = _safe_child(root, *relative_path.replace("\\", "/").split("/"))
    if not path.is_file() or path.suffix.lower() != ".pdf":
        abort(404, description="PDF não encontrado.")
    highlights = body.get("highlights")
    if not isinstance(highlights, list) or not highlights or len(highlights) > 500:
        abort(400, description="Selecione de 1 a 500 trechos para grifar.")
    color_values = {
        "yellow": [1.0, 0.84, 0.0],
        "green": [0.35, 0.78, 0.48],
        "blue": [0.25, 0.58, 0.95],
        "pink": [0.92, 0.42, 0.67],
        "orange": [0.98, 0.54, 0.20],
    }
    reader = None
    try:
        from PyPDF2 import PdfReader, PdfWriter

        with LOCK:
            reader = PdfReader(str(path))
            writer = PdfWriter()
            writer.append(reader)
            page_count = len(writer.pages)
            for highlight in highlights:
                if not isinstance(highlight, dict):
                    abort(400, description="Uma marcação do PDF é inválida.")
                page_number = highlight.get("page")
                rectangle = highlight.get("rect")
                color_name = str(highlight.get("color", "yellow"))
                if (
                    isinstance(page_number, bool)
                    or not isinstance(page_number, int)
                    or page_number < 1
                    or page_number > page_count
                    or not isinstance(rectangle, list)
                    or len(rectangle) != 4
                    or color_name not in color_values
                ):
                    abort(400, description="Uma marcação do PDF possui coordenadas inválidas.")
                if any(isinstance(value, bool) or not isinstance(value, (int, float)) for value in rectangle):
                    abort(400, description="Uma marcação do PDF possui coordenadas inválidas.")
                coordinates = [float(value) for value in rectangle]
                if not all(math.isfinite(value) for value in coordinates):
                    abort(400, description="Uma marcação do PDF possui coordenadas inválidas.")
                x1, y1, x2, y2 = coordinates
                page = writer.pages[page_number - 1]
                media_box = page.mediabox
                left, bottom = float(media_box.left), float(media_box.bottom)
                right, top = float(media_box.right), float(media_box.top)
                x1, x2 = sorted((max(left, min(right, x1)), max(left, min(right, x2))))
                y1, y2 = sorted((max(bottom, min(top, y1)), max(bottom, min(top, y2))))
                if x2 - x1 < 0.5 or y2 - y1 < 0.5:
                    abort(400, description="A área selecionada para grifo é muito pequena.")
                color = color_values[color_name]
                writer.add_annotation(page_number - 1, {
                    "/Type": "/Annot",
                    "/Subtype": "/Highlight",
                    "/Rect": [x1, y1, x2, y2],
                    "/QuadPoints": [x1, y2, x2, y2, x1, y1, x2, y1],
                    "/C": color,
                    "/CA": 0.42,
                    "/F": 4,
                    "/Contents": "Marcador da Central de Estudos",
                })
            temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
            try:
                with temporary.open("wb") as stream:
                    writer.write(stream)
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
    except HTTPException:
        raise
    except Exception as exc:
        app.logger.exception("Falha ao salvar marcações no PDF %s", path.name)
        abort(422, description=f"Não foi possível salvar as marcações no PDF: {exc}")
    finally:
        if reader is not None:
            reader.stream.close()
    return jsonify({"ok": True, "marcacoes": len(highlights)})


@app.route("/api/redacoes", methods=["GET", "POST"])
def api_essays():
    if request.method == "GET":
        REDACTIONS_DIR.mkdir(parents=True, exist_ok=True)
        essays = []
        for directory in REDACTIONS_DIR.iterdir():
            if not directory.is_dir() or not re.fullmatch(r"[0-9a-f]{32}", directory.name):
                continue
            metadata = _read_json(directory / "registro.json", None)
            if isinstance(metadata, dict):
                essays.append(metadata)
        essays.sort(key=lambda item: item.get("created_at", ""), reverse=True)
        return jsonify(essays)

    title = str(request.form.get("titulo", "")).strip()
    uploaded = request.files.get("arquivo")
    if not title or len(title) > 160:
        abort(400, description="Informe um título com até 160 caracteres.")
    if not uploaded or not uploaded.filename:
        abort(400, description="Anexe a redação em TXT, PDF ou DOCX.")
    essay_id = uuid.uuid4().hex
    try:
        original_filename = _upload_file(REDACTIONS_DIR, essay_id, uploaded, {".txt", ".pdf", ".docx"})
        metadata = {
            "id": essay_id,
            "titulo": title,
            "data": datetime.now().strftime("%d/%m/%Y %H:%M"),
            "created_at": datetime.now().isoformat(timespec="seconds"),
            "original_arquivo": original_filename,
            "corrigido_arquivo": "",
            "feedback": "",
        }
        _write_json(_safe_child(REDACTIONS_DIR, essay_id, "registro.json"), metadata)
    except Exception:
        directory = _safe_child(REDACTIONS_DIR, essay_id)
        if directory.is_dir():
            for path in directory.iterdir():
                if path.is_file():
                    path.unlink()
            directory.rmdir()
        raise
    return jsonify(metadata), 201


@app.put("/api/redacoes/<essay_id>")
def api_update_essay(essay_id: str):
    if not re.fullmatch(r"[0-9a-f]{32}", essay_id):
        abort(400, description="Identificador de redação inválido.")
    directory = _safe_child(REDACTIONS_DIR, essay_id)
    metadata_path = _safe_child(directory, "registro.json")
    metadata = _read_json(metadata_path, None)
    if not isinstance(metadata, dict):
        abort(404, description="Redação não encontrada.")
    corrected = request.files.get("arquivo_corrigido")
    has_corrected_file = bool(corrected and corrected.filename)
    feedback = str(request.form.get("feedback", metadata.get("feedback", ""))).strip()
    if not has_corrected_file and feedback == str(metadata.get("feedback", "")).strip():
        abort(400, description="Anexe a redação corrigida ou atualize os comentários.")
    with LOCK:
        if has_corrected_file:
            metadata["corrigido_arquivo"] = _upload_file(
                REDACTIONS_DIR, essay_id, corrected, {".txt", ".pdf", ".docx"}
            )
        metadata["feedback"] = feedback
        metadata["corrigida_em"] = datetime.now().isoformat(timespec="seconds")
        _write_json(metadata_path, metadata)
    return jsonify(metadata)


@app.get("/api/pdfs")
def api_personal_pdfs():
    only_proofs = request.args.get("somente_provas") == "1"
    matches_proof = lambda value: "prova" in value.casefold()
    folders = [
        name for name in _folder_names(PDFS_DIR)
        if not only_proofs or matches_proof(name)
    ]
    folder = request.args.get("pasta", "")
    folder_details = [
        {
            "nome": name,
            "quantidade": sum(
                not only_proofs or matches_proof(item["name"])
                for item in _list_files(name, PDFS_DIR, {".pdf"})
            ),
        }
        for name in folders
    ]
    files = _list_files(folder, PDFS_DIR, {".pdf"}) if folder in folders else []
    if only_proofs:
        files = [item for item in files if matches_proof(item["name"])]
    return jsonify({
        "pastas": folders,
        "pastas_detalhes": folder_details,
        "arquivos": files,
    })


@app.post("/api/pdfs/pasta")
def api_create_pdf_folder():
    name = _clean_name(str(request.get_json(force=True).get("nome", "")))
    _safe_child(PDFS_DIR, name).mkdir(parents=True, exist_ok=True)
    return jsonify({"nome": name}), 201


def _personal_pdf_folder(name: str) -> Path:
    if (
        not name
        or name in {".", ".."}
        or Path(name).name != name
        or any(separator in name for separator in ("/", "\\", ":"))
    ):
        abort(400, description="Nome de pasta inválido.")
    directory = _safe_child(PDFS_DIR, name)
    if directory.parent != PDFS_DIR.resolve():
        abort(400, description="Caminho de pasta inválido.")
    return directory


@app.post("/api/pdfs/abrir-pasta")
def api_open_pdf_folder():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        abort(400, description="Informe a pasta de PDFs pessoais.")
    name = str(body.get("pasta", "")).strip()
    directory = _personal_pdf_folder(name)
    if directory.is_symlink() or not directory.is_dir():
        abort(404, description="Pasta de PDFs não encontrada.")
    if directory.parent != PDFS_DIR.resolve():
        abort(400, description="Caminho de pasta inválido.")
    if sys.platform != "win32":
        abort(501, description="Abrir pastas locais está disponível no Windows.")
    try:
        subprocess.Popen(["explorer.exe", str(directory)], close_fds=True)
    except OSError as exc:
        app.logger.exception("Falha ao abrir pasta pessoal de PDFs %s", name)
        abort(500, description=f"Não foi possível abrir a pasta no Explorador de Arquivos: {exc}")
    return jsonify({"ok": True})


@app.delete("/api/pdfs/pasta")
def api_delete_pdf_folder():
    name = str(request.args.get("pasta", "")).strip()
    directory = _personal_pdf_folder(name)
    if directory.is_symlink() or not directory.is_dir():
        abort(404, description="Pasta de PDFs não encontrada.")

    with LOCK:
        contents = list(directory.iterdir())
        if any(
            item.is_symlink() or not item.is_file() or item.suffix.lower() != ".pdf"
            for item in contents
        ):
            unexpected = [
                item.name for item in contents
                if item.is_symlink() or not item.is_file() or item.suffix.lower() != ".pdf"
            ]
            abort(
                409,
                description=(
                    "A pasta contém itens além de PDFs e foi preservada: "
                    + ", ".join(unexpected[:5])
                    + ("…" if len(unexpected) > 5 else "")
                ),
            )
        try:
            for item in contents:
                try:
                    item.unlink()
                except PermissionError:
                    os.chmod(item, 0o666)
                    item.unlink()
            try:
                directory.rmdir()
            except PermissionError:
                os.chmod(directory, 0o777)
                directory.rmdir()
        except OSError as exc:
            app.logger.exception("Falha ao remover pasta pessoal de PDFs %s", name)
            abort(
                409,
                description=(
                    f"Não foi possível remover '{getattr(exc, 'filename', '') or name}'. "
                    "Feche o PDF se estiver aberto em outra janela e tente novamente."
                ),
            )
    return jsonify({"ok": True, "arquivos_removidos": len(contents)})


@app.post("/api/pdfs/arquivo")
def api_upload_personal_pdf():
    name = _upload_file(PDFS_DIR, str(request.form.get("pasta", "")), request.files.get("arquivo"), {".pdf"})
    return jsonify({"arquivo": name}), 201


@app.delete("/api/pdfs/arquivo")
def api_delete_personal_pdf():
    path = _safe_child(PDFS_DIR, str(request.args.get("pasta", "")), str(request.args.get("arquivo", "")))
    if not path.is_file() or path.suffix.lower() != ".pdf":
        abort(404, description="PDF não encontrado.")
    path.unlink()
    return jsonify({"ok": True})


def _save_proof_with_answer(root: Path, bank: str, proof, answer_file, answer_text: str) -> dict:
    observations = str(request.form.get("observacoes", "")).strip()
    if len(observations) > 100_000:
        abort(413, description="As observações excedem o limite de 100.000 caracteres.")
    if answer_file and answer_file.filename and answer_text:
        abort(400, description="Envie o gabarito em arquivo ou digitado, não nos dois formatos.")
    if not (answer_file and answer_file.filename) and not answer_text:
        abort(400, description="Envie o gabarito em PDF/TXT ou digite as respostas.")
    try:
        answer_text = _read_answer_key_input(answer_file, answer_text)
        answer_map, _positional = _parse_answer_key_with_mode(answer_text)
    except ValueError as exc:
        abort(400, description=str(exc))
    if not answer_map:
        abort(400, description="Não consegui identificar respostas válidas no gabarito.")

    safe_bank = _clean_name(bank) or "Geral"
    proof_name = _upload_file(root, safe_bank, proof, {".pdf"})
    answer_name = f"{proof_name}.gabarito.txt"
    answer_path = _safe_child(root, safe_bank, answer_name)
    content = "GABARITO ASSOCIADO À PROVA\n" + "".join(
        f"{number}-{answer}\n" for number, answer in sorted(answer_map.items())
    )
    observations_path = _proof_observation_path(root, safe_bank, proof_name)
    try:
        with LOCK:
            answer_path.write_text(content, encoding="utf-8")
            _write_json(observations_path, {
                "observacoes": observations,
                "atualizado_em": datetime.now().isoformat(timespec="seconds"),
            })
    except OSError:
        proof_path = _safe_child(root, safe_bank, proof_name)
        if proof_path.is_file():
            proof_path.unlink()
        answer_path.unlink(missing_ok=True)
        observations_path.unlink(missing_ok=True)
        raise
    return {
        "banca": safe_bank,
        "arquivo": proof_name,
        "gabarito_arquivo": answer_name,
        "gabarito_questoes": len(answer_map),
        "observacoes": observations,
    }


def _proof_observation_path(root: Path, bank: str, filename: str) -> Path:
    return _safe_child(root, bank, f"{filename}.observacoes.json")


def _proof_corrections_path(root: Path, bank: str, filename: str) -> Path:
    return _safe_child(root, bank, f"{filename}.correcoes.json")


def _proof_corrections(root: Path, bank: str, filename: str) -> list[dict]:
    path = _proof_corrections_path(root, bank, filename)
    records = _read_json(path, [])
    if not isinstance(records, list) or any(not isinstance(item, dict) for item in records):
        raise RuntimeError(f"O arquivo {path.name} contém correções inválidas.")
    return records


def _proof_correction_rows() -> list[dict]:
    rows = []
    for kind, root in (
        ("provas", PROOFS_DIR),
        ("provas-com-gabarito", PROOFS_WITH_KEY_DIR),
    ):
        for bank in _folder_names(root):
            for item in _list_files(bank, root, {".pdf"}):
                proof_path = _safe_child(root, bank, item["name"])
                for correction in _proof_corrections(root, bank, item["name"]):
                    question = str(correction.get("questao", "")).strip()
                    if not question:
                        continue
                    try:
                        date = datetime.fromisoformat(
                            str(correction.get("criado_em", ""))
                        ).strftime("%d/%m/%Y")
                    except ValueError:
                        date = datetime.fromtimestamp(proof_path.stat().st_mtime).strftime("%d/%m/%Y")
                    rows.append({
                        "id": (
                            f"correcao-prova:{kind}:{bank}:{item['name']}:"
                            f"{correction.get('id', '')}"
                        ),
                        "data": date,
                        "materia": f"Provas · {bank}",
                        "tipo": "Questão errada (prova)",
                        "texto": f"Questão errada na prova: {question}",
                        "questao": {
                            "enunciado": question,
                            "alternativas": [],
                            "resposta": "",
                            "gabarito": "",
                            "comentario": "",
                        },
                        "correcao_prova": True,
                        "correcao_id": str(correction.get("id", "")),
                        "tipo_arquivo": kind,
                        "banca": bank,
                        "arquivo_prova": item["name"],
                    })
    return rows


def _all_error_notebook_entries() -> list[dict]:
    return _proof_correction_rows() + _annotations()


@app.get("/api/provas")
def api_proofs():
    banks = _folder_names(PROOFS_DIR)
    bank = request.args.get("banca", "")
    files = _list_files(bank, PROOFS_DIR, {".pdf"}) if bank else [
        {"banca": name, "arquivos": _list_files(name, PROOFS_DIR, {".pdf"})} for name in banks
    ]
    bank_files = [(bank, files)] if bank else [
        (item["banca"], item["arquivos"]) for item in files
    ]
    for proof_bank, proof_files in bank_files:
        for item in proof_files:
            item["correcoes"] = _proof_corrections(
                PROOFS_DIR, proof_bank, item["name"],
            )
            answer_name = f"{item['name']}.gabarito.txt"
            answer_path = _safe_child(PROOFS_DIR, proof_bank, answer_name)
            if answer_path.is_file():
                item["gabarito_arquivo"] = answer_name
                item["gabarito_questoes"] = len(
                    _parse_answer_key("\n".join(_read_lines(answer_path)[1:]))
                )
    return jsonify({"bancas": banks, "arquivos": files})


@app.post("/api/provas/banca")
def api_create_bank():
    name = _clean_name(str(request.get_json(force=True).get("nome", "")))
    path = _safe_child(PROOFS_DIR, name)
    if path.exists():
        abort(409, description="Essa banca já existe.")
    path.mkdir(parents=True, exist_ok=False)
    return jsonify({"nome": name}), 201


@app.post("/api/provas/arquivo")
def api_upload_proof():
    name = _upload_file(PROOFS_DIR, str(request.form.get("banca", "Geral")), request.files.get("arquivo"), {".pdf"})
    return jsonify({"arquivo": name}), 201


@app.post("/api/provas/arquivo-com-gabarito")
def api_upload_proof_with_answer():
    bank = str(request.form.get("banca", "Geral")).strip() or "Geral"
    result = _save_proof_with_answer(
        PROOFS_DIR,
        bank,
        request.files.get("arquivo"),
        request.files.get("arquivo_gabarito"),
        str(request.form.get("gabarito", "")).strip(),
    )
    return jsonify(result), 201


@app.route("/api/provas-com-gabarito", methods=["GET", "POST"])
def api_proofs_with_answer():
    if request.method == "POST":
        result = _save_proof_with_answer(
            PROOFS_WITH_KEY_DIR,
            str(request.form.get("banca", "Geral")).strip() or "Geral",
            request.files.get("arquivo"),
            request.files.get("arquivo_gabarito"),
            str(request.form.get("gabarito", "")).strip(),
        )
        return jsonify(result), 201

    banks = _folder_names(PROOFS_WITH_KEY_DIR)
    bank = request.args.get("banca", "").strip()
    files = []
    if bank in banks:
        for item in _list_files(bank, PROOFS_WITH_KEY_DIR, {".pdf"}):
            answer_name = f"{item['name']}.gabarito.txt"
            answer_path = _safe_child(PROOFS_WITH_KEY_DIR, bank, answer_name)
            if not answer_path.is_file():
                continue
            item["gabarito_arquivo"] = answer_name
            item["gabarito_questoes"] = len(
                _parse_answer_key("\n".join(_read_lines(answer_path)[1:]))
            )
            item["correcoes"] = _proof_corrections(
                PROOFS_WITH_KEY_DIR, bank, item["name"],
            )
            observation = _read_json(
                _proof_observation_path(PROOFS_WITH_KEY_DIR, bank, item["name"]),
                {},
            )
            item["observacoes"] = (
                str(observation.get("observacoes", ""))
                if isinstance(observation, dict) else ""
            )
            files.append(item)
    return jsonify({"bancas": banks, "arquivos": files})


@app.delete("/api/provas-com-gabarito/arquivo")
def api_delete_proof_with_answer():
    bank = str(request.args.get("banca", ""))
    filename = str(request.args.get("arquivo", ""))
    path = _safe_child(PROOFS_WITH_KEY_DIR, bank, filename)
    if not path.is_file() or path.suffix.lower() != ".pdf":
        abort(404, description="Prova com gabarito não encontrada.")
    answer_path = _safe_child(PROOFS_WITH_KEY_DIR, bank, f"{path.name}.gabarito.txt")
    with LOCK:
        path.unlink()
        answer_path.unlink(missing_ok=True)
        _proof_observation_path(PROOFS_WITH_KEY_DIR, bank, filename).unlink(missing_ok=True)
        _proof_corrections_path(PROOFS_WITH_KEY_DIR, bank, filename).unlink(missing_ok=True)
    return jsonify({"ok": True})


@app.put("/api/provas-com-gabarito/observacoes")
def api_update_proof_observations():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        abort(400, description="Informe as observações da prova.")
    bank = str(body.get("banca", "")).strip()
    filename = str(body.get("arquivo", "")).strip()
    proof_path = _safe_child(PROOFS_WITH_KEY_DIR, bank, filename)
    answer_path = _safe_child(PROOFS_WITH_KEY_DIR, bank, f"{filename}.gabarito.txt")
    if not bank or not filename or proof_path.suffix.lower() != ".pdf":
        abort(400, description="Informe a banca e o PDF da prova.")
    if not proof_path.is_file() or not answer_path.is_file():
        abort(404, description="Não foi encontrada uma prova com gabarito correspondente.")
    observations = str(body.get("observacoes", "")).strip()
    if len(observations) > 100_000:
        abort(413, description="As observações excedem o limite de 100.000 caracteres.")
    with LOCK:
        _write_json(
            _proof_observation_path(PROOFS_WITH_KEY_DIR, bank, filename),
            {
                "observacoes": observations,
                "atualizado_em": datetime.now().isoformat(timespec="seconds"),
            },
        )
    return jsonify({"ok": True, "observacoes": observations})


@app.route("/api/provas/correcoes", methods=["POST", "PUT", "DELETE"])
def api_proof_corrections():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        abort(400, description="Informe os dados da correção da prova.")
    kind = str(body.get("tipo_arquivo", "")).strip()
    roots = {
        "provas": PROOFS_DIR,
        "provas-com-gabarito": PROOFS_WITH_KEY_DIR,
    }
    root = roots.get(kind)
    bank = str(body.get("banca", "")).strip()
    filename = str(body.get("arquivo", "")).strip()
    if root is None or not bank or not filename:
        abort(400, description="Informe a origem, a banca e o PDF da prova.")
    proof_path = _safe_child(root, bank, filename)
    if proof_path.suffix.lower() != ".pdf":
        abort(400, description="A correção deve estar associada a um PDF de prova.")
    if not proof_path.is_file():
        abort(404, description="A prova associada à correção não foi encontrada.")

    correction_id = str(body.get("id", "")).strip()
    corrections_path = _proof_corrections_path(root, bank, filename)
    with LOCK:
        corrections = _proof_corrections(root, bank, filename)
        if request.method == "POST":
            question = str(body.get("questao", "")).strip()
            observations = str(body.get("observacoes", "")).strip()
            if not question:
                abort(400, description="Informe a questão errada.")
            if len(question) > 100_000 or len(observations) > 100_000:
                abort(413, description="A questão e as observações devem ter até 100.000 caracteres cada.")
            record = {
                "id": uuid.uuid4().hex,
                "questao": question,
                "observacoes": observations,
                "criado_em": datetime.now().isoformat(timespec="seconds"),
            }
            corrections.insert(0, record)
        else:
            record = next(
                (item for item in corrections if str(item.get("id", "")) == correction_id),
                None,
            )
            if record is None:
                abort(404, description="Correção da prova não encontrada.")
            if request.method == "DELETE":
                corrections.remove(record)
            else:
                question = str(body.get("questao", "")).strip()
                observations = str(body.get("observacoes", "")).strip()
                if not question:
                    abort(400, description="Informe a questão errada.")
                if len(question) > 100_000 or len(observations) > 100_000:
                    abort(413, description="A questão e as observações devem ter até 100.000 caracteres cada.")
                record.update({
                    "questao": question,
                    "observacoes": observations,
                    "atualizado_em": datetime.now().isoformat(timespec="seconds"),
                })
        _write_json(corrections_path, corrections)
    return jsonify({"ok": True, "correcoes": corrections})


@app.delete("/api/provas/arquivo")
def api_delete_proof():
    path = _safe_child(
        PROOFS_DIR,
        str(request.args.get("banca", "")),
        str(request.args.get("arquivo", "")),
    )
    if not path.is_file() or path.suffix.lower() != ".pdf":
        abort(404, description="Prova não encontrada.")
    answer_path = _safe_child(PROOFS_DIR, path.parent.name, f"{path.name}.gabarito.txt")
    with LOCK:
        path.unlink()
        answer_path.unlink(missing_ok=True)
        _proof_observation_path(PROOFS_DIR, path.parent.name, path.name).unlink(missing_ok=True)
        _proof_corrections_path(PROOFS_DIR, path.parent.name, path.name).unlink(missing_ok=True)
    return jsonify({"ok": True})


@app.get("/api/resumos")
def api_summaries():
    folders = _folder_names(SUMMARIES_DIR)
    folder = request.args.get("pasta", "")
    return jsonify({"pastas": folders, "arquivos": _list_files(folder, SUMMARIES_DIR, {".pdf", ".png", ".jpg", ".jpeg"}) if folder else []})


@app.post("/api/resumos/pasta")
def api_create_summary_folder():
    name = _clean_name(str(request.get_json(force=True).get("nome", "")))
    _safe_child(SUMMARIES_DIR, name).mkdir(parents=True, exist_ok=True)
    return jsonify({"nome": name}), 201


@app.post("/api/resumos/arquivo")
def api_upload_summary():
    name = _upload_file(SUMMARIES_DIR, str(request.form.get("pasta", "")), request.files.get("arquivo"), {".pdf", ".png", ".jpg", ".jpeg"})
    return jsonify({"arquivo": name}), 201


@app.delete("/api/resumos/arquivo")
def api_delete_summary():
    folder = str(request.args.get("pasta", "")).strip()
    filename = str(request.args.get("arquivo", "")).strip()
    if (
        not folder
        or "/" in folder
        or "\\" in folder
        or _clean_name(folder, fallback="") != folder
        or not filename
        or "/" in filename
        or "\\" in filename
    ):
        abort(400, description="Informe a pasta e o arquivo.")
    directory = _safe_child(SUMMARIES_DIR, folder)
    if not directory.is_dir():
        abort(404, description="Pasta de resumos não encontrada.")
    candidate = directory / filename
    if candidate.is_symlink():
        abort(400, description="O arquivo informado não é válido.")
    path = _safe_child(directory, filename)
    if path.suffix.lower() not in {".pdf", ".png", ".jpg", ".jpeg"} or not path.is_file():
        abort(404, description="Arquivo de resumo não encontrado.")
    with LOCK:
        path.unlink()
    return jsonify({"ok": True})


@app.route("/api/pontos", methods=["GET", "POST", "DELETE"])
def api_updates():
    path = _data_path("atualizacoes_legislativas.txt")
    rows = []
    for index, line in enumerate(_read_lines(path)):
        parts = _parse_pipe_line(line, 4)
        if parts:
            rows.append({"id": index, "data": parts[0], "materia": parts[1], "titulo": parts[2], "texto": " | ".join(parts[3:])})
    if request.method == "GET":
        return jsonify(rows)
    body = request.get_json(force=True)
    with LOCK:
        if request.method == "POST":
            if not str(body.get("titulo", "")).strip() or not str(body.get("texto", "")).strip():
                abort(400, description="Informe o título e o conteúdo.")
            rows.insert(0, {
                "data": str(body.get("data") or str(datetime.now().year)),
                "materia": str(body.get("materia") or "Geral"),
                "titulo": str(body["titulo"]).replace("|", "/").strip(),
                "texto": str(body["texto"]).replace("|", "/").strip(),
            })
        else:
            index = int(body.get("id", -1))
            if index < 0 or index >= len(rows):
                abort(404, description="Registro não encontrado.")
            rows.pop(index)
        _write_lines(path, [f"{r['data']} ||| {r['materia']} ||| {r['titulo']} ||| {r['texto']}" for r in rows])
    return jsonify(rows)


@app.route("/api/preferencias", methods=["GET", "PUT"])
def api_preferences():
    path = _data_path("preferencias_interface.json")
    if request.method == "GET":
        return jsonify(_read_json(path, {}))
    body = request.get_json(force=True)
    if not isinstance(body, dict):
        abort(400, description="Preferências inválidas.")
    allowed_themes = {"black-red", "black-blue", "baby-pink"}
    if body.get("tema") not in allowed_themes:
        abort(400, description="Tema não reconhecido.")
    _write_json(path, body)
    return jsonify(body)


def _parse_uploaded_questions(text: str) -> list[dict]:
    text = text.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    valid_answers = {"A", "B", "C", "D", "E"}
    parsed = []

    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("{"):
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(record, dict):
                continue
            prompt = str(record.get("enunciado", "")).strip()
            alternatives = _normalize_alternatives(record.get("alternativas"))
            if not alternatives:
                prompt, alternatives = _split_exam_question(_normalize_question_options(prompt))
            answer = _normalize_answer(str(record.get("gabarito", "")))
            if prompt and answer in valid_answers:
                parsed.append({
                    "numero": len(parsed) + 1,
                    "enunciado": prompt,
                    "alternativas": alternatives,
                    "gabarito": answer,
                    "comentario": str(record.get("comentario", "")).strip(),
                    "tipo": _question_type(prompt, answer, str(record.get("tipo", "")))
                    if str(record.get("tipo", "")).upper() in {"ME", "CE"}
                    else "ME" if alternatives else _question_type(prompt, answer),
                })
            continue
        parts = _parse_pipe_line(line, 2)
        if not parts:
            continue
        prompt = _normalize_question_options(parts[0])
        prompt, alternatives = _split_exam_question(prompt)
        answer = _normalize_answer(parts[1])
        if prompt and answer in valid_answers:
            parsed.append({
                "enunciado": prompt,
                "alternativas": alternatives,
                "gabarito": answer,
                "comentario": " | ".join(parts[2:]),
                "tipo": "ME" if alternatives else _question_type(prompt, answer),
            })
    if parsed:
        return parsed

    answer_map = {}
    question_text = text
    answer_section = re.search(
        r"(?im)^[ \t]*(?:gabarito(?:\s+oficial)?|respostas)[ \t]*:?[ \t]*(.*)$",
        text,
    )
    if answer_section:
        inline_key = answer_section.group(1).strip()
        if inline_key:
            answer_map = _parse_answer_key(inline_key)
            has_numbered_key = bool(re.search(r"(?<!\w)\d{1,4}\s*[-.):]?\s*(?:CERTO|ERRADO|[A-E])\b", inline_key, re.I))
        else:
            following_lines = []
            for line in text[answer_section.end():].splitlines():
                if not line.strip():
                    if following_lines:
                        break
                    continue
                if not re.match(r"^\s*\d{1,4}\s*[-.):]?\s*(?:CERTO|ERRADO|[A-E])\b", line, re.I):
                    break
                following_lines.append(line)
            answer_map = _parse_answer_key("\n".join(following_lines))
            has_numbered_key = bool(following_lines)
        if answer_map and has_numbered_key:
            question_text = text[:answer_section.start()]

    starts = list(re.finditer(
        r"(?im)^[ \t]*(?:(?:quest(?:ão|ao)|question)[ \t]*)?(\d{1,4})(?:[ \t]*[.)\-:][ \t]*|[ \t]*$)",
        question_text,
    ))
    blocks = []
    if starts:
        for index, start in enumerate(starts):
            end = starts[index + 1].start() if index + 1 < len(starts) else len(question_text)
            blocks.append((int(start.group(1)), question_text[start.end():end].strip()))
    else:
        blocks = [(1, question_text.strip())] if question_text.strip() else []

    option_line = re.compile(
        r"(?m)^[ \t]*(?:\(([A-E])\)|\[([A-E])\]|([A-E])[).:\-])[ \t]*(.+?)[ \t]*$",
        re.I,
    )
    for number, block in blocks:
        answer_match = re.search(
            r"(?im)^\s*(?:gabarito|resposta|answer)\s*[:=-]\s*(.+?)\s*$",
            block,
        )
        answer = _normalize_answer(answer_match.group(1)) if answer_match else answer_map.get(number, "")
        if answer not in valid_answers:
            continue
        content = re.sub(
            r"(?im)^\s*(?:gabarito|resposta|answer)\s*[:=-].*$",
            "",
            block,
        )
        comment_match = re.search(
            r"(?im)^\s*(?:coment[aá]rio|justificativa|explica[cç][aã]o)\s*[:=-]\s*(.*)$",
            content,
        )
        comment = ""
        if comment_match:
            comment = content[comment_match.start():].split(":", 1)[-1].strip()
            content = content[:comment_match.start()]
        matches = list(option_line.finditer(content))
        option_keys = {
            (match.group(1) or match.group(2) or match.group(3)).upper()
            for match in matches
        }
        if len(option_keys) >= 2:
            content = option_line.sub(
                lambda match: f"[{(match.group(1) or match.group(2) or match.group(3)).upper()}] {match.group(4).strip()}",
                content,
            )
        prompt = _normalize_question_options(content)
        prompt = re.sub(r"\s+", " ", prompt).strip()
        prompt, alternatives = _split_exam_question(prompt)
        if prompt:
            parsed.append({
                "numero": number,
                "enunciado": prompt,
                "alternativas": alternatives,
                "gabarito": answer,
                "comentario": comment,
                "tipo": "ME" if alternatives else _question_type(prompt, answer),
            })
    return parsed


@app.post("/api/utilidades/questoes")
def api_import_questions():
    uploaded = request.files.get("arquivo")
    if not uploaded or Path(uploaded.filename).suffix.lower() != ".txt":
        abort(400, description="Selecione um arquivo .txt.")
    content = uploaded.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        abort(413, description="O arquivo de questões excede o limite de 5 MB.")
    material = str(request.form.get("materia", "")).strip() or _display_name(Path(uploaded.filename).name)
    questions = _parse_uploaded_questions(content.decode("utf-8-sig", errors="replace"))
    if not questions:
        abort(400, description="Não encontrei questões reconhecidas. Use uma linha 'enunciado | gabarito | comentário' ou questões numeradas com gabarito.")
    if any(_question_header_count(question["enunciado"]) > 1 for question in questions):
        abort(400, description="O TXT ainda contém várias questões agrupadas com um único gabarito. Separe as questões e informe o gabarito de cada uma antes de importar.")
    as_simulation = request.form.get("como_simulado") == "on"
    if as_simulation:
        title = _display_name(Path(uploaded.filename).name)
        record = _save_submitted_simulation(
            title, _display_name(material), Path(uploaded.filename).name, questions,
        )
        return jsonify({
            "importadas": len(questions),
            "materia": record["materia"],
            "simulado": True,
            "titulo": title,
        }), 201

    path = _safe_child(QUESTIONS_DIR, _clean_name(material) + ".txt")
    QUESTIONS_DIR.mkdir(exist_ok=True)
    with LOCK:
        with path.open("a", encoding="utf-8") as stream:
            for question in questions:
                stream.write(json.dumps(question, ensure_ascii=False) + "\n")
    return jsonify({"importadas": len(questions), "materia": _display_name(path.name), "simulado": False}), 201


@app.post("/api/utilidades/questao-manual")
def api_add_manual_question():
    body = request.get_json(force=True)
    if not isinstance(body, dict):
        abort(400, description="Dados da questão inválidos.")

    material = str(body.get("materia", "")).strip()
    prompt = str(body.get("enunciado", "")).strip()
    if not material or not prompt:
        abort(400, description="Informe a disciplina e o enunciado da questão.")

    alternatives_text = str(body.get("alternativas", "")).strip()
    alternatives = []
    if alternatives_text:
        option_pattern = re.compile(r"^\s*(?:\[([A-E])\]|([A-E])[).:\-])\s*(.+?)\s*$", re.I)
        for line in alternatives_text.splitlines():
            if not line.strip():
                continue
            match = option_pattern.fullmatch(line)
            if not match:
                abort(400, description="Cada alternativa deve estar em uma linha no formato A) texto.")
            alternatives.append({
                "letra": (match.group(1) or match.group(2)).upper(),
                "texto": match.group(3).strip(),
            })
        if len(alternatives) < 2 or len({item["letra"] for item in alternatives}) != len(alternatives):
            abort(400, description="Informe pelo menos duas alternativas com letras diferentes.")

    answer = _normalize_answer(str(body.get("gabarito", "")))
    allowed_answers = {item["letra"] for item in alternatives} if alternatives else {"C", "E"}
    if answer not in allowed_answers:
        expected = "uma das alternativas informadas" if alternatives else "C (Certo) ou E (Errado)"
        abort(400, description=f"Informe um gabarito válido: {expected}.")

    question = {
        "enunciado": prompt,
        "alternativas": alternatives,
        "gabarito": answer,
        "comentario": str(body.get("comentario", "")).strip(),
        "tipo": "ME" if alternatives else "CE",
    }
    path = _safe_child(QUESTIONS_DIR, _clean_name(material) + ".txt")
    QUESTIONS_DIR.mkdir(exist_ok=True)
    with LOCK:
        with path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(question, ensure_ascii=False) + "\n")
    return jsonify({
        "materia": _display_name(path.name),
        "questao": question,
    }), 201


@app.post("/api/utilidades/drive-backup")
def api_drive_backup():
    import drive_sync
    try:
        files = drive_sync.executar_backup_geral()
    except drive_sync.DrivePermissionError as exc:
        app.logger.exception("A API do Google Drive negou o backup")
        return jsonify({"erro": str(exc)}), 403
    except Exception as exc:
        app.logger.exception("Falha ao criar backup no Google Drive")
        return jsonify({"erro": f"Não foi possível criar o backup no Google Drive: {exc}"}), 502
    failures = [name for name in files if "(ERRO:" in name]
    if failures:
        return jsonify({
            "erro": "O backup foi parcial. Falharam: " + ", ".join(failures),
            "arquivos": files,
        }), 502
    return jsonify({"arquivos": files, "pasta": "Backup_CentralEstudos"})


@app.post("/api/utilidades/drive-test")
def api_drive_test():
    import drive_sync
    try:
        result = drive_sync.testar_conexao()
    except drive_sync.DrivePermissionError as exc:
        app.logger.exception("A API do Google Drive negou a validação de permissões")
        return jsonify({"erro": str(exc)}), 403
    except Exception as exc:
        app.logger.exception("Falha ao testar conexão com o Google Drive")
        return jsonify({"erro": f"Não foi possível conectar ao Google Drive: {exc}"}), 502
    return jsonify(result)


@app.post("/api/utilidades/drive-restore")
def api_drive_restore():
    import drive_sync
    try:
        files = drive_sync.baixar_backup()
    except drive_sync.DrivePermissionError as exc:
        app.logger.exception("A API do Google Drive negou a restauração")
        return jsonify({"erro": str(exc)}), 403
    except Exception as exc:
        app.logger.exception("Falha ao restaurar backup do Google Drive")
        return jsonify({"erro": f"Não foi possível restaurar o backup do Google Drive: {exc}"}), 502
    return jsonify({
        "arquivos": files,
        "pasta": "Backup_CentralEstudos",
        "backup_local_criado": True,
    })


@app.post("/api/utilidades/converter-pdf")
def api_convert_pdf():
    uploaded = request.files.get("arquivo")
    if not uploaded or Path(uploaded.filename).suffix.lower() != ".pdf":
        abort(400, description="Selecione um PDF.")
    from io import BytesIO
    from PyPDF2 import PdfReader
    pdf_content = uploaded.read(25 * 1024 * 1024 + 1)
    if len(pdf_content) > 25 * 1024 * 1024:
        abort(413, description="O PDF excede o limite de 25 MB.")
    try:
        text = "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(pdf_content)).pages)
    except Exception as exc:
        abort(400, description=f"Não foi possível ler o PDF: {exc}")
    if not text.strip():
        abort(422, description="Este PDF não contém texto selecionável; OCR não está disponível nesta versão.")
    folder_name = str(request.form.get("pasta", "")).strip() or Path(uploaded.filename).stem
    folder = _clean_name(folder_name, "Legislacao")
    directory = _safe_child(LAWS_DIR, folder)
    normalized_text = text.replace("\f", "\n")
    devices = _split_law_devices(normalized_text)
    if not devices:
        abort(422, description="Não foi possível identificar artigos e dispositivos legais no texto do PDF.")
    formatted = "".join(
        f"{item['dispositivo']} ||| Não Classificado ||| {item['texto'].replace('|', '/')}\n"
        for item in devices
        if item["texto"].strip()
    )
    if not formatted.strip():
        abort(422, description="Não foi possível separar o texto da legislação em dispositivos.")
    output = directory / f"{folder}_formatada.txt"
    with LOCK:
        if directory.exists():
            abort(409, description=f"A pasta de legislação '{folder}' já existe; escolha outro nome para evitar sobrescrever dados.")
        directory.mkdir(parents=True, exist_ok=False)
        output.write_text(formatted, encoding="utf-8")
    return jsonify({
        "pasta": folder,
        "arquivo": output.name,
        "caracteres": len(formatted),
        "dispositivos": len(formatted.splitlines()),
    })


def _normalize_key_answer(value: str) -> str:
    answer = value.strip().upper()
    if answer == "CERTO":
        return "C"
    if answer == "ERRADO":
        return "E"
    return answer


def _parse_answer_key_with_mode(text: str) -> tuple[dict[int, str], bool]:
    text = text.replace("\u00a0", " ").replace("\u2007", " ").replace("\u202f", " ")
    explicit_pattern = re.compile(
        r"(?i)(?<!\w)(?:quest(?:ão|ao)?[ \t]*(?:n[º°o]?[.]?[ \t]*)?)?"
        r"(\d{1,4})[ \t]*(?:[.,:)|\-\u2013\u2014][ \t]*|[ \t]+)"
        r"(CERTO|ERRADO|[A-E])\b"
    )
    explicit_answers: dict[int, str] = {}
    for match in explicit_pattern.finditer(text):
        number = int(match.group(1))
        answer = _normalize_key_answer(match.group(2))
        previous = explicit_answers.get(number)
        if previous is not None and previous != answer:
            raise ValueError(f"O gabarito informa respostas diferentes para a questão {number}.")
        explicit_answers[number] = answer
    if explicit_answers:
        return explicit_answers, False

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    heading_pattern = re.compile(
        r"(?i)^(?:gabarito|respostas?)(?:[ \t]+(?:oficial|da[ \t]+prova|das?[ \t]+questões?))*"
        r"[ \t]*:?[ \t]*(.*)$"
    )
    sequence_lines = []
    for line in lines:
        heading = heading_pattern.fullmatch(line)
        if heading:
            if heading.group(1).strip():
                sequence_lines.append(heading.group(1).strip())
            continue
        sequence_lines.append(line)

    number_row_pattern = re.compile(r"\d{1,4}(?:[ \t,;|/]+\d{1,4})*")
    answer_row_pattern = re.compile(r"(?i)(?:CERTO|ERRADO|[A-E])(?:[ \t,;|/]+(?:CERTO|ERRADO|[A-E]))*")
    for index, line in enumerate(sequence_lines[:-1]):
        if not number_row_pattern.fullmatch(line) or not answer_row_pattern.fullmatch(sequence_lines[index + 1]):
            continue
        numbers = [int(item) for item in re.findall(r"\d{1,4}", line)]
        values = re.findall(r"(?i)CERTO|ERRADO|[A-E]", sequence_lines[index + 1])
        if len(numbers) == len(values) and len(set(numbers)) == len(numbers):
            return {
                number: _normalize_key_answer(value)
                for number, value in zip(numbers, values)
            }, False

    sequence = " ".join(sequence_lines).strip()
    if answer_row_pattern.fullmatch(sequence):
        values = re.findall(r"(?i)CERTO|ERRADO|[A-E]", sequence)
        return {
            index: _normalize_key_answer(answer)
            for index, answer in enumerate(values, start=1)
        }, True
    return {}, False


def _parse_answer_key(text: str) -> dict[int, str]:
    return _parse_answer_key_with_mode(text)[0]


def _extract_pdf_text(content: bytes, kind: str) -> str:
    from io import BytesIO
    from PyPDF2 import PdfReader

    try:
        text = "\n\f\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(content)).pages)
    except Exception as exc:
        abort(400, description=f"Não foi possível ler o PDF de {kind}: {exc}")
    if not text.strip():
        abort(
            422,
            description=(
                f"O PDF de {kind} não contém texto selecionável; OCR não está disponível. "
                "Envie um arquivo com texto ou digite/cole as respostas."
            ),
        )
    return text


def _read_answer_key_input(answer_file, answer_text: str) -> str:
    if answer_file and answer_file.filename:
        if answer_text.strip():
            abort(400, description="Envie o gabarito em arquivo ou digitado, não nos dois formatos.")
        suffix = Path(answer_file.filename).suffix.lower()
        if suffix not in {".txt", ".pdf"}:
            abort(400, description="O gabarito deve ser um arquivo .txt ou .pdf.")
        content = answer_file.read()
        return (
            _extract_pdf_text(content, "gabarito")
            if suffix == ".pdf"
            else content.decode("utf-8-sig", errors="replace")
        )
    return answer_text


def _find_exam_option_matches(text: str) -> list[re.Match]:
    parenthesized_pattern = re.compile(
        r"(?<!\w)(?:\(([A-E])\)|\[([A-E])\])[ \t]*",
        re.I,
    )
    parenthesized = list(parenthesized_pattern.finditer(text))
    parenthesized_keys = [
        (match.group(1) or match.group(2)).upper()
        for match in parenthesized
    ]
    if len(parenthesized_keys) >= 2 and parenthesized_keys == list("ABCDE"[:len(parenthesized_keys)]):
        return parenthesized
    option_pattern = re.compile(
        r"(?<!\w)(?:\(([A-E])\)|\[([A-E])\]|([A-E])[).\-\u2013\u2014])[ \t]*",
        re.I,
    )
    return list(option_pattern.finditer(text))


def _extract_ce_numbered_exam_blocks(text: str) -> list[dict] | None:
    if not re.search(r"(?is)\bjulgue\b.{0,200}\b(?:itens?|afirmativas?)\b", text):
        return None

    marker_pattern = re.compile(
        r"(?m)(?:^[ \t]*|(?<=[.!?]))(\d{1,3})[ \t]*(?=[A-ZÀ-ÖØ-Þ])"
    )
    markers = [
        match for match in marker_pattern.finditer(text)
        if 1 <= int(match.group(1)) <= 300
    ]
    paths: dict[int, tuple[int, list[int]]] = {}
    markers_by_number: dict[int, list[int]] = {}
    for index, marker in enumerate(markers):
        number = int(marker.group(1))
        best_path = (1, [index]) if number == 1 else (0, [])
        for previous_index in markers_by_number.get(number - 1, []):
            previous_length, previous_path = paths[previous_index]
            gap = text[markers[previous_index].end():marker.start()].strip()
            candidate_path = (previous_length + 1, [*previous_path, index])
            if (
                candidate_path[0] > best_path[0]
                or (
                    candidate_path[0] == best_path[0]
                    and len(gap) >= 20
                    and len(text[marker.end():].strip()) >= 20
                )
            ):
                best_path = candidate_path
        if best_path[0]:
            paths[index] = best_path
            markers_by_number.setdefault(number, []).append(index)

    longest_path = max(paths.values(), key=lambda path: path[0], default=(0, []))
    if longest_path[0] < 5:
        return None
    starts = [markers[index] for index in longest_path[1]]
    if int(starts[0].group(1)) != 1:
        return None

    prefix = text[:starts[0].start()]
    text_anchor = list(re.finditer(
        r"\bTexto[ \t]+CB[A-Z0-9]{3,}\b",
        prefix,
    ))
    if text_anchor:
        active_context = prefix[text_anchor[-1].start():].strip()
    else:
        active_context = ""

    directive_pattern = re.compile(
        r"(?is)\b(?:julgue|julguem)\b.{0,220}\b(?:itens?|afirmativas?)\b"
    )
    sentence_boundary = re.compile(
        r"(?<![Rr]\.)(?<=[.!?])(?:[ \t]*(?:\r?\n)+[ \t]*|[ \t]+)(?=\S)"
    )
    context_anchor = re.compile(
        r"\bTexto[ \t]+CB[A-Z0-9]{3,}\b"
        r"|\bCONHECIMENTOS\b"
    )
    blocks = []
    for index, start in enumerate(starts):
        end = starts[index + 1].start() if index + 1 < len(starts) else len(text)
        item_text = text[start.end():end].strip()
        directive_matches = list(directive_pattern.finditer(item_text))
        if directive_matches:
            directive = directive_matches[-1]
            preceding = item_text[:directive.start()]
            anchor = context_anchor.search(preceding)
            if anchor:
                boundaries = list(
                    sentence_boundary.finditer(preceding, 0, anchor.start())
                )
                boundary = boundaries[-1] if boundaries else None
            else:
                boundary = sentence_boundary.search(preceding)
            has_anchor = anchor is not None
            if boundary and (
                has_anchor
                or len(preceding[boundary.end():].strip()) >= 20
            ):
                item_end = boundary.start()
                context_start = boundary.end()
            elif anchor:
                item_end = anchor.start()
                context_start = anchor.start()
            else:
                item_end = directive.start()
                context_start = directive.start()
            next_context = item_text[context_start:].strip()
            item_text = item_text[:item_end].strip()
            if next_context:
                context_before_directive = (
                    preceding[context_start:directive.start()]
                    if context_start <= directive.start()
                    else ""
                )
                has_passage = (
                    (anchor and anchor.group(0).startswith("Texto"))
                    or len(context_before_directive.strip()) >= 120
                )
                if (
                    not has_passage
                    and active_context
                    and re.search(
                        r"(?i)\b(?:texto|parágrafo|passagem|excerto)\b",
                        " ".join((context_before_directive, directive.group(0))),
                    )
                ):
                    active_context = " ".join((active_context, next_context))
                else:
                    active_context = next_context

        normalized = _normalize_question_options(item_text)
        options = _find_exam_option_matches(normalized)
        option_keys = [
            (match.group(1) or match.group(2) or match.group(3)).upper()
            for match in options
        ]
        if len(option_keys) >= 2 and option_keys == list("ABCDE"[:len(option_keys)]):
            first = options[0].start()
            statement = " ".join(normalized[:first].split())
            alternatives = []
            for option_index, option in enumerate(options):
                option_end = (
                    options[option_index + 1].start()
                    if option_index + 1 < len(options)
                    else len(normalized)
                )
                option_text = " ".join(normalized[option.end():option_end].split())
                if option_text:
                    key = (
                        option.group(1)
                        or option.group(2)
                        or option.group(3)
                    ).upper()
                    alternatives.append({"letra": key, "texto": option_text})
            kind = "ME"
        else:
            statement = " ".join(normalized.split())
            alternatives = []
            kind = "CE"
        if active_context:
            statement = " ".join((active_context, statement)).strip()
        if statement:
            blocks.append({
                "numero": int(start.group(1)),
                "enunciado": statement,
                "alternativas": alternatives,
                "gabarito": "",
                "comentario": "",
                "tipo": kind,
            })
    return blocks


def _extract_exam_question_blocks(text: str) -> list[dict]:
    text = _clean_repeated_exam_page_margins(text)
    answer_section = re.search(
        r"(?im)^[ \t]*(?:gabarito|respostas?)"
        r"(?:[ \t]+(?:oficial|preliminar|definitivo))?"
        r"[ \t]*[:\-\u2013\u2014]?[ \t]*"
        r"(?:(?=\d{1,4}[ \t]*[-:.)][ \t]*[A-E]\b"
        r"|[A-E](?:[ \t]*[,;/][ \t]*[A-E]){2,}\b"
        r"|[A-E](?:[ \t]+[A-E]){2,}\b).*)?$",
        text,
    )
    if answer_section:
        text = text[:answer_section.start()]
    ceb_blocks = _extract_ce_numbered_exam_blocks(text)
    if ceb_blocks is not None:
        return ceb_blocks
    question_headers = re.compile(
        r"(?:^[ \t]*|(?<=[.!?]))(?:(?:quest(?:ão|ao)|question)[ \t]*"
        r"(?:n[º°o]?[.]?[ \t]*)?#?[ \t]*(\d{1,4})(?=[ \t.)\-:\u2013\u2014]|$)"
        r"[ \t]*[.)\-:\u2013\u2014]?[ \t]*|(\d{1,4})[ \t]*[.)\-:\u2013\u2014][ \t]*)",
        re.I | re.M,
    )
    candidates = list(question_headers.finditer(text))
    def has_question_structure(block: str) -> bool:
        block = _normalize_question_options(block)
        option_matches = _find_exam_option_matches(block)
        option_keys = [
            (match.group(1) or match.group(2) or match.group(3)).upper()
            for match in option_matches
        ]
        return (
            len(option_keys) >= 2
            and option_keys == list("ABCDE"[:len(option_keys)])
        ) or bool(re.search(
            r"(?i)\b(?:julgue|certo ou errado|certo/errado)\b",
            block,
        ))

    explicit_starts = []
    for candidate in candidates:
        if not candidate.group(1):
            continue
        is_line_header = candidate.start() == 0 or text.rfind("\n", 0, candidate.start()) == candidate.start() - 1
        if (
            is_line_header
            or (
                explicit_starts
                and has_question_structure(
                    text[explicit_starts[-1].end():candidate.start()]
                )
            )
        ):
            explicit_starts.append(candidate)
    if explicit_starts:
        # Explicit "Questão N" markers are authoritative; bare numbered lines
        # inside an enunciado often refer to legal articles, dates, or examples.
        starts = explicit_starts
    else:
        numbered_starts: list[int] = []
        chains_by_number: dict[int, list[int]] = {}
        best_path_to: dict[int, tuple[int, int, list[int]]] = {}
        for index, candidate in enumerate(candidates):
            number = int(candidate.group(2))
            if not 1 <= number <= 300:
                continue
            best_path = (1, 0, [index])
            for previous_index in chains_by_number.get(number - 1, []):
                previous_length, previous_score, previous_chain = best_path_to[previous_index]
                segment = text[
                    candidates[previous_index].end():candidate.start()
                ]
                path = (
                    previous_length + 1,
                    previous_score + int(has_question_structure(segment)),
                    [*previous_chain, index],
                )
                if path[:2] > best_path[:2]:
                    best_path = path
            best_path_to[index] = best_path
            chains_by_number.setdefault(number, []).append(index)
            numbered_starts.append(index)
        longest_path = max(
            (
                (
                    length,
                    score + int(has_question_structure(text[candidates[index].end():])),
                    chain,
                )
                for index, (length, score, chain) in best_path_to.items()
            ),
            key=lambda path: path[:2],
            default=(0, 0, []),
        )
        longest_chain = longest_path[2]
        if len(longest_chain) >= 2:
            starts = [candidates[index] for index in longest_chain]
        elif len(numbered_starts) == 1:
            candidate = candidates[numbered_starts[0]]
            remainder = text[candidate.end():]
            if has_question_structure(remainder):
                starts = [candidate]
            else:
                starts = []
        else:
            starts = []

    blocks = []
    for index, start in enumerate(starts):
        number = int(start.group(1) or start.group(2))
        end = starts[index + 1].start() if index + 1 < len(starts) else len(text)
        block = text[start.end():end].strip()
        if not block:
            continue
        block = _normalize_question_options(block)
        options = _find_exam_option_matches(block)
        option_keys = [
            (match.group(1) or match.group(2) or match.group(3)).upper()
            for match in options
        ]
        if len(option_keys) >= 2 and option_keys == list("ABCDE"[:len(option_keys)]):
            first = options[0].start()
            prompt = " ".join(block[:first].split())
            alternatives = []
            for option_index, option in enumerate(options):
                option_end = options[option_index + 1].start() if option_index + 1 < len(options) else len(block)
                option_text = " ".join(block[option.end():option_end].split())
                if option_text:
                    key = (option.group(1) or option.group(2) or option.group(3)).upper()
                    alternatives.append({"letra": key, "texto": option_text})
            kind = "ME"
            statement = prompt
        else:
            statement = " ".join(block.split())
            alternatives = []
            kind = "CE"
        blocks.append({
            "numero": number,
            "enunciado": statement,
            "alternativas": alternatives,
            "gabarito": "",
            "comentario": "",
            "tipo": kind,
        })
    return blocks


def _clean_repeated_exam_page_margins(text: str) -> str:
    pages = text.split("\f")
    if len(pages) < 2:
        return text

    def normalized(line: str) -> str:
        return re.sub(r"\s+", " ", line).strip().casefold()

    margin_counts: dict[str, int] = {}
    for page in pages:
        lines = [line for line in page.splitlines() if line.strip()]
        margins = {
            normalized(line)
            for line in lines[:3] + lines[-3:]
            if normalized(line)
        }
        for line in margins:
            margin_counts[line] = margin_counts.get(line, 0) + 1
    repeated_margins = {
        line for line, count in margin_counts.items()
        if count >= 2
    }
    question_header = re.compile(
        r"(?i)^[ \t]*(?:(?:quest(?:ão|ao)|question)[ \t]*"
        r"(?:n[º°o]?[.]?[ \t]*)?#?[ \t]*\d{1,4}(?=[ \t.)\-:\u2013\u2014]|$)"
        r"[ \t]*[.)\-:\u2013\u2014]?[ \t]*|\d{1,3}[ \t]*[.)\-:\u2013\u2014][ \t]+)"
    )
    kept_question_headers = set()

    cleaned_pages = []
    for page in pages:
        lines = page.splitlines()
        nonempty_indexes = [index for index, line in enumerate(lines) if line.strip()]
        margin_indexes = set(nonempty_indexes[:3] + nonempty_indexes[-3:])
        kept_lines = []
        for index, line in enumerate(lines):
            key = normalized(line)
            if index not in margin_indexes:
                kept_lines.append(line)
                continue
            if re.fullmatch(r"(?:p[aá]gina\s*)?\d{1,4}", key, re.I):
                continue
            if key not in repeated_margins:
                kept_lines.append(line)
                continue
            if question_header.match(line):
                if key not in kept_question_headers:
                    kept_question_headers.add(key)
                    kept_lines.append(line)
                continue
        cleaned_pages.append("\n".join(kept_lines))
    return "\n".join(cleaned_pages)


def _parse_exam_questions(
    text: str,
    answers: dict[int, str],
    positional: bool = False,
) -> list[dict]:
    blocks = _extract_exam_question_blocks(text)
    if positional and len(answers) != len(blocks):
        return []
    parsed = []
    ordered_answers = [answers[index] for index in sorted(answers)]
    for index, block in enumerate(blocks):
        answer = ordered_answers[index] if positional else answers.get(block["numero"], "")
        if not answer:
            continue
        option_letters = {item["letra"] for item in block["alternativas"]}
        if option_letters and answer not in option_letters:
            continue
        if not option_letters and answer not in {"C", "E"}:
            continue
        parsed.append({**block, "gabarito": answer})
    return parsed


def _split_exam_question(prompt: str) -> tuple[str, list[dict[str, str]]]:
    prompt = _normalize_question_options(prompt)
    matches = _find_exam_option_matches(prompt)
    keys = [
        (match.group(1) or match.group(2) or match.group(3)).upper()
        for match in matches
    ]
    if len(keys) < 2 or keys != list("ABCDE"[:len(keys)]):
        return prompt.strip(), []
    alternatives = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(prompt)
        text = " ".join(prompt[match.end():end].split())
        if text:
            alternatives.append({"letra": keys[index], "texto": text})
    return " ".join(prompt[:matches[0].start()].split()), alternatives


@app.post("/api/utilidades/prova")
def api_convert_exam():
    uploaded_pdf = request.files.get("arquivo")
    if not uploaded_pdf or Path(uploaded_pdf.filename).suffix.lower() != ".pdf":
        abort(400, description="Selecione o PDF da prova.")
    materia = str(request.form.get("materia", "")).strip() or _display_name(Path(uploaded_pdf.filename).name)
    answer_text = _read_answer_key_input(
        request.files.get("arquivo_gabarito"),
        str(request.form.get("gabarito", "")).strip(),
    )
    try:
        answer_map, positional = _parse_answer_key_with_mode(answer_text)
    except ValueError as exc:
        abort(400, description=str(exc))
    if not answer_map:
        abort(
            400,
            description=(
                "Não consegui identificar o gabarito. Use, por exemplo, "
                "1-A, 2: C, 3) ERRADO, 4 – B ou uma sequência (A B C D E)."
            ),
        )
    exam_text = _extract_pdf_text(uploaded_pdf.read(), "prova")
    question_blocks = _extract_exam_question_blocks(exam_text)
    if not question_blocks:
        abort(422, description="Não consegui identificar questões numeradas e associá-las ao gabarito. Confira o texto do PDF e o formato do gabarito.")
    question_numbers = [question["numero"] for question in question_blocks]
    if positional and len(answer_map) != len(question_blocks):
        abort(
            422,
            description=(
                f"O gabarito tem {len(answer_map)} resposta(s), mas a prova contém "
                f"{len(question_blocks)} questão(ões)."
            ),
        )
    if len(set(question_numbers)) != len(question_numbers):
        if not positional:
            repeated = sorted(
                number for number in set(question_numbers)
                if question_numbers.count(number) > 1
            )
            abort(
                422,
                description=(
                    "A prova contém numeração ambígua nas questões "
                    f"{', '.join(map(str, repeated))}. Para evitar associar o gabarito errado, "
                    "envie as respostas em sequência posicional (A B C...) ou revise o PDF."
                ),
            )
    answer_issues = []
    if not positional:
        missing_answers = sorted(set(question_numbers) - set(answer_map))
        unmatched_answers = sorted(set(answer_map) - set(question_numbers))
        if missing_answers:
            answer_issues.append(
                f"Não há resposta no gabarito para a(s) questão(ões): "
                f"{', '.join(map(str, missing_answers))}."
            )
        if unmatched_answers:
            answer_issues.append(
                "O gabarito contém número(s) sem questão correspondente: "
                f"{', '.join(map(str, unmatched_answers))}."
            )
    ordered_answers = [answer_map[index] for index in sorted(answer_map)]
    incompatible_answers = []
    for index, question in enumerate(question_blocks):
        answer = (
            ordered_answers[index]
            if positional and index < len(ordered_answers)
            else answer_map.get(question["numero"], "")
        )
        if not answer:
            continue
        option_letters = {
            option["letra"] for option in question["alternativas"]
        }
        if (
            (option_letters and answer not in option_letters)
            or (not option_letters and answer not in {"C", "E"})
        ):
            incompatible_answers.append(f'{question["numero"]} ({answer})')
    if incompatible_answers:
        answer_issues.append(
            "O gabarito não corresponde ao formato de resposta das "
            "questões: " + ", ".join(incompatible_answers) + "."
        )
    if answer_issues:
        abort(422, description=" ".join(answer_issues))
    questions = _parse_exam_questions(exam_text, answer_map, positional)
    if len(questions) != len(question_blocks):
        abort(
            422,
            description=(
                "Não foi possível associar todas as respostas às questões extraídas. "
                "Confira as alternativas e o formato do gabarito."
            ),
        )
    if request.form.get("como_simulado") == "on":
        record = _save_submitted_simulation(
            _display_name(Path(uploaded_pdf.filename).name),
            _display_name(materia),
            Path(uploaded_pdf.filename).name,
            questions,
        )
        return jsonify({
            "importadas": len(record["questoes"]),
            "materia": record["materia"],
            "simulado": True,
            "simulado_id": record["id"],
            "titulo": record["titulo"],
        }), 201

    QUESTIONS_DIR.mkdir(exist_ok=True)
    path = _safe_child(QUESTIONS_DIR, _clean_name(materia) + ".txt")
    with LOCK, path.open("a", encoding="utf-8") as stream:
        for question in questions:
            stream.write(json.dumps(question, ensure_ascii=False) + "\n")
    return jsonify({"importadas": len(questions), "materia": _display_name(path.name)}), 201


@app.post("/api/utilidades/prova-txt")
def api_convert_exam_to_text():
    uploaded_pdf = request.files.get("arquivo")
    if not uploaded_pdf or Path(uploaded_pdf.filename).suffix.lower() != ".pdf":
        abort(400, description="Selecione o PDF da prova.")
    exam_text = _extract_pdf_text(uploaded_pdf.read(), "prova")
    question_blocks = _extract_exam_question_blocks(exam_text)
    if not question_blocks:
        abort(422, description="Não consegui identificar questões numeradas no PDF da prova.")
    question_numbers = [item["numero"] for item in question_blocks]
    repeated_numbers = sorted(
        number for number in set(question_numbers)
        if question_numbers.count(number) > 1
    )

    answer_text = _read_answer_key_input(
        request.files.get("arquivo_gabarito"),
        str(request.form.get("gabarito", "")).strip(),
    )
    answer_map: dict[int, str] = {}
    positional = False
    if answer_text.strip():
        try:
            answer_map, positional = _parse_answer_key_with_mode(answer_text)
        except ValueError as exc:
            abort(400, description=str(exc))
        if not answer_map:
            abort(400, description="Não consegui identificar respostas válidas no gabarito.")
        if positional and len(answer_map) != len(question_blocks):
            abort(
                422,
                description=(
                    f"O gabarito tem {len(answer_map)} resposta(s), mas a prova contém "
                    f"{len(question_blocks)} questão(ões)."
                ),
            )
        if not positional and not repeated_numbers:
            numbers = set(question_numbers)
            missing = sorted(numbers - set(answer_map))
            extra = sorted(set(answer_map) - numbers)
            if missing or extra:
                details = []
                if missing:
                    details.append(f"sem resposta: {', '.join(map(str, missing))}")
                if extra:
                    details.append(f"sem questão: {', '.join(map(str, extra))}")
                abort(422, description="O gabarito não corresponde à prova (" + "; ".join(details) + ").")
        if (
            not repeated_numbers
            and len(_parse_exam_questions(exam_text, answer_map, positional)) != len(question_blocks)
        ):
            abort(
                422,
                description=(
                    "Não foi possível associar todas as respostas às questões extraídas. "
                    "Confira as alternativas e o formato do gabarito."
                ),
            )

    ordered_answers = [answer_map[index] for index in sorted(answer_map)]
    output = [f"PROVA: {Path(uploaded_pdf.filename).name}", ""]
    if repeated_numbers:
        output.extend((
            "AVISO: foram encontradas numerações repetidas "
            f"({', '.join(map(str, repeated_numbers))}). As questões foram reindexadas pela ordem "
            "de extração; o gabarito explícito mantém os números originais e pode exigir revisão.",
            "",
        ))
    output.extend(("QUESTÕES", ""))
    for index, question in enumerate(question_blocks, start=1):
        display_number = index if repeated_numbers else question["numero"]
        label = f"Questão {display_number}"
        if repeated_numbers:
            label += f" (número extraído: {question['numero']})"
        output.extend((label, f"Enunciado: {question['enunciado']}"))
        if question["alternativas"]:
            output.append("Alternativas:")
            output.extend(
                f"[{option['letra']}] {option['texto']}"
                for option in question["alternativas"]
            )
        else:
            output.append("Tipo: Certo/Errado")
        output.append("")
    output.append("GABARITO OFICIAL")
    if answer_map:
        if positional:
            for index, question in enumerate(question_blocks, start=1):
                number = index if repeated_numbers else question["numero"]
                output.append(f"{number}-{ordered_answers[index - 1]}")
        else:
            output.extend(f"{number}-{answer_map[number]}" for number in sorted(answer_map))
    else:
        output.append("Não informado.")

    from io import BytesIO
    filename = f"{_clean_name(Path(uploaded_pdf.filename).stem, 'prova')}_estruturada.txt"
    return send_file(
        BytesIO(("\n".join(output) + "\n").encode("utf-8")),
        mimetype="text/plain; charset=utf-8",
        as_attachment=True,
        download_name=filename,
    )


def _pdf_export_body() -> dict:
    if request.is_json:
        body = request.get_json(silent=True)
    else:
        payload = request.form.get("payload", "")
        try:
            body = json.loads(payload)
        except (json.JSONDecodeError, TypeError):
            body = None
    if not isinstance(body, dict):
        abort(400, description="Os dados para gerar o PDF são inválidos.")
    return body


def _write_highlighted_law_text(pdf, text: str, highlights: list[tuple[str, tuple[int, int, int], str]]) -> None:
    if not highlights:
        pdf.multi_cell(pdf.epw, 6, text)
        return

    color_by_text = {phrase.casefold(): color for phrase, color, _ in highlights}
    alternatives = sorted(color_by_text, key=len, reverse=True)
    pattern = re.compile("|".join(re.escape(phrase) for phrase in alternatives), re.IGNORECASE)
    spans = []
    cursor = 0
    for match in pattern.finditer(text):
        if match.start() > cursor:
            spans.append((text[cursor:match.start()], None))
        spans.append((match.group(), color_by_text[match.group().casefold()]))
        cursor = match.end()
    if cursor < len(text):
        spans.append((text[cursor:], None))

    line_height = 6
    available_width = pdf.epw
    line: list[tuple[str, tuple[int, int, int] | None]] = []
    line_width = 0.0
    pdf.c_margin = 0

    def flush_line() -> None:
        nonlocal line, line_width
        while line and line[-1][0].isspace():
            token, color = line.pop()
            line_width -= pdf.get_string_width(token) + pdf.c_margin * 2
        if pdf.will_page_break(line_height):
            pdf.add_page()
        pdf.set_x(pdf.l_margin)
        for token, color in line:
            width = pdf.get_string_width(token) + pdf.c_margin * 2
            if color:
                pdf.set_fill_color(*color)
                pdf.set_text_color(34, 34, 34)
            else:
                pdf.set_text_color(30, 30, 30)
            pdf.cell(width, line_height, token, fill=color is not None)
        pdf.ln(line_height)
        line = []
        line_width = 0.0

    for span, color in spans:
        for token in re.findall(r"\n|[^\S\n]+|[^\s]+", span):
            if token == "\n":
                flush_line()
                continue
            width = pdf.get_string_width(token) + pdf.c_margin * 2
            if token.isspace() and not line:
                continue
            if line and line_width + width > available_width:
                flush_line()
                if token.isspace():
                    continue
            if width > available_width:
                for character in token:
                    char_width = pdf.get_string_width(character) + pdf.c_margin * 2
                    if line and line_width + char_width > available_width:
                        flush_line()
                    line.append((character, color))
                    line_width += char_width
                continue
            line.append((token, color))
            line_width += width
    if line:
        flush_line()
    pdf.c_margin = 1
    pdf.set_text_color(0, 0, 0)


@app.post("/api/leis/pdf")
def api_export_law_pdf():
    body = _pdf_export_body()
    text = str(body.get("texto", "")).strip()
    raw_highlights = body.get("grifos", [])
    if not isinstance(raw_highlights, list):
        abort(400, description="A lista de grifos é inválida.")
    highlight_colors = {
        "yellow": (247, 214, 74),
        "green": (167, 224, 181),
        "blue": (168, 209, 255),
        "pink": (245, 181, 215),
        "orange": (255, 193, 138),
    }
    highlights = []
    for item in raw_highlights:
        if isinstance(item, dict):
            highlight_text = _pdf_safe_text(item.get("text", "")).strip()
            color = str(item.get("color", "yellow"))
        else:
            highlight_text = _pdf_safe_text(item).strip()
            color = "yellow"
        if highlight_text:
            highlights.append((highlight_text, highlight_colors.get(color, highlight_colors["yellow"]), color))
    if not text:
        abort(400, description="Não há texto para exportar.")
    try:
        from fpdf import FPDF
        pdf = FPDF()
        pdf.set_compression(True)
        pdf.set_auto_page_break(auto=True, margin=15)
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 15)
        pdf.multi_cell(pdf.epw, 9, "Central de Estudos - Lei Seca")
        pdf.ln(3)
        pdf.set_font("Helvetica", size=10)
        _write_highlighted_law_text(
            pdf,
            _pdf_safe_text(text),
            highlights,
        )
        if highlights:
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 13)
            pdf.multi_cell(pdf.epw, 8, "Trechos grifados (cores do aplicativo)")
            pdf.ln(2)
            pdf.set_font("Helvetica", size=10)
            for item, color, color_name in highlights:
                pdf.set_fill_color(*color)
                pdf.set_draw_color(210, 210, 210)
                label = _pdf_safe_text(f"{color_name.capitalize()} - {item}")
                pdf.multi_cell(pdf.epw, 6, label, border=1, fill=True, padding=1)
                pdf.ln(2)
        data = pdf.output()
    except Exception as exc:
        abort(500, description=f"Não foi possível gerar o PDF: {exc}")
    from io import BytesIO
    response = send_file(BytesIO(data), mimetype="application/pdf", as_attachment=True, download_name="lei_com_grifos.pdf")
    return response


@app.route("/api/leis/matriz-pdf", methods=["GET", "POST"])
def api_export_law_matrix_pdf():
    if request.method == "GET":
        folder = request.args.get("pasta", "").strip()
    else:
        body = _pdf_export_body()
        folder = str(body.get("pasta", "")).strip()
    if not folder:
        abort(400, description="Selecione uma legislação para exportar.")
    entries = _law_entries(folder)
    if not entries:
        abort(422, description="A legislação selecionada não contém dispositivos para exportar.")
    grade_colors = {
        "Muito Alto": ((220, 38, 38), (255, 255, 255)),
        "Alto": ((250, 204, 21), (66, 32, 6)),
        "Médio": ((22, 163, 74), (255, 255, 255)),
        "Baixo": ((255, 255, 255), (23, 23, 23)),
        "Não Classificado": ((229, 231, 235), (55, 65, 81)),
    }
    try:
        from fpdf import FPDF
        pdf = FPDF()
        pdf.set_compression(True)
        pdf.set_auto_page_break(auto=True, margin=14)
        folder_name = re.sub(r"\s+", " ", folder.replace("_", " ")).strip()
        pdf.set_title(f"Matriz de Incidência - {folder_name}")
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 15)
        title = f"Matriz de Incidencia - {folder_name}"
        pdf.multi_cell(pdf.epw, 9, _pdf_safe_text(title), align="L", new_x="LMARGIN")
        pdf.set_font("Helvetica", size=9)
        pdf.set_text_color(90, 90, 90)
        pdf.multi_cell(
            pdf.epw, 6,
            f"{len(entries)} dispositivo(s) | Cores fixas por grau de incidência",
            align="L", new_x="LMARGIN",
        )
        pdf.ln(3)
        for item in entries:
            grade = item["grau"] if item["grau"] in grade_colors else "Não Classificado"
            fill_color, text_color = grade_colors[grade]
            heading = _pdf_safe_text(f'{item["dispositivo"]} - {grade}')
            pdf.set_font("Helvetica", "B", 10)
            pdf.set_fill_color(*fill_color)
            pdf.set_text_color(*text_color)
            pdf.set_draw_color(200, 200, 200)
            pdf.multi_cell(
                pdf.epw, 7, heading, border=1, fill=True, padding=1,
                align="L", new_x="LMARGIN",
            )
            pdf.set_font("Helvetica", size=10)
            pdf.set_text_color(35, 35, 35)
            content = _pdf_safe_text(item["texto"])
            pdf.multi_cell(pdf.epw, 6, content, align="L", new_x="LMARGIN")
            if item.get("dica"):
                pdf.set_font("Helvetica", "I", 9)
                tip = _pdf_safe_text(f'Ponto de atencao: {item["dica"]}')
                pdf.multi_cell(pdf.epw, 5, tip, align="L", new_x="LMARGIN")
            if item.get("observacao"):
                pdf.set_font("Helvetica", "I", 9)
                note = _pdf_safe_text(f'Observacao: {item["observacao"]}')
                pdf.multi_cell(pdf.epw, 5, note, align="L", new_x="LMARGIN")
            pdf.ln(3)
        data = pdf.output()
    except Exception as exc:
        abort(500, description=f"Não foi possível gerar o PDF da Matriz: {exc}")
    from io import BytesIO
    filename = f"matriz_incidencia_{_clean_name(folder)}.pdf"
    return send_file(BytesIO(data), mimetype="application/pdf", as_attachment=True, download_name=filename)


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify({"erro": "O arquivo excede o limite de 200 MB."}), 413


@app.errorhandler(HTTPException)
def handle_http_error(error):
    return jsonify({"erro": error.description}), error.code


@app.errorhandler(Exception)
def internal_error(error):
    app.logger.exception("Erro interno da aplicação")
    return jsonify({"erro": "Erro interno ao processar a solicitação."}), 500


if __name__ == "__main__":
    import threading
    import webbrowser

    WEB_DIR.mkdir(parents=True, exist_ok=True)
    port = int(os.environ.get("CENTRALESTUDOS_PORT", "8765"))
    threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{port}")).start()
    app.run(host="127.0.0.1", port=port, debug=True, threaded=True)
