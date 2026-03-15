from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
import tempfile
import warnings
import logging
from PIL import Image

from ..utils.logger import logger
from ..utils.config import OCR_TIMEOUT_SECONDS, OCR_FAST_MAX_DIM

_reader = None

# Suppress repetitive CPU-only torch dataloader warning from easyocr internals.
warnings.filterwarnings(
    "ignore",
    message=".*pin_memory.*no accelerator is found.*",
    category=UserWarning,
)


def _get_reader():
    global _reader
    if _reader is not None:
        return _reader
    import easyocr

    # GPU False keeps it broadly compatible on local dev machines.
    logging.getLogger("easyocr.easyocr").setLevel(logging.ERROR)
    _reader = easyocr.Reader(["en"], gpu=False)
    return _reader


def extract_text_from_image(image_path: str) -> str:
    """
    Extract text from an image using OCR.
    Returns cleaned text; raises ValueError when no meaningful text is found.
    """
    reader = _get_reader()

    def _read(path: str):
        # tuned for speed/robustness on scanned pages and screenshots
        return reader.readtext(path, detail=0, paragraph=True, batch_size=1)

    def _extract_with_timeout(path: str, timeout_s: int):
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_read, path)
            try:
                return future.result(timeout=timeout_s)
            except FuturesTimeoutError:
                future.cancel()
                raise TimeoutError(f"OCR timed out after {timeout_s} seconds.")

    # Pass 1: downscaled quick pass to avoid timeout on huge images
    tmp_path = None
    try:
        with Image.open(image_path) as img:
            w, h = img.size
            max_dim = max(w, h)
            if max_dim > OCR_FAST_MAX_DIM:
                ratio = OCR_FAST_MAX_DIM / float(max_dim)
                new_size = (max(1, int(w * ratio)), max(1, int(h * ratio)))
                resized = img.convert("RGB").resize(new_size)
                with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
                    tmp_path = tmp.name
                resized.save(tmp_path, format="JPEG", quality=90, optimize=True)
                logger.info(f"OCR fast pass resized image from {w}x{h} to {new_size[0]}x{new_size[1]}")
    except Exception:
        tmp_path = None

    quick_timeout = max(10, OCR_TIMEOUT_SECONDS // 2)
    try:
        results = _extract_with_timeout(tmp_path or image_path, quick_timeout)
        try:
            if tmp_path:
                import os
                os.remove(tmp_path)
        except Exception:
            pass
    except Exception:
        # Pass 2: original image with configured timeout
        try:
            if tmp_path:
                import os
                os.remove(tmp_path)
        except Exception:
            pass
        try:
            results = _extract_with_timeout(image_path, OCR_TIMEOUT_SECONDS)
        except TimeoutError:
            # Pass 3: give one extended attempt for heavy scanned/A4 images.
            extended_timeout = max(90, OCR_TIMEOUT_SECONDS * 2)
            results = _extract_with_timeout(image_path, extended_timeout)

    text = "\n".join([r.strip() for r in results if isinstance(r, str) and r.strip()])
    if not text:
        raise ValueError("No readable text found in the image.")
    logger.info(f"OCR extracted {len(text)} chars from {image_path}")
    return text
