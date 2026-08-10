import { createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ITERATIONS = 150_000;
const outputArgument = process.argv.find((argument) => argument.startsWith("--out="));
const outputPath = resolve(outputArgument?.slice("--out=".length) || ".auth-secrets.json");

function readTerminalLine(prompt, { masked = false } = {}) {
  if (!process.stdin.isTTY) throw new Error("请在交互式终端运行此命令");
  return new Promise((resolveLine, reject) => {
    let value = "";
    let settled = false;
    const rawMode = Boolean(masked && process.stdin.setRawMode);
    process.stdout.write(prompt);
    process.stdin.setEncoding("utf8");
    if (rawMode) process.stdin.setRawMode(true);
    process.stdin.resume();

    const cleanup = () => {
      process.stdin.off("data", onData);
      if (rawMode) process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (masked) process.stdout.write("\n");
      resolveLine(value.trim());
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("已取消"));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value) {
            value = value.slice(0, -1);
            if (masked) process.stdout.write("\b \b");
          }
          continue;
        }
        value += character;
        if (masked) process.stdout.write("*");
      }
    };
    process.stdin.on("data", onData);
  });
}

const username = await readTerminalLine("登录账号：");
const password = await readTerminalLine("登录密码：", { masked: true });
if (!username || username.length > 80 || !password || password.length > 128) {
  throw new Error("账号或密码长度不符合要求");
}

const salt = randomBytes(16);
const passwordKey = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256");
const credential = JSON.stringify({
  iterations: ITERATIONS,
  salt: salt.toString("base64url"),
  signature: createHmac("sha256", passwordKey)
    .update(`paiban-login-v1:${username}`)
    .digest("base64url"),
});
writeFileSync(outputPath, JSON.stringify({
  AUTH_CREDENTIAL: credential,
  AUTH_SESSION_SECRET: randomBytes(32).toString("base64url"),
}), { encoding: "utf8", mode: 0o600, flag: "wx" });
try { chmodSync(outputPath, 0o600); } catch {}

console.log(`已生成：${outputPath}`);
console.log("该文件只用于 Wrangler secrets，使用后立即删除，禁止提交 Git。");
