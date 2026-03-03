"""
Integration tests for manual workout template CRUD.

Covers: create, read, update (including publish), delete, blocks, items,
permissions (team isolation, role guards, cross-coach exercise visibility).
"""
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Exercise, UserProfile, WorkoutBlock, WorkoutTemplate

HEADERS = {"Authorization": "Bearer test-token"}
TEMPLATES_URL = "/v1/workout-templates"
BLOCKS_URL = "/v1/blocks"
BLOCK_ITEMS_URL = "/v1/block-items"


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _exercise_payload(name: str = "Push Up") -> dict:
    return {
        "name": name,
        "description": "A standard push up exercise with full range of motion.",
        "tags": ["strength", "upper-body"],
    }


def _create_template(client: TestClient, title: str = "My Template") -> dict:
    r = client.post(TEMPLATES_URL, headers=HEADERS, json={"title": title})
    assert r.status_code == 201, r.text
    return r.json()


def _create_block(client: TestClient, template_id: str, name: str = "Block A") -> dict:
    r = client.post(
        f"{TEMPLATES_URL}/{template_id}/blocks",
        headers=HEADERS,
        json={"name": name},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _create_exercise(client: TestClient, payload: dict | None = None) -> dict:
    r = client.post(
        "/v1/exercises",
        headers=HEADERS,
        json=payload or _exercise_payload(),
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# Auth and role guards
# ---------------------------------------------------------------------------

class TestTemplateAuth:
    def test_create_requires_auth(self, client: TestClient):
        r = client.post(TEMPLATES_URL, json={"title": "No Auth"})
        assert r.status_code == 401

    def test_athlete_cannot_create(
        self, client: TestClient, mock_jwt, athlete_a: UserProfile
    ):
        mock_jwt(str(athlete_a.supabase_user_id))
        r = client.post(TEMPLATES_URL, headers=HEADERS, json={"title": "Athlete"})
        assert r.status_code == 403

    def test_list_requires_auth(self, client: TestClient):
        r = client.get(TEMPLATES_URL)
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# Template CRUD
# ---------------------------------------------------------------------------

class TestTemplateCRUD:
    def test_create_returns_201_with_draft_status(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        r = client.post(TEMPLATES_URL, headers=HEADERS, json={"title": "Sprint Day"})
        assert r.status_code == 201
        body = r.json()
        assert body["title"] == "Sprint Day"
        assert body["status"] == "draft"
        assert body["team_id"] == str(coach_a.team_id)

    def test_title_min_length_3(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        r = client.post(TEMPLATES_URL, headers=HEADERS, json={"title": "AB"})
        assert r.status_code == 422

    def test_title_empty_rejected(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        r = client.post(TEMPLATES_URL, headers=HEADERS, json={"title": ""})
        assert r.status_code == 422

    def test_get_own_template(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        r = client.get(f"{TEMPLATES_URL}/{t['id']}", headers=HEADERS)
        assert r.status_code == 200
        assert r.json()["id"] == t["id"]
        assert r.json()["status"] == "draft"

    def test_cannot_see_other_teams_template(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        coach_b: UserProfile,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client, "Team A Template")

        # Switch to coach B (different team)
        mock_jwt(str(coach_b.supabase_user_id))
        r = client.get(f"{TEMPLATES_URL}/{t['id']}", headers=HEADERS)
        assert r.status_code == 404

    def test_list_only_own_team(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        coach_b: UserProfile,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        _create_template(client, "Team A Only")

        mock_jwt(str(coach_b.supabase_user_id))
        r = client.get(TEMPLATES_URL, headers=HEADERS)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        # Team B should see zero templates (none created for them)
        assert len(ids) == 0

    def test_publish_template(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        """Happy path: template with ≥1 block and ≥1 exercise can be published."""
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        b = _create_block(client, t["id"])
        ex = _create_exercise(client)
        client.post(
            f"{BLOCKS_URL}/{b['id']}/items",
            headers=HEADERS,
            json={"exercise_id": ex["id"]},
        )

        r = client.patch(
            f"{TEMPLATES_URL}/{t['id']}",
            headers=HEADERS,
            json={"status": "published"},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "published"

    def test_cannot_publish_empty_template(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        """Template with no blocks cannot be published → 422."""
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)

        r = client.patch(
            f"{TEMPLATES_URL}/{t['id']}",
            headers=HEADERS,
            json={"status": "published"},
        )
        assert r.status_code == 422
        assert "block" in r.json()["detail"].lower()

    def test_cannot_publish_template_with_empty_blocks(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        """Template with blocks but no exercises cannot be published → 422."""
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        _create_block(client, t["id"])  # block exists but has no items

        r = client.patch(
            f"{TEMPLATES_URL}/{t['id']}",
            headers=HEADERS,
            json={"status": "published"},
        )
        assert r.status_code == 422
        assert "exercise" in r.json()["detail"].lower()

    def test_publish_is_idempotent(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        """Publishing an already-published template succeeds without error."""
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        b = _create_block(client, t["id"])
        ex = _create_exercise(client)
        client.post(
            f"{BLOCKS_URL}/{b['id']}/items",
            headers=HEADERS,
            json={"exercise_id": ex["id"]},
        )

        # First publish
        r1 = client.patch(
            f"{TEMPLATES_URL}/{t['id']}",
            headers=HEADERS,
            json={"status": "published"},
        )
        assert r1.status_code == 200

        # Second publish — idempotent
        r2 = client.patch(
            f"{TEMPLATES_URL}/{t['id']}",
            headers=HEADERS,
            json={"status": "published"},
        )
        assert r2.status_code == 200
        assert r2.json()["status"] == "published"

    def test_athlete_cannot_publish(
        self, client: TestClient, mock_jwt, athlete_a: UserProfile
    ):
        """PATCH with status='published' requires COACH role → 403 for athletes."""
        mock_jwt(str(athlete_a.supabase_user_id))
        r = client.patch(
            f"{TEMPLATES_URL}/{uuid.uuid4()}",
            headers=HEADERS,
            json={"status": "published"},
        )
        assert r.status_code == 403

    def test_cannot_publish_other_teams_template(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        coach_b: UserProfile,
    ):
        """PATCH on another team's template → 404 (no IDOR)."""
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)

        mock_jwt(str(coach_b.supabase_user_id))
        r = client.patch(
            f"{TEMPLATES_URL}/{t['id']}",
            headers=HEADERS,
            json={"status": "published"},
        )
        assert r.status_code == 404

    def test_invalid_status_rejected(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        r = client.patch(
            f"{TEMPLATES_URL}/{t['id']}",
            headers=HEADERS,
            json={"status": "archived"},
        )
        assert r.status_code == 422

    def test_delete_template_cascades(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        _create_block(client, t["id"])

        r = client.delete(f"{TEMPLATES_URL}/{t['id']}", headers=HEADERS)
        assert r.status_code == 204

        # Should be gone
        r2 = client.get(f"{TEMPLATES_URL}/{t['id']}", headers=HEADERS)
        assert r2.status_code == 404

    def test_delete_other_teams_template_returns_404(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        coach_b: UserProfile,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)

        mock_jwt(str(coach_b.supabase_user_id))
        r = client.delete(f"{TEMPLATES_URL}/{t['id']}", headers=HEADERS)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Block operations
# ---------------------------------------------------------------------------

class TestBlockCRUD:
    def test_add_block_assigns_order_index(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)

        b1 = _create_block(client, t["id"], "Block A")
        b2 = _create_block(client, t["id"], "Block B")

        assert b1["order"] == 0
        assert b2["order"] == 1

    def test_rename_block(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        b = _create_block(client, t["id"])

        r = client.patch(
            f"{BLOCKS_URL}/{b['id']}",
            headers=HEADERS,
            json={"name": "Renamed Block"},
        )
        assert r.status_code == 200
        assert r.json()["name"] == "Renamed Block"

    def test_delete_block(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        b = _create_block(client, t["id"])

        r = client.delete(f"{BLOCKS_URL}/{b['id']}", headers=HEADERS)
        assert r.status_code == 204

        # Detail should show no blocks
        detail = client.get(f"{TEMPLATES_URL}/{t['id']}", headers=HEADERS).json()
        assert len(detail["blocks"]) == 0

    def test_reorder_blocks(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        b1 = _create_block(client, t["id"], "First")
        b2 = _create_block(client, t["id"], "Second")

        # Swap order: b2 first, b1 second
        r = client.put(
            f"{TEMPLATES_URL}/{t['id']}/blocks/reorder",
            headers=HEADERS,
            json={"block_ids": [b2["id"], b1["id"]]},
        )
        assert r.status_code == 204

        detail = client.get(f"{TEMPLATES_URL}/{t['id']}", headers=HEADERS).json()
        ordered_names = [bl["name"] for bl in detail["blocks"]]
        assert ordered_names == ["Second", "First"]

    def test_reorder_blocks_wrong_ids_422(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        _create_block(client, t["id"])

        r = client.put(
            f"{TEMPLATES_URL}/{t['id']}/blocks/reorder",
            headers=HEADERS,
            json={"block_ids": [str(uuid.uuid4())]},  # wrong id
        )
        assert r.status_code == 422

    def test_cannot_rename_other_teams_block(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        coach_b: UserProfile,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        b = _create_block(client, t["id"])

        mock_jwt(str(coach_b.supabase_user_id))
        r = client.patch(
            f"{BLOCKS_URL}/{b['id']}",
            headers=HEADERS,
            json={"name": "Hijacked"},
        )
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Item (exercise-in-block) operations
# ---------------------------------------------------------------------------

class TestBlockItems:
    def test_add_exercise_to_block(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        ex = _create_exercise(client)
        t = _create_template(client)
        b = _create_block(client, t["id"])

        r = client.post(
            f"{BLOCKS_URL}/{b['id']}/items",
            headers=HEADERS,
            json={"exercise_id": ex["id"]},
        )
        assert r.status_code == 201
        body = r.json()
        assert body["exercise"]["id"] == ex["id"]
        assert body["exercise"]["name"] == ex["name"]

    def test_new_item_has_one_default_set(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        """Items created without explicit sets get one default set."""
        mock_jwt(str(coach_a.supabase_user_id))
        ex = _create_exercise(client)
        t = _create_template(client)
        b = _create_block(client, t["id"])

        r = client.post(
            f"{BLOCKS_URL}/{b['id']}/items",
            headers=HEADERS,
            json={"exercise_id": ex["id"]},
        )
        assert r.status_code == 201
        sets = r.json()["sets"]
        assert len(sets) == 1
        assert sets[0]["order"] == 0

    def test_update_item_sets(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        """PATCH /v1/block-items/{id} replaces sets and returns updated item."""
        mock_jwt(str(coach_a.supabase_user_id))
        ex = _create_exercise(client)
        t = _create_template(client)
        b = _create_block(client, t["id"])
        item = client.post(
            f"{BLOCKS_URL}/{b['id']}/items",
            headers=HEADERS,
            json={"exercise_id": ex["id"]},
        ).json()

        r = client.patch(
            f"{BLOCK_ITEMS_URL}/{item['id']}",
            headers=HEADERS,
            json={"sets": [
                {"order": 0, "reps": 5, "weight": 100.0, "rpe": 8.0},
                {"order": 1, "reps": 4, "weight": 105.0, "rpe": None},
            ]},
        )
        assert r.status_code == 200
        sets = r.json()["sets"]
        assert len(sets) == 2
        assert sets[0]["reps"] == 5
        assert sets[0]["weight"] == 100.0
        assert sets[1]["reps"] == 4

    def test_update_item_empty_sets_rejected(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        """Sending an empty sets list is rejected with 422."""
        mock_jwt(str(coach_a.supabase_user_id))
        ex = _create_exercise(client)
        t = _create_template(client)
        b = _create_block(client, t["id"])
        item = client.post(
            f"{BLOCKS_URL}/{b['id']}/items",
            headers=HEADERS,
            json={"exercise_id": ex["id"]},
        ).json()

        r = client.patch(
            f"{BLOCK_ITEMS_URL}/{item['id']}",
            headers=HEADERS,
            json={"sets": []},
        )
        assert r.status_code == 422

    def test_delete_item(
        self, client: TestClient, mock_jwt, coach_a: UserProfile
    ):
        """DELETE /v1/block-items/{id} removes the item and returns 204."""
        mock_jwt(str(coach_a.supabase_user_id))
        ex = _create_exercise(client)
        t = _create_template(client)
        b = _create_block(client, t["id"])
        item = client.post(
            f"{BLOCKS_URL}/{b['id']}/items",
            headers=HEADERS,
            json={"exercise_id": ex["id"]},
        ).json()

        r = client.delete(f"{BLOCK_ITEMS_URL}/{item['id']}", headers=HEADERS)
        assert r.status_code == 204

        # Item must no longer appear in the template detail
        detail = client.get(f"{TEMPLATES_URL}/{t['id']}", headers=HEADERS).json()
        item_ids = [i["id"] for bl in detail["blocks"] for i in bl["items"]]
        assert item["id"] not in item_ids

    def test_delete_item_other_team_returns_404(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        coach_b: UserProfile,
    ):
        """A coach cannot delete an item belonging to another team."""
        mock_jwt(str(coach_a.supabase_user_id))
        ex = _create_exercise(client)
        t = _create_template(client)
        b = _create_block(client, t["id"])
        item = client.post(
            f"{BLOCKS_URL}/{b['id']}/items",
            headers=HEADERS,
            json={"exercise_id": ex["id"]},
        ).json()

        mock_jwt(str(coach_b.supabase_user_id))
        r = client.delete(f"{BLOCK_ITEMS_URL}/{item['id']}", headers=HEADERS)
        assert r.status_code == 404

    def test_cannot_add_other_coaches_exercise(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        foreign_team_exercise_id: uuid.UUID,
    ):
        """Private exercise from another coach → 404 (not 403 to avoid leakage)."""
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        b = _create_block(client, t["id"])

        r = client.post(
            f"{BLOCKS_URL}/{b['id']}/items",
            headers=HEADERS,
            json={"exercise_id": str(foreign_team_exercise_id)},
        )
        assert r.status_code == 404

    def test_can_add_company_exercise(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        db_session: Session,
    ):
        """COMPANY exercises are visible to all coaches."""
        from app.models.exercise import Exercise, OwnerType

        company_ex = Exercise(
            id=uuid.uuid4(),
            coach_id=None,
            owner_type=OwnerType.COMPANY,
            is_editable=False,
            name="Company Bench Press",
            description="Standard bench press performed with a barbell on a flat bench.",
            tags=["strength", "upper-body"],
        )
        db_session.add(company_ex)
        db_session.commit()

        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        b = _create_block(client, t["id"])

        r = client.post(
            f"{BLOCKS_URL}/{b['id']}/items",
            headers=HEADERS,
            json={"exercise_id": str(company_ex.id)},
        )
        assert r.status_code == 201

    def test_cannot_publish_item_with_no_sets(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        db_session: Session,
    ):
        """If an item's sets list is emptied directly in the DB, publish must fail."""
        from app.models.block_exercise import BlockExercise as _BE

        mock_jwt(str(coach_a.supabase_user_id))
        ex = _create_exercise(client)
        t = _create_template(client)
        b = _create_block(client, t["id"])
        item_body = client.post(
            f"{BLOCKS_URL}/{b['id']}/items",
            headers=HEADERS,
            json={"exercise_id": ex["id"]},
        ).json()

        # Directly zero-out sets in DB to simulate a corrupt/legacy row
        be = db_session.get(_BE, uuid.UUID(item_body["id"]))
        be.prescription_json = {"sets": []}
        db_session.commit()

        r = client.patch(
            f"{TEMPLATES_URL}/{t['id']}",
            headers=HEADERS,
            json={"status": "published"},
        )
        assert r.status_code == 422
        assert "set" in r.json()["detail"].lower()

    def test_add_item_to_other_teams_block_returns_404(
        self,
        client: TestClient,
        mock_jwt,
        coach_a: UserProfile,
        coach_b: UserProfile,
    ):
        mock_jwt(str(coach_a.supabase_user_id))
        t = _create_template(client)
        b = _create_block(client, t["id"])
        ex = _create_exercise(client)

        mock_jwt(str(coach_b.supabase_user_id))
        r = client.post(
            f"{BLOCKS_URL}/{b['id']}/items",
            headers=HEADERS,
            json={"exercise_id": ex["id"]},
        )
        assert r.status_code == 404
