from pathlib import Path

import pytest

from documents.domain import DocumentError, sniff_mime


@pytest.mark.parametrize(
    "filename,mime",
    [
        ("sample.pdf", "application/pdf"),
        ("sample.jpg", "image/jpeg"),
        ("sample.png", "image/png"),
        ("sample.heic", "image/heic"),
    ],
)
def test_document_fixtures(filename, mime):
    assert (
        sniff_mime((Path(__file__).parent / "fixtures" / "files" / filename).read_bytes()) == mime
    )


@pytest.mark.parametrize("filename", ["fake.pdf.exe", "svg.svg"])
def test_rejected_fixtures(filename):
    with pytest.raises(DocumentError):
        sniff_mime((Path(__file__).parent / "fixtures" / "files" / filename).read_bytes())
