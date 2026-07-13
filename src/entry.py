from workers import Response, WorkerEntrypoint
from urllib.parse import urlparse


class Default(WorkerEntrypoint):
    async def fetch(self, request):
        path = urlparse(str(request.url)).path
        if path == "/api/live":
            return Response.json({"ok": True})
        if path == "/api/storage-info":
            row = await self.env.DB.prepare("SELECT COUNT(*) AS count FROM staff").first()
            return Response.json({"mode": "d1", "database_available": True, "staff_count": row.count})
        if path.startswith("/api/"):
            return Response.json({"success": False, "msg": "接口不存在"}, status=404)
        return await self.env.ASSETS.fetch(request)
