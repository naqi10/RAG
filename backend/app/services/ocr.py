from typing import Optional

from ..utils.logger import logger

_reader = None


def _get_reader():
    global _reader
    if _reader is not None:
        return _reader
    import easyocr

    # GPU False keeps it broadly compatible on local dev machines.
    _reader = easyocr.Reader(["en"], gpu=False)
    return _reader


def extract_text_from_image(image_path: str) -> str:
    """
    Extract text from an image using OCR.
    Returns cleaned text; raises ValueError when no meaningful text is found.
    """
    reader = _get_reader()
    results = reader.readtext(image_path, detail=0, paragraph=True)
    text = "\n".join([r.strip() for r in results if isinstance(r, str) and r.strip()])
    if not text:
        raise ValueError("No readable text found in the image.")
    logger.info(f"OCR extracted {len(text)} chars from {image_path}")
    return text
