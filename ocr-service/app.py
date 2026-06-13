import ctypes
import json
import os
import time
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from fastapi import FastAPI, File, UploadFile
from PIL import Image


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_json_dict(name: str) -> dict[str, Any] | None:
    value = os.getenv(name, "").strip()
    if not value:
        return None
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError(f"{name} must be a JSON object")
    return parsed


MODEL_PROFILES = {
    "accurate": ("PP-OCRv6_medium_det", "PP-OCRv6_medium_rec"),
    "fast": ("PP-OCRv6_small_det", "PP-OCRv6_small_rec"),
    "turbo": ("PP-OCRv6_tiny_det", "PP-OCRv6_tiny_rec"),
}

OCR_DEVICE = os.getenv("OCR_DEVICE", "cpu").lower()
OCR_LANG = os.getenv("OCR_LANG", "ch")
OCR_VERSION = os.getenv("OCR_VERSION", "PP-OCRv6").strip()
OCR_PERFORMANCE_MODE = os.getenv("OCR_PERFORMANCE_MODE", "turbo").strip().lower()
PROFILE_DET_MODEL, PROFILE_REC_MODEL = MODEL_PROFILES.get(
    OCR_PERFORMANCE_MODE, MODEL_PROFILES["fast"]
)
OCR_TEXT_DETECTION_MODEL = (
    os.getenv("OCR_TEXT_DETECTION_MODEL", PROFILE_DET_MODEL).strip()
    or PROFILE_DET_MODEL
)
OCR_TEXT_RECOGNITION_MODEL = (
    os.getenv("OCR_TEXT_RECOGNITION_MODEL", PROFILE_REC_MODEL).strip()
    or PROFILE_REC_MODEL
)
OCR_TEXT_DETECTION_MODEL_DIR = (
    os.getenv("OCR_TEXT_DETECTION_MODEL_DIR", "").strip() or None
)
OCR_TEXT_RECOGNITION_MODEL_DIR = (
    os.getenv("OCR_TEXT_RECOGNITION_MODEL_DIR", "").strip() or None
)
OCR_ENGINE = os.getenv("OCR_ENGINE", "").strip() or None
OCR_ENGINE_CONFIG = env_json_dict("OCR_ENGINE_CONFIG")
OCR_ENABLE_MKLDNN = env_bool("OCR_ENABLE_MKLDNN", True)
OCR_CPU_THREADS = int(os.getenv("OCR_CPU_THREADS", "4"))
OCR_REC_BATCH_SIZE = int(os.getenv("OCR_REC_BATCH_SIZE", "16"))
OCR_MODEL_SOURCE = os.getenv("OCR_MODEL_SOURCE", "bos").strip() or "bos"
OCR_CACHE_HOME = os.getenv("OCR_CACHE_HOME")
if OCR_CACHE_HOME is None:
    OCR_CACHE_HOME = str(Path(__file__).resolve().parent / ".paddlex-cache")
OCR_TEMP_DIR = os.getenv("OCR_TEMP_DIR")
if OCR_TEMP_DIR is None:
    OCR_TEMP_DIR = str(Path(OCR_CACHE_HOME) / "tmp")
MAX_SINGLE_IMAGE_HEIGHT = int(os.getenv("OCR_MAX_SINGLE_IMAGE_HEIGHT", "6000"))
SLICE_HEIGHT = int(os.getenv("OCR_SLICE_HEIGHT", "6000"))
SLICE_OVERLAP = int(os.getenv("OCR_SLICE_OVERLAP", "320"))

if OCR_CACHE_HOME:
    Path(OCR_CACHE_HOME).mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("PADDLE_PDX_CACHE_HOME", OCR_CACHE_HOME)
if OCR_TEMP_DIR:
    Path(OCR_TEMP_DIR).mkdir(parents=True, exist_ok=True)
    os.environ["TMP"] = OCR_TEMP_DIR
    os.environ["TEMP"] = OCR_TEMP_DIR
    os.environ["TMPDIR"] = OCR_TEMP_DIR
if OCR_MODEL_SOURCE:
    os.environ.setdefault("PADDLE_PDX_MODEL_SOURCE", OCR_MODEL_SOURCE)

if not OCR_ENABLE_MKLDNN:
    os.environ.setdefault("FLAGS_use_mkldnn", "0")
    os.environ.setdefault("FLAGS_use_onednn", "0")

from paddleocr import PaddleOCR

app = FastAPI(title="Cashbook PaddleOCR Service")


def assert_gpu_runtime_available() -> None:
    if OCR_DEVICE != "gpu":
        return

    if OCR_ENGINE == "onnxruntime":
        try:
            import onnxruntime as ort
        except Exception as error:
            raise RuntimeError("onnxruntime-gpu is not importable") from error

        providers = set(ort.get_available_providers())
        if "CUDAExecutionProvider" not in providers:
            raise RuntimeError(
                "ONNX Runtime CUDAExecutionProvider is unavailable. "
                f"Available providers: {sorted(providers)!r}."
            )

    try:
        cuda = ctypes.CDLL("libcuda.so.1")
    except OSError as error:
        raise RuntimeError(
            "NVIDIA driver runtime is not visible inside the container. "
            "Start the container with GPU access, for example Docker Compose "
            "`gpus: all` or `docker run --gpus all`, and ensure NVIDIA "
            "Container Toolkit / Docker Desktop GPU support is installed."
        ) from error

    cuda.cuInit.argtypes = [ctypes.c_uint]
    cuda.cuInit.restype = ctypes.c_int
    cuda.cuDeviceGetCount.argtypes = [ctypes.POINTER(ctypes.c_int)]
    cuda.cuDeviceGetCount.restype = ctypes.c_int

    result = cuda.cuInit(0)
    if result != 0:
        raise RuntimeError(f"CUDA driver initialization failed: cuInit returned {result}.")

    device_count = ctypes.c_int()
    result = cuda.cuDeviceGetCount(ctypes.byref(device_count))
    if result != 0 or device_count.value < 1:
        raise RuntimeError(
            "No CUDA device is visible inside the container: "
            f"cuDeviceGetCount returned {result}, count={device_count.value}."
        )


def create_ocr() -> PaddleOCR:
    assert_gpu_runtime_available()
    device = "gpu:0" if OCR_DEVICE == "gpu" else "cpu"
    common_kwargs: dict[str, Any] = {
        "device": device,
        "text_detection_model_name": OCR_TEXT_DETECTION_MODEL,
        "text_recognition_model_name": OCR_TEXT_RECOGNITION_MODEL,
        "text_recognition_batch_size": OCR_REC_BATCH_SIZE,
        "use_doc_orientation_classify": False,
        "use_doc_unwarping": False,
        "use_textline_orientation": False,
        "enable_mkldnn": OCR_ENABLE_MKLDNN,
        "cpu_threads": OCR_CPU_THREADS,
    }
    if OCR_TEXT_DETECTION_MODEL_DIR:
        common_kwargs["text_detection_model_dir"] = OCR_TEXT_DETECTION_MODEL_DIR
    if OCR_TEXT_RECOGNITION_MODEL_DIR:
        common_kwargs["text_recognition_model_dir"] = OCR_TEXT_RECOGNITION_MODEL_DIR
    if OCR_ENGINE:
        common_kwargs["engine"] = OCR_ENGINE
    if OCR_ENGINE_CONFIG is not None:
        common_kwargs["engine_config"] = OCR_ENGINE_CONFIG

    try:
        return PaddleOCR(**common_kwargs)
    except TypeError:
        legacy_kwargs: dict[str, Any] = {
            "use_angle_cls": False,
            "lang": OCR_LANG,
            "ocr_version": OCR_VERSION,
            "use_gpu": OCR_DEVICE == "gpu",
            "show_log": False,
            "enable_mkldnn": OCR_ENABLE_MKLDNN,
            "cpu_threads": OCR_CPU_THREADS,
        }
        try:
            return PaddleOCR(**legacy_kwargs)
        except TypeError:
            legacy_kwargs.pop("ocr_version", None)
            legacy_kwargs.pop("enable_mkldnn", None)
            legacy_kwargs.pop("cpu_threads", None)
            return PaddleOCR(**legacy_kwargs)


ocr = create_ocr()


def iter_slices(image: Image.Image) -> Iterable[tuple[int, Image.Image]]:
    width, height = image.size
    if height <= MAX_SINGLE_IMAGE_HEIGHT:
        yield 0, image
        return

    y = 0
    while y < height:
        bottom = min(height, y + SLICE_HEIGHT)
        yield y, image.crop((0, y, width, bottom))
        if bottom >= height:
            break
        y = max(0, bottom - SLICE_OVERLAP)


def is_line(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) >= 2
        and isinstance(value[0], list)
        and isinstance(value[1], (list, tuple))
    )


def extract_lines(result: Any) -> list[Any]:
    if not result:
        return []
    if isinstance(result, list) and result and all(is_line(item) for item in result):
        return result
    if isinstance(result, list) and len(result) == 1 and isinstance(result[0], list):
        return extract_lines(result[0])
    if isinstance(result, list):
        lines: list[Any] = []
        for item in result:
            lines.extend(extract_lines(item))
        return lines
    return []


def to_plain_value(value: Any) -> Any:
    if hasattr(value, "tolist"):
        return value.tolist()
    return value


def to_result_payload(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value

    json_value = getattr(value, "json", None)
    if callable(json_value):
        json_value = json_value()
    if isinstance(json_value, dict):
        return json_value

    res_value = getattr(value, "res", None)
    if isinstance(res_value, dict):
        return res_value

    if hasattr(value, "__dict__"):
        return vars(value)

    return {}


def unwrap_payload(value: Any) -> dict[str, Any]:
    payload = to_result_payload(value)
    nested = payload.get("res")
    if isinstance(nested, dict) and any(
        key in nested for key in ("rec_texts", "rec_polys", "rec_boxes", "dt_polys")
    ):
        return nested
    return payload


def to_sequence(value: Any) -> list[Any]:
    value = to_plain_value(value)
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return []


def first_sequence(payload: dict[str, Any], keys: list[str]) -> list[Any]:
    for key in keys:
        if key in payload:
            return to_sequence(payload.get(key))
    return []


def poly_to_points(poly: Any) -> list[list[float]] | None:
    poly = to_plain_value(poly)
    if not isinstance(poly, (list, tuple)) or len(poly) < 4:
        return None

    points: list[list[float]] = []
    for item in poly[:4]:
        point = to_plain_value(item)
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            return None
        points.append([float(point[0]), float(point[1])])
    return points


def rect_to_points(rect: Any) -> list[list[float]] | None:
    rect = to_plain_value(rect)
    if not isinstance(rect, (list, tuple)) or len(rect) < 4:
        return None
    x1, y1, x2, y2 = [float(item) for item in rect[:4]]
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]


def score_at(scores: list[Any], index: int) -> float:
    if index >= len(scores):
        return 0.0
    value = to_plain_value(scores[index])
    if isinstance(value, (list, tuple)):
        value = value[0] if value else 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def shift_box(box: list[list[float]], offset_y: int) -> list[list[float]]:
    return [[float(x), float(y) + offset_y] for x, y in box]


def bbox_from_points(points: list[list[float]]) -> list[float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def is_duplicate(block: dict[str, Any], existing: list[dict[str, Any]]) -> bool:
    x1, y1, x2, y2 = block["bbox"]
    cy = (y1 + y2) / 2
    for item in existing:
        if item["text"] != block["text"]:
            continue
        ix1, iy1, ix2, iy2 = item["bbox"]
        icy = (iy1 + iy2) / 2
        if abs(cy - icy) <= max(32, (y2 - y1 + iy2 - iy1) / 2):
            return True
    return False


def block_from_parts(text: str, score: float, points: list[list[float]], offset_y: int) -> dict[str, Any]:
    box = shift_box(points, offset_y)
    return {
        "text": text,
        "score": score,
        "bbox": bbox_from_points(box),
        "points": box,
    }


def extract_prediction_blocks(result: Any, offset_y: int) -> list[dict[str, Any]]:
    items = result if isinstance(result, list) else [result]
    blocks: list[dict[str, Any]] = []

    for item in items:
        payload = unwrap_payload(item)
        texts = first_sequence(payload, ["rec_texts"])
        scores = first_sequence(payload, ["rec_scores"])
        polys = first_sequence(payload, ["rec_polys", "dt_polys"])
        rects = first_sequence(payload, ["rec_boxes"])

        for index, text_value in enumerate(texts):
            text = str(text_value).strip()
            if not text:
                continue

            points = poly_to_points(polys[index]) if index < len(polys) else None
            if points is None and index < len(rects):
                points = rect_to_points(rects[index])
            if points is None:
                continue

            blocks.append(block_from_parts(text, score_at(scores, index), points, offset_y))

    return blocks


def extract_legacy_blocks(result: Any, offset_y: int) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for line in extract_lines(result):
        text = str(line[1][0]).strip()
        if not text:
            continue
        blocks.append(block_from_parts(text, float(line[1][1]), line[0], offset_y))
    return blocks


def run_ocr(crop: Image.Image) -> Any:
    array = np.array(crop)
    if hasattr(ocr, "predict"):
        return ocr.predict(array)
    return ocr.ocr(array, cls=False)


def get_onnxruntime_providers() -> list[str] | None:
    if OCR_ENGINE != "onnxruntime":
        return None
    try:
        import onnxruntime as ort

        return list(ort.get_available_providers())
    except Exception as error:
        return [f"unavailable: {error}"]


@app.get("/health")
def health():
    return {
        "ok": True,
        "device": OCR_DEVICE,
        "lang": OCR_LANG,
        "ocrVersion": OCR_VERSION,
        "performanceMode": OCR_PERFORMANCE_MODE,
        "textDetectionModel": OCR_TEXT_DETECTION_MODEL,
        "textDetectionModelDir": OCR_TEXT_DETECTION_MODEL_DIR,
        "textRecognitionModel": OCR_TEXT_RECOGNITION_MODEL,
        "textRecognitionModelDir": OCR_TEXT_RECOGNITION_MODEL_DIR,
        "engine": OCR_ENGINE,
        "engineConfig": OCR_ENGINE_CONFIG,
        "onnxRuntimeProviders": get_onnxruntime_providers(),
        "enableMkldnn": OCR_ENABLE_MKLDNN,
        "cpuThreads": OCR_CPU_THREADS,
        "recBatchSize": OCR_REC_BATCH_SIZE,
        "modelSource": os.environ.get("PADDLE_PDX_MODEL_SOURCE"),
        "cacheHome": os.environ.get("PADDLE_PDX_CACHE_HOME"),
        "tempDir": os.environ.get("TMP"),
        "maxSingleImageHeight": MAX_SINGLE_IMAGE_HEIGHT,
        "sliceHeight": SLICE_HEIGHT,
        "sliceOverlap": SLICE_OVERLAP,
    }


@app.post("/ocr")
async def recognize(image: UploadFile = File(...)):
    started_at = time.perf_counter()
    pil_image = Image.open(image.file).convert("RGB")
    width, height = pil_image.size
    blocks: list[dict[str, Any]] = []
    slice_count = 0

    for offset_y, crop in iter_slices(pil_image):
        slice_count += 1
        result = run_ocr(crop)
        slice_blocks = extract_prediction_blocks(result, offset_y)
        if not slice_blocks:
            slice_blocks = extract_legacy_blocks(result, offset_y)

        for block in slice_blocks:
            if not is_duplicate(block, blocks):
                blocks.append(block)

    blocks.sort(key=lambda item: (item["bbox"][1], item["bbox"][0]))
    return {
        "width": width,
        "height": height,
        "durationMs": round((time.perf_counter() - started_at) * 1000),
        "sliceCount": slice_count,
        "blocks": blocks,
    }
