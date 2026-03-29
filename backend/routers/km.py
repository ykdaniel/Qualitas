
from fastapi import APIRouter, Depends, File, UploadFile

import schemas
from core.dependencies import get_km_service
from core.security import get_current_user
from services.km_service import KMService

router = APIRouter(
    prefix="/km",
    tags=["km"]
)

@router.get("/", response_model=list[schemas.KMArticle])
def read_km_articles(
    skip: int = 0,
    limit: int = 100,
    category: str | None = None,
    search: str | None = None,
    service: KMService = Depends(get_km_service),
    current_user: schemas.User = Depends(get_current_user)
):
    return service.get_articles(skip=skip, limit=limit, category=category, search=search)

@router.get("/{id}", response_model=schemas.KMArticle)
def read_km_article(
    id: str,
    service: KMService = Depends(get_km_service),
    current_user: schemas.User = Depends(get_current_user)
):
    return service.get_article(article_id=id)

@router.get("/{id}/history", response_model=list[schemas.KMArticleHistory])
def read_km_article_history(
    id: str,
    service: KMService = Depends(get_km_service),
    current_user: schemas.User = Depends(get_current_user)
):
    return service.get_article_history(article_id=id)

@router.post("/", response_model=schemas.KMArticle)
def create_km_article(
    article: schemas.KMArticleCreate,
    service: KMService = Depends(get_km_service),
    current_user: schemas.User = Depends(get_current_user)
):
    return service.create_article(article_create=article, author_id=current_user.id)

@router.put("/{id}", response_model=schemas.KMArticle)
def update_km_article(
    id: str,
    article_update: schemas.KMArticleUpdate,
    service: KMService = Depends(get_km_service),
    current_user: schemas.User = Depends(get_current_user)
):
    return service.update_article(article_id=id, article_update=article_update)

@router.delete("/{id}")
def delete_km_article(
    id: str,
    service: KMService = Depends(get_km_service),
    current_user: schemas.User = Depends(get_current_user)
):
    return service.delete_article(article_id=id)

@router.post("/upload-image")
def upload_km_image(
    file: UploadFile = File(...),
    service: KMService = Depends(get_km_service),
    current_user: schemas.User = Depends(get_current_user)
):
    url = service.upload_image(file)
    return {"url": url}
