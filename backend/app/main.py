from fastapi import FastAPI

app = FastAPI(title="Football MVP API")

@app.get("/health")
def health():
    return {"status": "ok"}
