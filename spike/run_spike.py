"""Run the isolated Phase 1 preprocessing/parser spike."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from parser import parse_lines, validate


ROOT = Path(__file__).parent
DATASET = ROOT / "dataset"
ARTIFACTS = ROOT / "artifacts"


def ocr_device() -> str:
    """Return the requested Paddle device; CPU remains the safe default."""
    device = os.environ.get("SPIKE_OCR_DEVICE", "cpu").strip().lower()
    if device == "gpu":
        return "gpu:0"
    if device.startswith("gpu:") and device[4:].isdigit():
        return device
    return "cpu"


def preprocess(path: Path, output: Path) -> dict:
    image = cv2.imread(str(path))
    if image is None:
        raise ValueError(f"cannot decode {path}")
    height, width = image.shape[:2]
    scale = min(1.0, 2000 / max(height, width))
    if scale < 1:
        image = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    laplacian = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())

    # Prototype-only four-corner detection. If no reliable paper is found,
    # retain the resized image rather than making an unsafe crop.
    edged = cv2.Canny(gray, 50, 150)
    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    paper_detected = False
    perspective_corrected = False
    deskew_angle = 0.0
    for contour in sorted(contours, key=cv2.contourArea, reverse=True):
        area = cv2.contourArea(contour)
        if area < image.shape[0] * image.shape[1] * 0.20:
            continue
        perimeter = cv2.arcLength(contour, True)
        polygon = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(polygon) == 4:
            paper_detected = True
            points = polygon.reshape(4, 2).astype(np.float32)
            sums = points.sum(axis=1)
            diffs = np.diff(points, axis=1).ravel()
            ordered = np.array(
                [
                    points[np.argmin(sums)],
                    points[np.argmin(diffs)],
                    points[np.argmax(sums)],
                    points[np.argmax(diffs)],
                ],
                dtype=np.float32,
            )
            width_top = np.linalg.norm(ordered[1] - ordered[0])
            width_bottom = np.linalg.norm(ordered[2] - ordered[3])
            height_right = np.linalg.norm(ordered[2] - ordered[1])
            height_left = np.linalg.norm(ordered[3] - ordered[0])
            target_width = max(1, round(max(width_top, width_bottom)))
            target_height = max(1, round(max(height_left, height_right)))
            destination = np.array(
                [[0, 0], [target_width - 1, 0], [target_width - 1, target_height - 1], [0, target_height - 1]],
                dtype=np.float32,
            )
            matrix = cv2.getPerspectiveTransform(ordered, destination)
            image = cv2.warpPerspective(image, matrix, (target_width, target_height))
            perspective_corrected = True
            break

    # Prototype deskew pass. Perspective correction normally removes most
    # rotation; this catches the residual text tilt in the TDD's 0.5°–15° band.
    gray_after = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, ink = cv2.threshold(gray_after, 200, 255, cv2.THRESH_BINARY_INV)
    coordinates = cv2.findNonZero(ink)
    if coordinates is not None and len(coordinates) > 20:
        angle = cv2.minAreaRect(coordinates)[-1]
        if angle < -45:
            angle += 90
        if 0.5 <= abs(angle) <= 15:
            deskew_angle = float(angle)
            center = (image.shape[1] / 2, image.shape[0] / 2)
            matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
            image = cv2.warpAffine(image, matrix, (image.shape[1], image.shape[0]), borderValue=(255, 255, 255))

    output.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output), image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    thumb = cv2.resize(image, (480, round(image.shape[0] * 480 / image.shape[1])))
    cv2.imwrite(str(output.with_name(output.stem + "_thumb.jpg")), thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return {
        "blur_variance": round(laplacian, 2),
        "brightness": round(brightness, 2),
        "paper_detected": paper_detected,
        "perspective_corrected": perspective_corrected,
        "deskew_angle": round(deskew_angle, 2),
        "width": int(image.shape[1]),
        "height": int(image.shape[0]),
        "low_quality": laplacian < 60 or brightness < 50 or brightness > 220,
    }


def paddle_smoke_test(image_path: Path) -> str:
    try:
        from paddleocr import PaddleOCR
    except ImportError:
        return "SKIP: paddleocr belum terpasang"
    try:
        device = ocr_device()
        ocr = PaddleOCR(
            device=device,
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            lang="en",
        )
        result = ocr.predict(str(image_path))
        return f"PASS: device={device}, PaddleOCR menghasilkan objek {type(result).__name__}"
    except Exception as exc:  # smoke test should report environment failure, not hide it
        return f"FAIL: PaddleOCR smoke test: {type(exc).__name__}: {exc}"


def paddle_evaluate(records: list[dict], artifacts: Path) -> dict:
    """Run OCR on the deterministic 50-image spike set."""
    try:
        from paddleocr import PaddleOCR
    except ImportError:
        return {"status": "SKIP", "reason": "paddleocr belum terpasang"}

    device = ocr_device()
    ocr = PaddleOCR(
        device=device,
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        lang="en",
    )
    valid_total = 0
    valid_date = 0
    failures: list[dict] = []
    for record in records:
        image_path = artifacts / record["file"].replace(".png", ".jpg")
        result = ocr.predict(str(image_path))[0].json["res"]
        lines = result.get("rec_texts", [])
        parsed = parse_lines(lines)
        if parsed.total_minor == record["total"]:
            valid_total += 1
        if parsed.purchased_on == record["date"]:
            valid_date += 1
        if parsed.total_minor != record["total"] or parsed.purchased_on != record["date"]:
            failures.append({"file": record["file"], "ocr_lines": lines, "parsed": parsed.__dict__})
    return {
        "status": "PASS",
        "device": device,
        "total_accuracy": valid_total / len(records),
        "date_accuracy": valid_date / len(records),
        "failures": failures,
    }


def main() -> int:
    manifest_path = DATASET / "manifest.json"
    if not manifest_path.exists():
        print("dataset belum ada; jalankan: python spike\\generate_dataset.py", file=sys.stderr)
        return 2
    records = json.loads(manifest_path.read_text(encoding="utf-8"))
    ARTIFACTS.mkdir(exist_ok=True)
    results = []
    for record in records:
        processed = ARTIFACTS / record["file"].replace(".png", ".jpg")
        quality = preprocess(DATASET / record["file"], processed)
        parsed = parse_lines(record["lines"])
        ok, issues = validate(parsed, record["total"], record["date"])
        results.append({"file": record["file"], "quality": quality, "valid": ok, "issues": issues})

    valid = sum(result["valid"] for result in results)
    total_accuracy = valid / len(results) if results else 0
    date_accuracy = valid / len(results) if results else 0
    smoke = paddle_smoke_test(ARTIFACTS / records[0]["file"].replace(".png", ".jpg"))
    real_ocr = (
        paddle_evaluate(records, ARTIFACTS)
        if smoke.startswith("PASS") and os.environ.get("SPIKE_FULL_OCR") == "1"
        else {"status": "NOT_RUN", "hint": "set SPIKE_FULL_OCR=1 untuk evaluasi 50 gambar"}
    )
    report = {
        "dataset_size": len(results),
        "total_accuracy_fixture": total_accuracy,
        "date_accuracy_fixture": date_accuracy,
        "quality_gate_target": 0.90,
        "quality_gate_passed": total_accuracy >= 0.90 and date_accuracy >= 0.90,
        "paddle_cpu_smoke": smoke,
        "paddle_real_ocr": real_ocr,
        "results": results,
    }
    (ARTIFACTS / "spike_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "results"}, indent=2))
    return 0 if report["quality_gate_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
