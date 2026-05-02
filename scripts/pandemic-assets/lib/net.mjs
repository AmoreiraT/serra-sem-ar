import pLimit from 'p-limit';

const DEFAULT_CONFIG = {
  minDelayPerHostMs: 500,
  globalConcurrency: 6,
  perHostConcurrency: 2,
  retries: 3,
  timeoutMs: 20_000,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetriableStatus = (status) => status >= 500 && status <= 599;

const normalizeHeaders = (headers) => {
  const normalized = {};
  headers.forEach((value, key) => {
    normalized[key.toLowerCase()] = value;
  });
  return normalized;
};

export const createNetClient = (config = {}) => {
  const settings = { ...DEFAULT_CONFIG, ...config };
  const globalLimit = pLimit(settings.globalConcurrency);
  const hostLimits = new Map();
  const hostStartSlot = new Map();
  const hostNextAt = new Map();

  const getHostLimit = (host) => {
    if (!hostLimits.has(host)) {
      hostLimits.set(host, pLimit(settings.perHostConcurrency));
    }
    return hostLimits.get(host);
  };

  const reserveHostStart = async (host) => {
    const previous = hostStartSlot.get(host) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    hostStartSlot.set(host, previous.then(() => current));

    await previous;
    const now = Date.now();
    const next = hostNextAt.get(host) ?? now;
    const waitMs = Math.max(0, next - now);
    if (waitMs > 0) await sleep(waitMs);
    hostNextAt.set(host, Date.now() + settings.minDelayPerHostMs);
    release();
  };

  const runRequest = async (targetUrl, options = {}) => {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname;
    const method = options.method ?? 'GET';

    return globalLimit(() =>
      getHostLimit(host)(async () => {
        await reserveHostStart(host);

        let attempt = 0;
        let lastError = null;

        while (attempt <= settings.retries) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);

          try {
            const response = await fetch(targetUrl, {
              method,
              redirect: 'follow',
              signal: controller.signal,
              headers: options.headers,
            });
            clearTimeout(timeout);

            if (isRetriableStatus(response.status) && attempt < settings.retries) {
              attempt += 1;
              const backoff = 400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 140);
              await sleep(backoff);
              continue;
            }

            const headers = normalizeHeaders(response.headers);
            return {
              ok: response.ok,
              status: response.status,
              url: response.url,
              headers,
              response,
            };
          } catch (error) {
            clearTimeout(timeout);
            lastError = error;
            if (attempt >= settings.retries) break;
            attempt += 1;
            const backoff = 400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 140);
            await sleep(backoff);
          }
        }

        throw lastError ?? new Error(`Falha de rede ao acessar ${targetUrl}`);
      })
    );
  };

  const head = async (targetUrl) => runRequest(targetUrl, { method: 'HEAD' });

  const getText = async (targetUrl) => {
    const result = await runRequest(targetUrl, { method: 'GET' });
    const text = await result.response.text();
    return {
      ...result,
      text,
    };
  };

  const getBuffer = async (targetUrl) => {
    const result = await runRequest(targetUrl, { method: 'GET' });
    const arrayBuffer = await result.response.arrayBuffer();
    return {
      ...result,
      buffer: Buffer.from(arrayBuffer),
    };
  };

  return {
    head,
    getText,
    getBuffer,
  };
};
