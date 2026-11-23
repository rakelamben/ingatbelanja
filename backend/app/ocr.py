from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class OcrLine:
    id: str
    text: str
    poly: list[list[float]]
    score: float


class OcrEngine(Protocol):
    def read(self, path: Path) -> list[OcrLine]: ...


class FakeOcrEngine:
    def __init__(self, fixture: Path | None = None):
        self.fixture = fixture

    def read(self, path: Path) -> list[OcrLine]:
        fixture = self.fixture or path.with_suffix(".ocr.json")
        if not fixture.exists():
            return []
        payload = json.loads(fixture.read_text(encoding="utf-8"))
        values = payload.get("lines", payload) if isinstance(payload, dict) else payload
        return [
            OcrLine(
                str(item.get("id", f"o{i + 1}")),
                str(item["text"]).strip(),
                item["poly"],
                float(item.get("score", 1)),
            )
            for i, item in enumerate(values)
            if str(item.get("text", "")).strip()
        ]


class PaddleOcrEngine:
    def __init__(self, settings):
        self.settings = settings
        self._engine = None

    def _load(self):
        if self._engine is None:
            try:
                from paddleocr import PaddleOCR
            except ImportError as error:
                raise RuntimeError(
                    "PaddleOCR is not installed; use OCR_ENGINE=fake or install the optional OCR stack"
                ) from error
            self._engine = PaddleOCR(
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                device=self.settings.ocr_device,
            )
        return self._engine

    def read(self, path: Path) -> list[OcrLine]:
        result = self._load().predict(str(path))
        lines: list[OcrLine] = []
        for index, item in enumerate(result or []):
            texts = item.get("rec_texts", [])
            scores = item.get("rec_scores", [])
            polygons = item.get("rec_polys", [])
            for text, score, poly in zip(texts, scores, polygons, strict=False):
                if str(text).strip():
                    lines.append(
                        OcrLine(
                            f"o{index + 1}",
                            str(text).strip(),
                            [[float(point[0]), float(point[1])] for point in poly],
                            float(score),
                        )
                    )
        return lines


def build_ocr_engine(settings) -> OcrEngine:
    if settings.ocr_engine == "fake":
        return FakeOcrEngine()
    if settings.ocr_engine == "paddle":
        return PaddleOcrEngine(settings)
    raise ValueError(f"Unsupported OCR_ENGINE: {settings.ocr_engine}")


def grouped_rows(lines: list[OcrLine]) -> list[dict]:
    if not lines:
        return []
    ordered = sorted(
        lines,
        key=lambda line: (sum(point[1] for point in line.poly) / len(line.poly), line.poly[0][0]),
    )
    heights = [
        max(point[1] for point in line.poly) - min(point[1] for point in line.poly)
        for line in ordered
    ]
    threshold = max(1.0, (sorted(heights)[len(heights) // 2] if heights else 1) * 0.6)
    rows: list[list[OcrLine]] = []
    centers: list[float] = []
    for line in ordered:
        center = sum(point[1] for point in line.poly) / len(line.poly)
        if not rows or abs(center - centers[-1]) > threshold:
            rows.append([line])
            centers.append(center)
        else:
            rows[-1].append(line)
            centers[-1] = sum(
                sum(point[1] for point in current.poly) / len(current.poly) for current in rows[-1]
            ) / len(rows[-1])
    return [
        {
            "id": f"r{index + 1}",
            "line_ids": [line.id for line in row],
            "text": " ".join(line.text for line in sorted(row, key=lambda item: item.poly[0][0])),
        }
        for index, row in enumerate(rows)
    ]
