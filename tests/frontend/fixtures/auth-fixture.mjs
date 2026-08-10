import { createHmac, pbkdf2Sync } from "node:crypto";

export const TEST_AUTH_USERNAME = "test-user";
export const TEST_AUTH_PASSWORD = "test-password";
export const TEST_AUTH_SESSION_SECRET = Buffer.alloc(32, 7).toString("base64url");

const salt = Buffer.alloc(16, 11);
const iterations = 50_000;
const passwordKey = pbkdf2Sync(TEST_AUTH_PASSWORD, salt, iterations, 32, "sha256");
const credentialSignature = createHmac("sha256", passwordKey)
  .update(`paiban-login-v1:${TEST_AUTH_USERNAME}`)
  .digest("base64url");

export const TEST_AUTH_CREDENTIAL = JSON.stringify({
  iterations,
  salt: salt.toString("base64url"),
  signature: credentialSignature,
});

const sessionPayload = Buffer.from(JSON.stringify({
  v: 1,
  username: TEST_AUTH_USERNAME,
  exp: 1_893_456_000,
})).toString("base64url");
const sessionSignature = createHmac("sha256", Buffer.from(TEST_AUTH_SESSION_SECRET, "base64url"))
  .update(sessionPayload)
  .digest("base64url");

export const TEST_AUTH_STORAGE_STATE = {
  cookies: [{
    name: "paiban_session",
    value: `${sessionPayload}.${sessionSignature}`,
    domain: "127.0.0.1",
    path: "/",
    expires: 1_893_456_000,
    httpOnly: true,
    secure: false,
    sameSite: "Strict",
  }],
  origins: [],
};
