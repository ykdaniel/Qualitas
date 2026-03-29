import os
import shutil
import uuid

from fastapi import HTTPException, UploadFile

import schemas
from repositories.km_repository import KMRepository


class KMService:
    def __init__(self, repo: KMRepository):
        self.repo = repo

    def get_articles(self, skip: int = 0, limit: int = 100, category: str | None = None, search: str | None = None):
        return self.repo.get_all(skip=skip, limit=limit, category=category, search=search)

    def get_article(self, article_id: str):
        article = self.repo.get_by_id(article_id)
        if not article:
            raise HTTPException(status_code=404, detail="KM Article not found")
        return article

    def create_article(self, article_create: schemas.KMArticleCreate, author_id: int):
        return self.repo.create(article=article_create, author_id=author_id)

    def update_article(self, article_id: str, article_update: schemas.KMArticleUpdate):
        db_article = self.repo.get_by_id(article_id)
        if not db_article:
            raise HTTPException(status_code=404, detail="KM Article not found")

        update_data = article_update.dict(exclude_unset=True)
        return self.repo.update(db_article, update_data)

    def delete_article(self, article_id: str):
        db_article = self.repo.get_by_id(article_id)
        if not db_article:
            raise HTTPException(status_code=404, detail="KM Article not found")
        self.repo.delete(db_article)
        return {"ok": True}

    def get_article_history(self, article_id: str):
        # We don't necessarily need to check if article exists, history query will just return []
        # but checking exists is better for 404
        db_article = self.repo.get_by_id(article_id)
        if not db_article:
            raise HTTPException(status_code=404, detail="KM Article not found")
        return self.repo.get_history(article_id)

    ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.pptx', '.txt', '.csv', '.zip'}
    MAX_FILE_SIZE_MB = 10

    def upload_image(self, file: UploadFile) -> str:
        # Validate file extension
        ext = os.path.splitext(file.filename or '')[1].lower()
        if ext not in self.ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"File type '{ext}' is not allowed. Allowed: {', '.join(self.ALLOWED_EXTENSIONS)}")

        # Validate file size (read content first)
        contents = file.file.read()
        if len(contents) > self.MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"File size exceeds {self.MAX_FILE_SIZE_MB}MB limit.")
        file.file.seek(0)  # Reset for writing

        # Resolve the base directory of the backend
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        upload_dir = os.path.join(base_dir, "uploads", "km")
        os.makedirs(upload_dir, exist_ok=True)

        file_uuid = str(uuid.uuid4())
        safe_filename = (file.filename or "file").replace(" ", "_")
        filename = f"km_{file_uuid}_{safe_filename}"
        file_path = os.path.join(upload_dir, filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return f"/uploads/km/{filename}"
