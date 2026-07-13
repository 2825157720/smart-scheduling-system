const json = (body, init = {}) => Response.json(body, init);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/live") {
      return json({ ok: true });
    }
    if (url.pathname === "/api/storage-info") {
      const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM staff").first();
      return json({ mode: "d1", database_available: true, staff_count: row.count });
    }
    if (url.pathname.startsWith("/api/")) {
      return json({ success: false, msg: "接口不存在" }, { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
