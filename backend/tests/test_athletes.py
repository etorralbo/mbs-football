ENDPOINT = "/v1/athletes"
HEADERS = {"Authorization": "Bearer test-token"}


def test_unauthenticated_returns_401(client):
    """Missing Authorization header → 401."""
    response = client.get(ENDPOINT)
    assert response.status_code == 401


def test_athlete_role_gets_403(client, mock_jwt, athlete_a):
    """Athletes are forbidden from listing the roster."""
    mock_jwt(str(athlete_a.supabase_user_id))
    response = client.get(ENDPOINT, headers=HEADERS)
    assert response.status_code == 403


def test_coach_can_list_team_athletes(client, mock_jwt, coach_a, athlete_a):
    """Coach gets 200 with minimal fields — athlete_id and display_name only."""
    mock_jwt(str(coach_a.supabase_user_id))
    response = client.get(ENDPOINT, headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    ids = {item["athlete_id"] for item in data}
    assert str(athlete_a.id) in ids
    # No email or sensitive fields leaked
    for item in data:
        assert set(item.keys()) == {"athlete_id", "display_name"}
    # Verify display_name value for our fixture
    match = next(d for d in data if d["athlete_id"] == str(athlete_a.id))
    assert match["display_name"] == athlete_a.name


def test_coach_sees_only_own_team_athletes(client, mock_jwt, coach_b, athlete_a):
    """coach_b (team B) cannot see athlete_a (team A) — returns empty list."""
    mock_jwt(str(coach_b.supabase_user_id))
    response = client.get(ENDPOINT, headers=HEADERS)
    assert response.status_code == 200
    ids = {item["athlete_id"] for item in response.json()}
    assert str(athlete_a.id) not in ids
