import activeWorker from './worker';

type Env = {
  DB: D1Database;
  APP_ENV: string;
  CORS_ORIGIN: string;
  FOOTBALL_DATA_API_TOKEN?: string;
};

type BaseWorker = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response> | Response;
};

const base = activeWorker as BaseWorker;
const CLOSED_MESSAGE =
  'El Prode Mundial 2026 finalizó y quedó en modo consulta. Ya no se pueden registrar usuarios, cargar pronósticos ni modificar datos o resultados.';
const ALLOWED_WRITE_PATHS = new Set(['/auth/login', '/auth/logout']);

export default {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const pathname = normalizePath(new URL(request.url).pathname);

    if (!isReadOnlyMethod(request.method) && !ALLOWED_WRITE_PATHS.has(pathname)) {
      return closedResponse(request, env);
    }

    return base.fetch(request, env, ctx);
  },

  scheduled: async () => {
    console.log('Prode Mundial 2026 cerrado: sincronización automática desactivada.');
  }
};

function isReadOnlyMethod(method: string) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function normalizePath(pathname: string) {
  if (!pathname.startsWith('/api/')) return pathname;
  const normalized = pathname.slice(4);
  return normalized || '/';
}

function closedResponse(request: Request, env: Env) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8'
  });
  const origin = request.headers.get('Origin');
  const allowedOrigin = env.CORS_ORIGIN || 'http://localhost:5173';

  if (origin === allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
  }

  return new Response(JSON.stringify({ error: CLOSED_MESSAGE, code: 'TOURNAMENT_CLOSED' }), {
    status: 423,
    headers
  });
}
