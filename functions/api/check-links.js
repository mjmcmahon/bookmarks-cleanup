// Cloudflare Pages Function — POST /api/check-links
//
// Probes a list of URLs with a 20-wide async pool, streams NDJSON back so the
// frontend can paint status badges as each URL completes. Replaces the Node
// + undici backend used during local Fastify development.
//
// Request:  { urls: string[] }    (1..2000)
// Headers:  X-Bookmarks-Cleanup-Token: <env.BOOKMARKS_TOKEN>
// Response: application/x-ndjson; one {url, status, code, reason}\n per line.
//
// Classification (must match the original backend):
//   dead   — HTTP 404 / 410, DNS failure, connection refused
//   alive  — anything responsive, including 403 / 5xx
//   error  — anything else weird / unverifiable (timeouts, SSL, sockets, …)

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const REQUEST_TIMEOUT_MS = 15_000;
const CONCURRENCY = 20;
const MAX_URLS = 2000;

export async function onRequestPost({ request, env }) {
  // Token has to be configured server-side. Distinguishes "server not set up"
  // (503) from "client sent the wrong token" (401) so a missing-secret deploy
  // doesn't read as an auth bug.
  if (!env.BOOKMARKS_TOKEN) {
    return jsonError(
      503,
      'not_configured',
      'Server is missing BOOKMARKS_TOKEN. Set it in the Cloudflare dashboard or .dev.vars.'
    );
  }
  const token = request.headers.get('x-bookmarks-cleanup-token');
  if (token !== env.BOOKMARKS_TOKEN) {
    return jsonError(401, 'unauthorized', 'Missing or invalid token.');
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'bad_request', 'Body must be JSON.');
  }
  const urls = body?.urls;
  if (!Array.isArray(urls) || urls.length === 0) {
    return jsonError(400, 'bad_request', 'expected { urls: string[] }');
  }
  if (urls.length > MAX_URLS) {
    return jsonError(400, 'too_many', `at most ${MAX_URLS} URLs per request`);
  }
  if (!urls.every((u) => typeof u === 'string')) {
    return jsonError(400, 'bad_request', 'every url must be a string');
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const writeLine = (obj) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      };

      let cursor = 0;
      const aborted = { value: false };
      // Best-effort early exit if the client disconnects.
      request.signal?.addEventListener?.('abort', () => {
        aborted.value = true;
      });

      async function worker() {
        while (cursor < urls.length && !aborted.value) {
          const url = urls[cursor++];
          let result;
          try {
            result = await probe(url);
          } catch (err) {
            result = {
              url,
              status: 'error',
              code: null,
              reason: err?.message || 'unknown',
            };
          }
          if (aborted.value) return;
          writeLine(result);
        }
      }

      const workers = [];
      const n = Math.min(CONCURRENCY, urls.length);
      for (let i = 0; i < n; i++) workers.push(worker());
      await Promise.all(workers);
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-cache, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

async function probe(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { url, status: 'error', code: null, reason: 'Invalid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      url,
      status: 'error',
      code: null,
      reason: `Unsupported scheme (${parsed.protocol})`,
    };
  }

  const head = await tryFetch(url, 'HEAD');
  if (head.code != null) {
    if (head.code === 405 || head.code === 501) {
      const get = await tryFetch(url, 'GET');
      return { url, ...classify(get.code, get.err) };
    }
    return { url, ...classify(head.code, head.err) };
  }

  // HEAD threw. For terminal errors GET would fail the same way; otherwise
  // retry once with GET (sites that bot-block HEAD specifically often answer
  // GET cleanly).
  const reason = errorReason(head.err);
  if (reason === 'DNS failure' || reason === 'Connection refused') {
    return { url, ...classify(null, head.err) };
  }
  const get = await tryFetch(url, 'GET');
  return { url, ...classify(get.code, get.err) };
}

async function tryFetch(url, method) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'user-agent': UA, accept: '*/*' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (method !== 'HEAD' && res.body) {
      try {
        await res.body.cancel();
      } catch {
        /* ignore drain errors */
      }
    }
    return { code: res.status, err: null };
  } catch (err) {
    return { code: null, err };
  } finally {
    clearTimeout(timer);
  }
}

function classify(code, err) {
  if (code === 404 || code === 410) {
    return { status: 'dead', code, reason: `HTTP ${code}` };
  }
  if (err) {
    const reason = errorReason(err) || 'unknown';
    if (reason === 'DNS failure' || reason === 'Connection refused') {
      return { status: 'dead', code: null, reason };
    }
    return { status: 'error', code: null, reason };
  }
  if (code != null) {
    return { status: 'alive', code, reason: null };
  }
  return { status: 'error', code: null, reason: 'No response' };
}

function errorReason(err) {
  if (!err) return null;
  const msg = (err.message || '').toString();
  const name = (err.name || '').toString();
  if (name === 'AbortError') return 'Timeout';
  if (/getaddrinfo|ENOTFOUND|name not resolved|DNS/i.test(msg)) return 'DNS failure';
  if (/ECONNREFUSED|connection refused/i.test(msg)) return 'Connection refused';
  if (/ECONNRESET|connection reset/i.test(msg)) return 'Connection reset';
  if (/SSL|TLS|certificate|cert/i.test(msg)) return 'SSL';
  if (/socket|network/i.test(msg)) return 'Network error';
  return msg || name || null;
}

function jsonError(status, code, message) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
