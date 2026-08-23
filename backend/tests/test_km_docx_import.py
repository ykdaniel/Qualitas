"""Tests for KMService.import_docx's heading-to-chapter matching logic.

pandoc isn't available in this environment, so subprocess.run is mocked to
write a canned HTML fixture directly to the tempfile pandoc would normally
produce — everything downstream (BeautifulSoup parsing, chapter matching,
DB updates) runs for real against the test DB.
"""
import io
from unittest.mock import patch

import models
from repositories.km_repository import KMRepository
from services.km_service import KMService


def _fake_pandoc_run(html: str):
    """Build a subprocess.run replacement that writes `html` to the
    output path pandoc was asked to produce, mimicking a successful run."""
    def _run(cmd, capture_output=True, text=True):
        html_path = cmd[cmd.index('-o') + 1]
        with open(html_path, 'w', encoding='utf-8') as f:
            f.write(html)

        class _Result:
            returncode = 0
            stderr = ''
        return _Result()
    return _run


def _upload_file():
    return type('F', (), {'file': io.BytesIO(b'fake docx bytes')})()


def _make_book(db_session, sample_contractor, article_id, chapter_no=None, parent_id=None, title='Book'):
    article = models.KMArticle(
        id=article_id,
        articleNo=f'QTS-KM-{article_id}',
        title=title,
        content='',
        category='Procedure',
        status='Draft',
        author_id=1,
        created_at='2026-01-01',
        updated_at='2026-01-01',
        parent_id=parent_id,
        chapter_no=chapter_no,
        version_no=1,
    )
    db_session.add(article)
    db_session.commit()
    return article


def test_single_chapter_book_imports_whole_document(db_session, sample_contractor):
    """A book with no children has nothing a heading could ever match by
    chapter_no prefix — the whole document must land in the root chapter
    instead of every section being reported skipped."""
    _make_book(db_session, sample_contractor, 'book-single')

    html = (
        '<html><body>'
        '<h2>1.0 Purpose</h2><p>Some purpose text.</p>'
        '<h2>2.0 Scope</h2><p>Some scope text.</p>'
        '</body></html>'
    )
    service = KMService(KMRepository(db_session))
    with patch('subprocess.run', side_effect=_fake_pandoc_run(html)):
        result = service.import_docx('book-single', _upload_file(), author_id=1)

    assert result['skipped'] == []
    assert len(result['updated']) == 1
    assert result['updated'][0]['chapter_no'] is None

    db_session.refresh(db_session.get(models.KMArticle, 'book-single'))
    updated = db_session.get(models.KMArticle, 'book-single')
    assert 'Purpose text' not in updated.content  # sanity: not literal placeholder
    assert 'Some purpose text.' in updated.content
    assert 'Some scope text.' in updated.content


def test_chapter_number_prefix_requires_boundary(db_session, sample_contractor):
    """Chapter "1" must not match a heading like "15 Other Notes" just
    because the text happens to start with the same digit."""
    _make_book(db_session, sample_contractor, 'book-multi')
    ch1 = _make_book(db_session, sample_contractor, 'ch-1', chapter_no='1', parent_id='book-multi', title='Chapter 1')
    _make_book(db_session, sample_contractor, 'ch-2', chapter_no='2', parent_id='book-multi', title='Chapter 2')

    html = (
        '<html><body>'
        '<h2>1 Real Chapter One</h2><p>Chapter one content.</p>'
        '<h2>15 Unrelated Notes</h2><p>Should not overwrite chapter 1.</p>'
        '</body></html>'
    )
    service = KMService(KMRepository(db_session))
    with patch('subprocess.run', side_effect=_fake_pandoc_run(html)):
        result = service.import_docx('book-multi', _upload_file(), author_id=1)

    updated_nos = {u['chapter_no'] for u in result['updated']}
    assert updated_nos == {'1'}
    assert '15 Unrelated Notes' in result['skipped']

    db_session.refresh(ch1)
    assert 'Chapter one content.' in ch1.content
    assert 'Should not overwrite' not in ch1.content


def test_preamble_content_before_first_heading_is_not_silently_dropped(db_session, sample_contractor):
    """Content appearing before the first heading used to vanish entirely
    (never appended anywhere) — it should now at least surface as skipped
    for a multi-chapter book, rather than disappearing without a trace."""
    _make_book(db_session, sample_contractor, 'book-preamble')
    _make_book(db_session, sample_contractor, 'ch-1', chapter_no='1', parent_id='book-preamble', title='Chapter 1')

    html = (
        '<html><body>'
        '<p>Orphaned preamble paragraph.</p>'
        '<h2>1 Chapter One</h2><p>Real content.</p>'
        '</body></html>'
    )
    service = KMService(KMRepository(db_session))
    with patch('subprocess.run', side_effect=_fake_pandoc_run(html)):
        result = service.import_docx('book-preamble', _upload_file(), author_id=1)

    assert any('before first heading' in s for s in result['skipped'])
    assert {'chapter_no': '1', 'title': 'Chapter 1'} in result['updated']
