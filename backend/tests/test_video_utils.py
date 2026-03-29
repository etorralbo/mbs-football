"""Unit tests for backend/app/utils/video.py — YouTube URL parsing."""
import pytest

from app.utils.video import ParsedVideo, assert_video_columns_consistent, parse_video_url


# ---------------------------------------------------------------------------
# Valid URL formats
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("url,expected_id", [
    # Standard watch URL
    ("https://www.youtube.com/watch?v=dQw4w9WgXcW", "dQw4w9WgXcW"),
    # Without www.
    ("https://youtube.com/watch?v=dQw4w9WgXcW", "dQw4w9WgXcW"),
    # Short URL
    ("https://youtu.be/dQw4w9WgXcW", "dQw4w9WgXcW"),
    # Embed URL
    ("https://www.youtube.com/embed/dQw4w9WgXcW", "dQw4w9WgXcW"),
    # Shorts URL
    ("https://www.youtube.com/shorts/dQw4w9WgXcW", "dQw4w9WgXcW"),
    ("https://youtube.com/shorts/dQw4w9WgXcW", "dQw4w9WgXcW"),
    # Mobile URL
    ("https://m.youtube.com/watch?v=dQw4w9WgXcW", "dQw4w9WgXcW"),
    # Extra query params (playlist, timestamp, etc.) — all ignored, ID extracted
    ("https://www.youtube.com/watch?v=dQw4w9WgXcW&t=30s", "dQw4w9WgXcW"),
    ("https://www.youtube.com/watch?v=dQw4w9WgXcW&list=PL123", "dQw4w9WgXcW"),
    ("https://www.youtube.com/watch?v=dQw4w9WgXcW&si=abc123def456", "dQw4w9WgXcW"),
    # http:// is also accepted
    ("http://www.youtube.com/watch?v=dQw4w9WgXcW", "dQw4w9WgXcW"),
    # IDs with hyphens and underscores
    ("https://www.youtube.com/watch?v=abc-def_1234", "abc-def_1234"),
    # Leading/trailing whitespace
    ("  https://www.youtube.com/watch?v=dQw4w9WgXcW  ", "dQw4w9WgXcW"),
])
def test_parse_valid_url_extracts_id(url: str, expected_id: str) -> None:
    result = parse_video_url(url)
    assert isinstance(result, ParsedVideo)
    assert result.provider == "YOUTUBE"
    assert result.external_id == expected_id


def test_parse_returns_canonical_url() -> None:
    """All valid URLs should be normalised to the canonical watch URL format."""
    result = parse_video_url("https://youtu.be/dQw4w9WgXcW")
    assert result.url == "https://www.youtube.com/watch?v=dQw4w9WgXcW"


def test_parse_embed_url_returns_canonical() -> None:
    result = parse_video_url("https://www.youtube.com/embed/dQw4w9WgXcW")
    assert result.url == "https://www.youtube.com/watch?v=dQw4w9WgXcW"
    assert result.external_id == "dQw4w9WgXcW"


# ---------------------------------------------------------------------------
# Invalid URLs — must raise ValueError
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("bad_url", [
    # Wrong provider
    "https://vimeo.com/123456789",
    "https://dailymotion.com/video/abc",
    # Not a URL
    "not-a-url",
    "dQw4w9WgXcW",
    # Missing scheme
    "youtube.com/watch?v=dQw4w9WgXcW",
    # FTP scheme
    "ftp://www.youtube.com/watch?v=dQw4w9WgXcW",
    # Empty string
    "",
    # Whitespace only
    "   ",
    # YouTube URL with no v param
    "https://www.youtube.com/watch",
    "https://www.youtube.com/watch?list=PL123",
    # YouTube URL with too-short ID (less than 11 chars)
    "https://www.youtube.com/watch?v=short",
    # YouTube URL with invalid chars in ID
    "https://www.youtube.com/watch?v=has space!!",
    "https://youtu.be/has!special",
    # Embed without ID
    "https://www.youtube.com/embed/",
    # Shorts without ID
    "https://www.youtube.com/shorts/",
    # Lookalike domain (not whitelisted)
    "https://youtube.com.evil.com/watch?v=dQw4w9WgXcW",
    "https://fakeyoutube.com/watch?v=dQw4w9WgXcW",
])
def test_parse_invalid_url_raises(bad_url: str) -> None:
    with pytest.raises(ValueError):
        parse_video_url(bad_url)


def test_parse_wrong_provider_message() -> None:
    """Error message should mention unsupported provider."""
    with pytest.raises(ValueError, match="Unsupported video provider"):
        parse_video_url("https://vimeo.com/123")


def test_parse_empty_raises() -> None:
    with pytest.raises(ValueError, match="must not be empty"):
        parse_video_url("")


# ---------------------------------------------------------------------------
# Shorts URL
# ---------------------------------------------------------------------------

def test_parse_shorts_url() -> None:
    result = parse_video_url("https://www.youtube.com/shorts/dQw4w9WgXcW")
    assert result.external_id == "dQw4w9WgXcW"
    assert result.url == "https://www.youtube.com/watch?v=dQw4w9WgXcW"


# ---------------------------------------------------------------------------
# Mobile URL
# ---------------------------------------------------------------------------

def test_parse_mobile_url() -> None:
    result = parse_video_url("https://m.youtube.com/watch?v=dQw4w9WgXcW")
    assert result.external_id == "dQw4w9WgXcW"


# ---------------------------------------------------------------------------
# Lookalike domain rejection
# ---------------------------------------------------------------------------

def test_parse_subdomain_lookalike_rejected() -> None:
    """youtube.com.evil.com must NOT be accepted."""
    with pytest.raises(ValueError, match="Unsupported video provider"):
        parse_video_url("https://youtube.com.evil.com/watch?v=dQw4w9WgXcW")


# ---------------------------------------------------------------------------
# assert_video_columns_consistent
# ---------------------------------------------------------------------------

def test_consistency_all_none_ok() -> None:
    """All-null is valid (no video)."""
    assert_video_columns_consistent(None, None, None)  # must not raise


def test_consistency_all_set_ok() -> None:
    """All-set is valid (video attached)."""
    assert_video_columns_consistent(
        "YOUTUBE",
        "https://www.youtube.com/watch?v=dQw4w9WgXcW",
        "dQw4w9WgXcW",
    )  # must not raise


@pytest.mark.parametrize("provider,url,external_id", [
    # provider only
    ("YOUTUBE", None, None),
    # url only
    (None, "https://www.youtube.com/watch?v=dQw4w9WgXcW", None),
    # external_id only
    (None, None, "dQw4w9WgXcW"),
    # two of three
    ("YOUTUBE", "https://www.youtube.com/watch?v=dQw4w9WgXcW", None),
    ("YOUTUBE", None, "dQw4w9WgXcW"),
    (None, "https://www.youtube.com/watch?v=dQw4w9WgXcW", "dQw4w9WgXcW"),
])
def test_consistency_partial_raises(provider, url, external_id) -> None:
    """Any partial combination must raise ValueError."""
    with pytest.raises(ValueError, match="Incomplete video metadata"):
        assert_video_columns_consistent(provider, url, external_id)
