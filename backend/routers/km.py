from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from database import get_db
import models
import schemas
from core.security import get_current_user
from services.km_service import KMService

router = APIRouter(
    prefix="/km",
    tags=["km"]
)

@router.get("/", response_model=List[schemas.KMArticle])
def read_km_articles(skip: int = 0, limit: int = 100, category: Optional[str] = None, search: Optional[str] = None, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    service = KMService(db)
    return service.get_articles(skip=skip, limit=limit, category=category, search=search)

@router.get("/{id}", response_model=schemas.KMArticle)
def read_km_article(id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    service = KMService(db)
    return service.get_article(article_id=id)

@router.get("/{id}/history", response_model=List[schemas.KMArticleHistory])
def read_km_article_history(id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    service = KMService(db)
    return service.get_article_history(article_id=id)

@router.post("/", response_model=schemas.KMArticle)
def create_km_article(article: schemas.KMArticleCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    service = KMService(db)
    return service.create_article(article_create=article, author_id=current_user.id)

@router.put("/{id}", response_model=schemas.KMArticle)
def update_km_article(id: str, article_update: schemas.KMArticleUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    service = KMService(db)
    return service.update_article(article_id=id, article_update=article_update)

@router.delete("/{id}")
def delete_km_article(id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    service = KMService(db)
    return service.delete_article(article_id=id)

@router.post("/upload-image")
def upload_km_image(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    service = KMService(db)
    url = service.upload_image(file)
    return {"url": url}
