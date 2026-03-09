import os
from fastapi import UploadFile

async def save_upload_file(upload_file: UploadFile, dest_path: str, max_bytes: int | None = None):
    """Save an UploadFile to disk with optional size cap."""
    content = await upload_file.read()
    if max_bytes is not None and len(content) > max_bytes:
        raise ValueError(f"File too large. Max allowed is {max_bytes} bytes.")
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(content)
    return dest_path
