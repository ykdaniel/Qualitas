schemas_to_add = """
# --- Knowledge Management (KM) Schemas ---

class KMCategoryBase(BaseModel):
    name: str
    description: Optional[str] = None

class KMCategoryCreate(KMCategoryBase):
    pass

class KMCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class KMCategory(KMCategoryBase):
    id: int
    class Config:
        from_attributes = True

class KMTagBase(BaseModel):
    name: str

class KMTagCreate(KMTagBase):
    pass

class KMTag(KMTagBase):
    id: int
    class Config:
        from_attributes = True

class KMRelationBase(BaseModel):
    target_module: str
    target_id: str

class KMRelationCreate(KMRelationBase):
    pass

class KMRelation(KMRelationBase):
    id: int
    article_id: int
    class Config:
        from_attributes = True

class KMArticleHistory(BaseModel):
    id: int
    article_id: int
    content_md: str
    version: int
    updated_at: str
    updated_by: Optional[str] = None
    class Config:
        from_attributes = True

class KMArticleBase(BaseModel):
    title: str
    content_md: str
    category_id: Optional[int] = None
    status: Optional[str] = "Draft"

class KMArticleCreate(KMArticleBase):
    tags: Optional[List[str]] = []
    relations: Optional[List[KMRelationBase]] = []

class KMArticleUpdate(BaseModel):
    title: Optional[str] = None
    content_md: Optional[str] = None
    category_id: Optional[int] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None
    relations: Optional[List[KMRelationBase]] = None

class KMArticle(KMArticleBase):
    id: int
    version: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    created_by: Optional[str] = None

    category: Optional[KMCategory] = None
    tags: List[KMTag] = []
    relations: List[KMRelation] = []

    class Config:
        from_attributes = True

class KMArticleDetail(KMArticle):
    histories: List[KMArticleHistory] = []
"""

with open(r'c:\Users\YUKAI\Desktop\Qualitas\backend\schemas.py', 'a', encoding='utf-8') as f:
    f.write(schemas_to_add)
