"""
YouTube URL parsing and normalisation utility.

Only YouTube is supported. The only responsibility of this module is:
  1. Accept a raw URL string from user input.
  2. Validate it is a YouTube URL (domain whitelist).
  3. Extract the 11-character video ID.
  4. Return a ParsedVideo with the canonical watch URL.

Supported URL formats:
  - https://www.youtube.com/watch?v=VIDEO_ID       (standard)
  - https://youtu.be/VIDEO_ID                      (short)
  - https://www.youtube.com/embed/VIDEO_ID         (embed)
  - https://www.youtube.com/shorts/VIDEO_ID        (Shorts)
  - https://m.youtube.com/watch?v=VIDEO_ID         (mobile)

Security notes:
  - Domain is whitelisted; no other providers are accepted.
  - The video ID is validated against a strict alphanumeric pattern.
  - Callers must derive embed URLs from `external_id`, never from raw input.

Raises:
  ValueError: for any URL that is invalid, unsupported, or has a malformed ID.
"""
import re
from dataclasses import dataclass
from typing import Literal
from urllib.parse import parse_qs, urlparse

# YouTube video IDs are exactly 11 characters: letters, digits, hyphens, underscores.
_YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

# Whitelisted base hostnames (port and subdomain stripped before matching).
_YOUTUBE_BASE_HOSTS = {"youtube.com", "youtu.be"}


@dataclass(frozen=True)
class ParsedVideo:
    provider: Literal["YOUTUBE"]
    external_id: str  # 11-char YouTube video ID
    url: str          # canonical: https://www.youtube.com/watch?v={id}


def parse_video_url(raw_url: str) -> ParsedVideo:
    """
    Parse a YouTube URL and return a normalised ParsedVideo.

    Raises:
        ValueError: if the URL is invalid, not a YouTube URL, or has a bad video ID.
    """
    raw_url = raw_url.strip()
    if not raw_url:
        raise ValueError("Video URL must not be empty")

    try:
        parsed = urlparse(raw_url)
    except Exception:
        raise ValueError("Invalid URL format")

    if parsed.scheme not in ("http", "https"):
        raise ValueError("Video URL must use http or https")

    # Normalise host: strip port, lowercase, strip www./m. prefixes.
    host = _normalise_host(parsed.netloc)
    if host not in _YOUTUBE_BASE_HOSTS:
        raise ValueError(
            f"Unsupported video provider. Only YouTube URLs are accepted (got: {parsed.netloc!r})"
        )

    video_id = _extract_youtube_id(host, parsed)
    if not video_id or not _YOUTUBE_ID_RE.match(video_id):
        raise ValueError(
            "Could not extract a valid YouTube video ID from the URL. "
            "Expected an 11-character alphanumeric ID."
        )

    canonical_url = f"https://www.youtube.com/watch?v={video_id}"
    return ParsedVideo(provider="YOUTUBE", external_id=video_id, url=canonical_url)


def _normalise_host(netloc: str) -> str:
    """
    Strip port, lowercase, and remove www./m. prefixes to get a base hostname.

    Examples:
        "www.youtube.com"  -> "youtube.com"
        "m.youtube.com"    -> "youtube.com"
        "youtu.be"         -> "youtu.be"
        "www.youtu.be"     -> "youtu.be"
    """
    host = netloc.lower().split(":")[0]  # strip port
    for prefix in ("www.", "m."):
        if host.startswith(prefix):
            host = host[len(prefix):]
    return host


def _extract_youtube_id(base_host: str, parsed) -> str | None:
    """Extract video ID from a parsed YouTube URL given its normalised base host."""
    path = parsed.path.rstrip("/")

    # https://youtu.be/VIDEO_ID
    if base_host == "youtu.be":
        segment = path.lstrip("/").split("/")[0]
        return segment or None

    # base_host == "youtube.com" from here on
    # https://www.youtube.com/shorts/VIDEO_ID
    if path.startswith("/shorts/"):
        parts = path.split("/")
        return parts[2] if len(parts) > 2 and parts[2] else None

    # https://www.youtube.com/embed/VIDEO_ID
    if path.startswith("/embed/"):
        parts = path.split("/")
        return parts[2] if len(parts) > 2 and parts[2] else None

    # https://www.youtube.com/watch?v=VIDEO_ID  (also handles m.youtube.com)
    qs = parse_qs(parsed.query)
    ids = qs.get("v", [])
    return ids[0] if ids else None


# ---------------------------------------------------------------------------
# Application-level invariant guard
# ---------------------------------------------------------------------------

def assert_video_columns_consistent(
    video_provider: str | None,
    video_url: str | None,
    video_external_id: str | None,
) -> None:
    """
    Raise ValueError if the three video columns are in a partially-set state.

    Valid states:
      - All three are None (no video).
      - All three are non-empty strings (video attached).

    Any other combination is an invariant violation that should never reach the DB.
    """
    values = (video_provider, video_url, video_external_id)
    set_count = sum(1 for v in values if v is not None and (not isinstance(v, str) or v.strip() != ""))
    if set_count not in (0, 3):
        raise ValueError(
            "Incomplete video metadata: video_provider, video_url, and "
            "video_external_id must all be set or all be null. "
            f"Got: provider={video_provider!r}, url={video_url!r}, "
            f"external_id={video_external_id!r}"
        )
