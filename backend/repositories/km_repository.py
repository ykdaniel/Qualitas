import uuid
import json
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional
import models
import schemas

class KMRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_next_km_no(self) -> str:
        rule = self.db.query(models.DocumentNamingRule).filter(models.DocumentNamingRule.doc_type == "km").first()
        prefix = rule.prefix if rule else "QTS-KM-"
        digits = rule.sequence_digits if rule else 6

        seq_record = self.db.query(models.ReferenceSequence).filter(
            models.ReferenceSequence.project == "QTS",
            models.ReferenceSequence.vendor == "SYS",
            models.ReferenceSequence.doc == "km"
        ).first()

        if not seq_record:
            seq_record = models.ReferenceSequence(
                project="QTS",
                vendor="SYS",
                doc="km",
                last_seq=0
            )
            self.db.add(seq_record)
            self.db.commit()
            self.db.refresh(seq_record)
        
        seq_record.last_seq += 1
        self.db.commit()
        
        return f"{prefix}{str(seq_record.last_seq).zfill(digits)}"

    def get_all(self, skip: int = 0, limit: int = 100, category: Optional[str] = None, search: Optional[str] = None) -> List[models.KMArticle]:
        query = self.db.query(models.KMArticle)
        if category:
            query = query.filter(models.KMArticle.category == category)
        if search:
            query = query.filter(models.KMArticle.title.ilike(f"%{search}%"))
        return query.offset(skip).limit(limit).all()

    def get_by_id(self, id: str) -> Optional[models.KMArticle]:
        return self.db.query(models.KMArticle).filter(models.KMArticle.id == id).first()

    def get_children(self, parent_id: str) -> List[models.KMArticle]:
        return self.db.query(models.KMArticle).filter(models.KMArticle.parent_id == parent_id).all()

    def create(self, article: schemas.KMArticleCreate, author_id: int) -> models.KMArticle:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_id = article.id or str(uuid.uuid4())
        
        attachments_val = "[]"
        if article.attachments is not None:
            if isinstance(article.attachments, str):
                attachments_val = article.attachments
            else:
                attachments_val = json.dumps(article.attachments)
        
        article_no = article.articleNo or self.get_next_km_no()
        
        db_article = models.KMArticle(
            id=new_id,
            articleNo=article_no,
            title=article.title,
            content=article.content,
            category=article.category,
            tags=article.tags,
            status=article.status,
            author_id=author_id,
            created_at=now,
            updated_at=now,
            attachments=attachments_val,
            parent_id=article.parent_id,
            chapter_no=article.chapter_no,
            version_no=1
        )
        self.db.add(db_article)
        
        # Create initial history record
        history_record = models.KMArticleHistory(
            id=str(uuid.uuid4()),
            article_id=new_id,
            version_no=1,
            title=article.title,
            content=article.content,
            category=article.category,
            tags=article.tags,
            status=article.status,
            author_id=author_id,
            attachments=attachments_val,
            parent_id=article.parent_id,
            chapter_no=article.chapter_no,
            change_summary=getattr(article, 'change_summary', None) or "Initial version",
            created_at=now
        )
        self.db.add(history_record)
        
        self.db.commit()
        self.db.refresh(db_article)
        return db_article

    def update(self, db_article: models.KMArticle, update_data: dict) -> models.KMArticle:
        if "attachments" in update_data and not isinstance(update_data["attachments"], str):
            update_data["attachments"] = json.dumps(update_data["attachments"])
            
        # Track change summary before removing it from update_data (as it's not in KMArticle)
        change_summary = update_data.pop("change_summary", None) or "Auto-saved version"
            
        update_data["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Increment version_no
        new_version = (db_article.version_no or 1) + 1
        update_data["version_no"] = new_version
        
        for key, value in update_data.items():
            setattr(db_article, key, value)
            
        # Create history record
        history_record = models.KMArticleHistory(
            id=str(uuid.uuid4()),
            article_id=db_article.id,
            version_no=new_version,
            title=db_article.title,
            content=db_article.content,
            category=db_article.category,
            tags=db_article.tags,
            status=db_article.status,
            author_id=db_article.author_id, # Keep author who last touched it, or should we track updater? Assuming author is updater for now if we don't have update_author.
            attachments=db_article.attachments,
            parent_id=db_article.parent_id,
            chapter_no=db_article.chapter_no,
            change_summary=change_summary,
            created_at=update_data["updated_at"]
        )
        self.db.add(history_record)
            
        self.db.commit()
        self.db.refresh(db_article)
        return db_article

    def delete(self, db_article: models.KMArticle) -> None:
        # Cascade delete: remove all child chapters first
        children = self.get_children(db_article.id)
        for child in children:
            self.db.delete(child)
        self.db.delete(db_article)
        self.db.commit()

    def get_history(self, article_id: str) -> List[models.KMArticleHistory]:
        return self.db.query(models.KMArticleHistory).filter(
            models.KMArticleHistory.article_id == article_id
        ).order_by(models.KMArticleHistory.version_no.desc()).all()
