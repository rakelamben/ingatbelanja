"""Benchmark PaddleOCR on the same preprocessed fixture images."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from parser import parse_lines


ROOT = Path(__file__).parent
ARTIFACTS = ROOT / "artifacts"
DATASET = ROOT / "dataset"


def main() -> None:
    from paddleocr import PaddleOCR

    device = os.environ.get("SPIKE_OCR_DEVICE", "cpu")
    count = int(os.environ.get("SPIKE_BENCHMARK_COUNT", "10"))
    records = json.loads((DATASET / "manifest.json").read_text(encoding="utf-8"))[:count]
    images = [ARTIFACTS / record["file"].replace(".png", ".jpg") for record in records]

    init_start = time.perf_counter()
    ocr = PaddleOCR(
        device=device,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        lang="en",
    )
    init_seconds = time.perf_counter() - init_start

    durations: list[float] = []
    total_correct = 0
    date_correct = 0
    for record, image in zip(records, images):
        started = time.perf_counter()
        result = ocr.predict(str(image))[0].json["res"]
        durations.append(time.perf_counter() - started)
        parsed = parse_lines(result.get("rec_texts", []))
        total_correct += parsed.total_minor == record["total"]
        date_correct += parsed.purchased_on == record["date"]

    result = {
        "device": device,
        "count": len(images),
        "model_init_seconds": round(init_seconds, 3),
        "total_seconds": round(sum(durations), 3),
        "mean_seconds_per_image": round(sum(durations) / len(durations), 3),
        "median_seconds_per_image": round(sorted(durations)[len(durations) // 2], 3),
        "images_per_second": round(len(images) / sum(durations), 3),
        "total_accuracy": total_correct / len(images),
        "date_accuracy": date_correct / len(images),
        "per_image_seconds": [round(value, 3) for value in durations],
    }
    output = ARTIFACTS / f"ocr_benchmark_{device.replace(':', '_')}.json"
    output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
