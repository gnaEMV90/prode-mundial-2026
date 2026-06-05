const API_ORIGIN = 'https://prode-mundial-2026-api.gnaemv90-prode.workers.dev';

function shouldServeIndex(request, response) {
  if (request.method !== 'GET') return false;
  if (response.status !== 404) return false;

  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const apiPath = url.pathname.replace(/^\/api/, '') || '/';
      const targetUrl = new URL(`${apiPath}${url.search}`, API_ORIGIN);

      const headers = new Headers(request.headers);
      headers.delete('host');

      const apiRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        redirect: 'manual'
      });

      const apiResponse = await fetch(apiRequest);
      const responseHeaders = new Headers(apiResponse.headers);

      responseHeaders.delete('access-control-allow-origin');
      responseHeaders.delete('access-control-allow-credentials');
      responseHeaders.delete('access-control-allow-methods');
      responseHeaders.delete('access-control-allow-headers');

      return new Response(apiResponse.body, {
        status: apiResponse.status,
        statusText: apiResponse.statusText,
        headers: responseHeaders
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);

    if (shouldServeIndex(request, assetResponse)) {
      const indexUrl = new URL('/index.html', request.url);
      return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
    }

    return assetResponse;
  }
};