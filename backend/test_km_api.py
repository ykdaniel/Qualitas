import pytest
from fastapi.testclient import TestClient
from main import app
from database import Base, engine, SessionLocal
import models
import schemas
from core.security import create_access_token

# Configure Test Database
models.Base.metadata.create_all(bind=engine)

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c

@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module")
def admin_token(db_session):
    # Setup dummy user for auth
    user = db_session.query(models.User).filter(models.User.username == "test_km_admin").first()
    if not user:
        user = models.User(username="test_km_admin", email="test_km@example.com", hashed_password="fake")
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
    
    access_token = create_access_token(data={"sub": user.username})
    return {"Authorization": f"Bearer {access_token}"}

def test_create_km_article_with_strict_attachments(client, admin_token):
    payload = {
        "title": "Strict Type Test",
        "content": "<p>Testing strict attachment types</p>",
        "category": "General",
        "tags": "test, pydantic",
        "status": "Published",
        "attachments": [
            {
                "name": "test_doc.pdf",
                "filename": "test_doc.pdf",
                "size": "1024 KB"
            }
        ]
    }
    
    response = client.post("/api/km/", json=payload, headers=admin_token)
    assert response.status_code == 200
    data = response.json()
    assert data["title"] == payload["title"]
    assert "id" in data
    # Attachments should be correctly parsed and returned as list of dicts
    assert len(data["attachments"]) == 1
    assert data["attachments"][0]["name"] == "test_doc.pdf"
    
def test_create_km_article_invalid_attachments(client, admin_token):
    payload = {
        "title": "Invalid Type Test",
        "content": "<p>Testing invalid attachment</p>",
        "attachments": [
            {
                "invalid_field": "Missing name field, which is required"
            }
        ]
    }
    
    response = client.post("/api/km/", json=payload, headers=admin_token)
    assert response.status_code == 422 # Unprocessable Entity due to Pydantic validation
