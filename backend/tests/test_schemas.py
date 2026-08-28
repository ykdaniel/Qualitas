import schemas


def test_itr_update_detail_data_stays_a_string():
    """Regression: ITRUpdate.parse_photos (a field_validator shared with
    defectPhotos/improvementPhotos/attachments) used to also list
    'detail_data', eagerly json.loads()-ing it before Pydantic's own type
    check ran. Since detail_data is declared `str | None` (unlike the photo
    fields, which are meant to become lists), this made every real save —
    which always sends detail_data as a JSON string — fail with a 422
    ("Input should be a valid string") at the HTTP boundary. Backend service
    unit tests never caught this because they call the service layer
    directly, bypassing Pydantic schema validation entirely."""
    payload = '{"referenceStandards": "", "drawings": []}'

    update = schemas.ITRUpdate(detail_data=payload)

    assert isinstance(update.detail_data, str)
    assert update.detail_data == payload


def test_itr_update_photo_fields_still_parse_json_strings():
    """Sanity check the fix didn't remove parsing for the fields that
    actually need it."""
    update = schemas.ITRUpdate(
        defectPhotos='["a.jpg", "b.jpg"]',
        attachments='[{"name": "c.pdf"}]',
    )

    assert update.defectPhotos == ["a.jpg", "b.jpg"]
    assert update.attachments == [{"name": "c.pdf"}]
