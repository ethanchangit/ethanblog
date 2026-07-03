/**
 * EthanBlog API — Phase 3 占位
 * 未来将实现：GitHub OAuth、收藏、阅读进度
 */
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return Response.json({
        status: 'ok',
        phase: 3,
        message: 'API scaffold ready — auth & favorites coming soon',
      });
    }

    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
