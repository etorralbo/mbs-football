from fastapi import Depends, FastAPI
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.router import api_router
from app.db.session import get_db

app = FastAPI(title="Football MVP API")

# Include API v1 router
app.include_router(api_router)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/db/ping")
def db_ping(db: Session = Depends(get_db)):
    """
    Database connectivity check.

    Executes SELECT 1 to verify the database connection is working.
    """
    result = db.execute(text("SELECT 1")).scalar()
    return {"status": "ok", "db_ping": result}
