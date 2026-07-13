from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

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
