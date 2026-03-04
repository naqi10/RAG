import os
from fastapi import UploadFile

async def save_upload_file(upload_file: UploadFile, dest_path: str):
    """Save an UploadFile to disk (async)."""
    content = await upload_file.read()
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(content)
    return dest_path
