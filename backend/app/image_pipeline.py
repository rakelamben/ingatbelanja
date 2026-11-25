from __future__ import annotations

import io
from dataclasses import dataclass

from PIL import Image, ImageEnhance, ImageOps

try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:  # HEIF support is optional in minimal test environments.
    pass


SUPPORTED_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF", "HEIC", "AVIF"}


class ImageValidationError(ValueError):
    def __init__(self, code: str, message: str, status: int = 422):
        super().__init__(message)
        self.code = code
        self.status = status


@dataclass(frozen=True)
class ImageInfo:
    width: int
    height: int
    image_format: str
    quality: dict[str, float | bool]


def decode_image(
    data: bytes, *, max_bytes: int, max_pixels: int, min_short_side: int
) -> tuple[Image.Image, ImageInfo]:
    if len(data) > max_bytes:
        raise ImageValidationError("UPLOAD_TOO_LARGE", "Uploaded file is too large", 413)
    try:
        image = Image.open(io.BytesIO(data))
        image.verify()
        image = Image.open(io.BytesIO(data))
    except Exception as error:
        raise ImageValidationError("UNSUPPORTED_MEDIA", "File is not a valid image", 415) from error
    image_format = (image.format or "").upper()
    if image_format not in SUPPORTED_FORMATS:
        raise ImageValidationError(
            "UNSUPPORTED_MEDIA", "Only JPEG, PNG, WebP, or HEIF images are supported", 415
        )
    width, height = image.size
    if width * height > max_pixels:
        raise ImageValidationError("IMAGE_TOO_LARGE", "Image has too many pixels", 413)
    if min(width, height) < min_short_side:
        raise ImageValidationError("IMAGE_TOO_SMALL", "Image short side is too small")
    normalized = ImageOps.exif_transpose(image).convert("RGB")
    gray = ImageOps.grayscale(normalized.copy())
    histogram = gray.histogram()
    total = max(width * height, 1)
    brightness = sum(index * count for index, count in enumerate(histogram)) / total
    mean = brightness
    variance = sum(((index - mean) ** 2) * count for index, count in enumerate(histogram)) / total
    return normalized, ImageInfo(
        width,
        height,
        image_format,
        {
            "brightness": round(brightness, 3),
            "contrast": round(variance**0.5, 3),
            "paper_detected": False,
        },
    )


def _fit(image: Image.Image, side: int) -> Image.Image:
    result = image.copy()
    result.thumbnail((side, side), Image.Resampling.LANCZOS)
    return result


def render_variants(
    image: Image.Image,
    *,
    original_side: int = 3000,
    processed_side: int = 2000,
    thumb_side: int = 480,
) -> dict[str, bytes]:
    original = _fit(image, original_side)
    processed = _fit(image, processed_side)
    gray = ImageOps.grayscale(processed)
    enhanced = ImageOps.autocontrast(gray, cutoff=0.5)
    processed = ImageOps.colorize(enhanced, black=(0, 0, 0), white=(255, 255, 255))
    processed = ImageEnhance.Contrast(processed).enhance(1.05)
    thumb = _fit(processed, thumb_side)

    def encode(value: Image.Image, quality: int) -> bytes:
        output = io.BytesIO()
        value.save(output, format="JPEG", quality=quality, optimize=True)
        return output.getvalue()

    return {
        "original.jpg": encode(original, 92),
        "processed.jpg": encode(processed, 90),
        "thumb.jpg": encode(thumb, 80),
    }


def relative_polygon(
    points: list[tuple[float, float]], width: int, height: int
) -> list[list[float]]:
    return [
        [round(max(0.0, min(1.0, x / width)), 6), round(max(0.0, min(1.0, y / height)), 6)]
        for x, y in points
    ]
