"""Generate 50 deterministic receipt fixtures for the Phase 1 spike."""

from __future__ import annotations

import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).parent
DATASET = ROOT / "dataset"
SEED = 20261118


def font(size: int):
    candidates = [
        Path("C:/Windows/Fonts/consola.ttf"),
        Path("C:/Windows/Fonts/arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def make_fixture(index: int, rng: random.Random) -> dict:
    merchant = ["TOKO SPIKE", "MINIMARKET UJI", "WARUNG DEMO", "APOTEK LOKAL"][index % 4]
    day = (index % 28) + 1
    date = f"2026-11-{day:02d}"
    display_date = f"{day:02d}/11/2026"
    items = [("Kopi", 12000 + index * 10), ("Roti", 8500 + index * 5)]
    if index % 3 == 0:
        items.append(("Air Mineral", 5000))
    total = sum(amount for _, amount in items)
    lines = [merchant, f"Tanggal {display_date}"]
    lines.extend(f"{name:<18} Rp {amount:,}".replace(",", ".") for name, amount in items)
    lines.append(f"TOTAL              Rp {total:,}".replace(",", "."))

    # Keep the synthetic lighting inside the TDD's initial brightness band;
    # real-world dark/bright cases belong in the later evaluation set.
    image = Image.new("RGB", (1000, 1500), (100, 100, 100))
    draw = ImageDraw.Draw(image)
    left, top, right, bottom = 150, 100, 850, 1400
    draw.rectangle((left, top, right, bottom), fill=(220, 220, 220), outline=(30, 30, 30), width=4)
    y = top + 50
    for line in lines:
        draw.text((left + 45, y), line, fill="black", font=font(30))
        y += 55
    angle = rng.choice([0, 0, 0, -3, 3])
    image = image.rotate(angle, expand=True, fillcolor=(100, 100, 100))
    path = DATASET / f"receipt_{index:03d}.png"
    image.save(path)
    return {"file": path.name, "merchant": merchant, "date": date, "display_date": display_date, "total": total, "lines": lines}


def main() -> None:
    DATASET.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    records = [make_fixture(index, rng) for index in range(50)]
    (DATASET / "manifest.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(f"generated={len(records)} dataset={DATASET}")


if __name__ == "__main__":
    main()
