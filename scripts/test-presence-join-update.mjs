#!/usr/bin/env node

const baseUrl = process.env.PRESENCE_BASE_URL || 'http://localhost:3000';
const userAgent =
  process.env.PRESENCE_USER_AGENT ||
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

const now = Date.now();

const joinPayload = {
  clientId: 'presence-script-client',
  isMobile: true,
  userAgent,
};

const postJson = async (path, payload) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US',
      'Content-Type': 'application/json',
      Origin: baseUrl,
      Referer: `${baseUrl}/`,
      'User-Agent': userAgent,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return {
    status: response.status,
    ok: response.ok,
    text,
    json,
  };
};

const main = async () => {
  console.log('[presence] baseUrl:', baseUrl);

  const join = await postJson('/api/presence/join', joinPayload);
  console.log('[presence] join status:', join.status);
  console.log('[presence] join body:', join.text);

  if (!join.ok || !join.json?.sessionId) {
    process.exitCode = 1;
    return;
  }

  const updatePayload = {
    sessionId: join.json.sessionId,
    dayIndex: 0,
    position: { x: 50, y: 30, z: 50 },
    clientTimestamp: now,
  };

  const update = await postJson('/api/presence/update', updatePayload);
  console.log('[presence] update status:', update.status);
  console.log('[presence] update body:', update.text);

  if (!update.ok) {
    process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error(
    '[presence] script failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
