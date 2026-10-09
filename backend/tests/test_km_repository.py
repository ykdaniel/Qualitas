from unittest.mock import MagicMock

import models
from repositories.km_repository import KMRepository


def test_delete_cascades_children_and_history():
    """KMArticle.children and KMArticle.history both declare
    cascade='all, delete-orphan' with ondelete='CASCADE', but SQLite's FK
    enforcement is off (PRAGMA foreign_keys never set), so neither
    actually fires. delete() must clean up chapters (already handled) AND
    history for the book + every chapter (previously missing) itself."""
    mock_db = MagicMock()
    repo = KMRepository(mock_db)

    book = models.KMArticle(id="book-1", title="Test Book")
    chapter_1 = models.KMArticle(id="ch-1", title="Chapter 1", parent_id="book-1")
    chapter_2 = models.KMArticle(id="ch-2", title="Chapter 2", parent_id="book-1")
    mock_db.query.return_value.options.return_value.filter.return_value.all.return_value = [
        chapter_1, chapter_2,
    ]

    repo.delete(book)

    # History cleanup covers the book AND both chapters in one query
    mock_db.query.assert_any_call(models.KMArticleHistory)
    history_filter_call = mock_db.query(models.KMArticleHistory).filter
    filter_expr = history_filter_call.call_args[0][0]
    assert set(filter_expr.right.value) == {"book-1", "ch-1", "ch-2"}
    history_filter_call.return_value.delete.assert_called_once()

    # Children and the book itself are still deleted
    mock_db.delete.assert_any_call(chapter_1)
    mock_db.delete.assert_any_call(chapter_2)
    mock_db.delete.assert_any_call(book)
    mock_db.commit.assert_called_once()
