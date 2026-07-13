from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

try:  # Cloudflare packages src/ as the import root; local tests import src.api.
    from config import API_PREFIX
except ImportError:  # pragma: no cover - exercised by the local test runner
    from src.config import API_PREFIX


app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


@app.exception_handler(404)
async def api_not_found(request: Request, _exc):
    if request.url.path.startswith(API_PREFIX):
        return JSONResponse(status_code=404, content={"success": False, "msg": "接口不存在"})
    return JSONResponse(status_code=404, content={"success": False, "msg": "页面不存在"})


@app.get("/api/live")
async def live():
    return {"ok": True}


@app.get("/api/storage-info")
async def storage_info(request: Request):
    """Confirm that the deployed API is reading its bound D1 database."""
    db = request.scope["env"].DB
    row = await db.prepare("SELECT COUNT(*) AS count FROM staff").first()
    return {"mode": "d1", "database_available": True, "staff_count": row.count}
