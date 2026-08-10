const encoder = new TextEncoder();

const COOKIE_NAME = "paiban_session";
const SESSION_SECONDS = 12 * 60 * 60;
const FAILURE_WINDOW_SECONDS = 15 * 60;
const BLOCK_SECONDS = 15 * 60;
const MAX_FAILURES = 5;
const MAX_LOGIN_BODY_BYTES = 4096;
const CREDENTIAL_CONTEXT = "paiban-login-v1:";

function toBase64Url(bytes) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function parseCookies(request) {
  const cookies = new Map();
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

function noStoreHeaders(headers = {}) {
  return {
    "Cache-Control": "private, no-store",
    Pragma: "no-cache",
    ...headers,
  };
}

function authJson(body, init = {}) {
  return Response.json(body, {
    ...init,
    headers: noStoreHeaders(init.headers),
  });
}

function parseCredential(value) {
  try {
    const parsed = JSON.parse(value || "");
    const iterations = Number(parsed.iterations);
    if (!parsed.salt || !parsed.signature || !Number.isInteger(iterations) || iterations < 50_000 || iterations > 1_000_000) return null;
    return { salt: parsed.salt, signature: parsed.signature, iterations };
  } catch {
    return null;
  }
}

async function passwordKey(password, credential) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64Url(credential.salt),
      iterations: credential.iterations,
      hash: "SHA-256",
    },
    material,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    ["verify"],
  );
}

async function verifyCredential(username, password, serializedCredential) {
  const credential = parseCredential(serializedCredential);
  if (!credential || typeof username !== "string" || typeof password !== "string") return false;
  if (!username || username.length > 80 || !password || password.length > 128) return false;
  try {
    const key = await passwordKey(password, credential);
    return crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(credential.signature),
      encoder.encode(`${CREDENTIAL_CONTEXT}${username}`),
    );
  } catch {
    return false;
  }
}

async function sessionKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    fromBase64Url(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function createSession(username, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const payload = toBase64Url(encoder.encode(JSON.stringify({
    v: 1,
    username,
    exp: nowSeconds + SESSION_SECONDS,
  })));
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(secret), encoder.encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

async function verifySession(value, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!value || !secret) return null;
  const [payload, encodedSignature, extra] = value.split(".");
  if (!payload || !encodedSignature || extra !== undefined) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await sessionKey(secret),
      fromBase64Url(encodedSignature),
      encoder.encode(payload),
    );
    if (!valid) return null;
    const data = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    if (data.v !== 1 || typeof data.username !== "string" || !data.username) return null;
    if (!Number.isInteger(data.exp) || data.exp <= nowSeconds) return null;
    return data;
  } catch {
    return null;
  }
}

async function attemptKey(request, secret) {
  const address = request.headers.get("CF-Connecting-IP") || "unknown";
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(secret), encoder.encode(`login-attempt:${address}`));
  return toBase64Url(new Uint8Array(signature).slice(0, 18));
}

async function currentBlock(db, key, nowSeconds) {
  const row = await db.prepare(
    "SELECT blocked_until FROM auth_login_attempts WHERE attempt_key = ?",
  ).bind(key).first();
  const blockedUntil = Number(row?.blocked_until || 0);
  return blockedUntil > nowSeconds ? blockedUntil - nowSeconds : 0;
}

async function recordFailure(db, key, nowSeconds) {
  const row = await db.prepare(
    "SELECT failures, first_failed_at FROM auth_login_attempts WHERE attempt_key = ?",
  ).bind(key).first();
  const withinWindow = row && Number(row.first_failed_at) > nowSeconds - FAILURE_WINDOW_SECONDS;
  const failures = withinWindow ? Number(row.failures || 0) + 1 : 1;
  const firstFailedAt = withinWindow ? Number(row.first_failed_at) : nowSeconds;
  const blockedUntil = failures >= MAX_FAILURES ? nowSeconds + BLOCK_SECONDS : 0;
  await db.prepare(`
    INSERT INTO auth_login_attempts (attempt_key, failures, first_failed_at, blocked_until, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(attempt_key) DO UPDATE SET
      failures = excluded.failures,
      first_failed_at = excluded.first_failed_at,
      blocked_until = excluded.blocked_until,
      updated_at = excluded.updated_at
  `).bind(key, failures, firstFailedAt, blockedUntil, new Date(nowSeconds * 1000).toISOString()).run();
  return blockedUntil > nowSeconds ? blockedUntil - nowSeconds : 0;
}

async function clearFailures(db, key) {
  await db.prepare("DELETE FROM auth_login_attempts WHERE attempt_key = ?").bind(key).run();
}

export function authEnabled(env) {
  return env.AUTH_MODE === "enabled";
}

export function authConfigured(env) {
  return Boolean(parseCredential(env.AUTH_CREDENTIAL) && env.AUTH_SESSION_SECRET);
}

export function sameOrigin(request, url = new URL(request.url)) {
  return request.headers.get("Origin") === url.origin;
}

export async function authenticatedSession(request, env) {
  if (!authEnabled(env) || !authConfigured(env)) return null;
  return verifySession(parseCookies(request).get(COOKIE_NAME), env.AUTH_SESSION_SECRET);
}

export function redirectToLogin(url) {
  const next = `${url.pathname}${url.search}`;
  return new Response(null, {
    status: 302,
    headers: noStoreHeaders({
      Location: `/login?next=${encodeURIComponent(next)}`,
    }),
  });
}

export function unauthorizedApi() {
  return authJson({ success: false, msg: "请先登录" }, { status: 401 });
}

export function authUnavailable() {
  return authJson({ success: false, msg: "登录服务尚未配置" }, { status: 503 });
}

export async function handleAuthRoute(request, env, url) {
  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    const session = await authenticatedSession(request, env);
    return session
      ? authJson({ authenticated: true, username: session.username })
      : authJson({ authenticated: false }, { status: 401 });
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    if (!sameOrigin(request, url)) return authJson({ success: false, msg: "请求来源无效" }, { status: 403 });
    return authJson({ success: true }, {
      headers: {
        "Set-Cookie": `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      },
    });
  }

  if (url.pathname !== "/api/auth/login") return null;
  if (request.method !== "POST") return authJson({ success: false, msg: "请求方法不支持" }, { status: 405 });
  if (!authConfigured(env)) return authUnavailable();
  if (!sameOrigin(request, url)) return authJson({ success: false, msg: "请求来源无效" }, { status: 403 });

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_LOGIN_BODY_BYTES) return authJson({ success: false, msg: "登录请求过大" }, { status: 413 });
  const rawBody = await request.text();
  if (rawBody.length > MAX_LOGIN_BODY_BYTES) return authJson({ success: false, msg: "登录请求过大" }, { status: 413 });
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return authJson({ success: false, msg: "登录请求格式错误" }, { status: 400 });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const key = await attemptKey(request, env.AUTH_SESSION_SECRET);
  const retryAfter = await currentBlock(env.DB, key, nowSeconds);
  if (retryAfter) {
    return authJson({ success: false, msg: "登录尝试过多，请稍后再试" }, {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    });
  }

  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!await verifyCredential(username, password, env.AUTH_CREDENTIAL)) {
    const blockedFor = await recordFailure(env.DB, key, nowSeconds);
    return authJson({ success: false, msg: blockedFor ? "登录尝试过多，请稍后再试" : "账号或密码错误" }, {
      status: blockedFor ? 429 : 401,
      headers: blockedFor ? { "Retry-After": String(blockedFor) } : undefined,
    });
  }

  await clearFailures(env.DB, key);
  const session = await createSession(username, env.AUTH_SESSION_SECRET, nowSeconds);
  return authJson({ success: true }, {
    headers: {
      "Set-Cookie": `${COOKIE_NAME}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`,
    },
  });
}

export function privateAssetResponse(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(noStoreHeaders())) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
