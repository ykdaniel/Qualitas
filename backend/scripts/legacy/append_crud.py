crud_code = """
# --- Knowledge Management (KM) CRUD ---

def get_km_categories(db: Session):
    return db.query(models.KMCategory).all()

def create_km_category(db: Session, category: schemas.KMCategoryCreate):
    db_cat = models.KMCategory(**category.model_dump())
    db.add(db_cat)
    db.commit()
    db.refresh(db_cat)
    return db_cat

def get_km_tags(db: Session):
    return db.query(models.KMTag).all()

def get_or_create_tags(db: Session, tag_names: list):
    tags = []
    for name in tag_names:
        tag = db.query(models.KMTag).filter(models.KMTag.name == name).first()
        if not tag:
            tag = models.KMTag(name=name)
            db.add(tag)
            db.commit()
            db.refresh(tag)
        tags.append(tag)
    return tags

def get_km_articles(db: Session, skip: int = 0, limit: int = 100, category_id: int = None, search: str = None, tag: str = None):
    query = db.query(models.KMArticle)
    if category_id:
        query = query.filter(models.KMArticle.category_id == category_id)
    if search:
        query = query.filter(models.KMArticle.title.ilike(f"%{search}%"))
    if tag:
        query = query.join(models.KMArticle.tags).filter(models.KMTag.name == tag)
    return query.order_by(models.KMArticle.id.desc()).offset(skip).limit(limit).all()

def get_km_article(db: Session, article_id: int):
    return db.query(models.KMArticle).filter(models.KMArticle.id == article_id).first()

def create_km_article(db: Session, article: schemas.KMArticleCreate, user_id: int = None, username: str = None):
    # Setup tags
    db_tags = get_or_create_tags(db, article.tags)

    # Setup relations
    db_relations = []
    for rel in article.relations:
        db_relations.append(models.KMRelation(target_module=rel.target_module, target_id=rel.target_id))

    from datetime import datetime
    db_article = models.KMArticle(
        title=article.title,
        content_md=article.content_md,
        category_id=article.category_id,
        status=article.status,
        created_at=datetime.utcnow().isoformat(),
        updated_at=datetime.utcnow().isoformat(),
        created_by=username,
        tags=db_tags,
        relations=db_relations
    )
    db.add(db_article)
    db.commit()
    db.refresh(db_article)

    # Create first history
    history = models.KMArticleHistory(
        article_id=db_article.id,
        content_md=db_article.content_md,
        version=1,
        updated_at=db_article.updated_at,
        updated_by=username
    )
    db.add(history)
    db.commit()

    # Log Audit
    from sqlalchemy.orm import Session
    log_audit(db, "CREATE", "KMArticle", str(db_article.id), db_article.title, new_value={"title": db_article.title, "status": db_article.status}, user_id=user_id, username=username)
    return db_article

def update_km_article(db: Session, article_id: int, article: schemas.KMArticleUpdate, user_id: int = None, username: str = None):
    db_article = db.query(models.KMArticle).filter(models.KMArticle.id == article_id).first()
    if not db_article:
        return None

    old_value = {"title": db_article.title, "status": db_article.status, "version": db_article.version}

    # Update fields
    if article.title is not None:
        db_article.title = article.title
    if article.status is not None:
        db_article.status = article.status
    if article.category_id is not None:
        db_article.category_id = article.category_id

    # Update content and history if content changed
    from datetime import datetime
    if article.content_md is not None and article.content_md != db_article.content_md:
        db_article.content_md = article.content_md
        db_article.version += 1
        db_article.updated_at = datetime.utcnow().isoformat()

        history = models.KMArticleHistory(
            article_id=db_article.id,
            content_md=db_article.content_md,
            version=db_article.version,
            updated_at=db_article.updated_at,
            updated_by=username
        )
        db.add(history)

    # Update tags
    if article.tags is not None:
        db_tags = get_or_create_tags(db, article.tags)
        db_article.tags = db_tags

    # Update relations
    if article.relations is not None:
        db.query(models.KMRelation).filter(models.KMRelation.article_id == article_id).delete()
        db_relations = []
        for rel in article.relations:
            db_relations.append(models.KMRelation(target_module=rel.target_module, target_id=rel.target_id))
        db_article.relations = db_relations

    db.commit()
    db.refresh(db_article)

    # Log Audit
    new_value = {"title": db_article.title, "status": db_article.status, "version": db_article.version}
    log_audit(db, "UPDATE", "KMArticle", str(db_article.id), db_article.title, old_value=old_value, new_value=new_value, user_id=user_id, username=username)

    return db_article

def delete_km_article(db: Session, article_id: int, user_id: int = None, username: str = None):
    db_article = db.query(models.KMArticle).filter(models.KMArticle.id == article_id).first()
    if db_article:
        old_value = {"title": db_article.title}
        title = db_article.title
        db.delete(db_article)
        db.commit()
        log_audit(db, "DELETE", "KMArticle", str(article_id), title, old_value=old_value, user_id=user_id, username=username)
        return True
    return False
"""

with open(r'c:\Users\YUKAI\Desktop\Qualitas\backend\crud.py', 'a', encoding='utf-8') as f:
    f.write(crud_code)
