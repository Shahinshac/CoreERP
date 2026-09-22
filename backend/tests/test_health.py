from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from app.core.db import get_db
from app.main import create_app


def test_ping_endpoint(client: TestClient):
    """
    Test /api/ping returns 200 and status ok without database access.
    """
    response = client.get("/api/ping")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_endpoint_healthy(client: TestClient):
    """
    Test /api/health returns 200 and healthy status when database is reachable.
    """
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["database"] == "connected"


def test_health_endpoint_unhealthy():
    """
    Test /api/health returns 503 and unhealthy status when database check fails.
    """
    app = create_app()

    def broken_db():
        mock_db = MagicMock()
        mock_db.execute.side_effect = Exception("DB connection timeout")
        yield mock_db

    app.dependency_overrides[get_db] = broken_db
    with TestClient(app) as test_client:
        response = test_client.get("/api/health")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        assert data["database"] == "unreachable"
