const form = document.querySelector("#login-form");
const username = document.querySelector("#username");
const password = document.querySelector("#password");
const submit = document.querySelector("#login-submit");
const error = document.querySelector("#login-error");

function safeNextPath() {
  const next = new URLSearchParams(location.search).get("next") || "/";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.textContent = "";
  submit.disabled = true;
  submit.textContent = "正在登录…";
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.value.trim(), password: password.value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.msg || `登录失败（${response.status}）`);
    location.replace(safeNextPath());
  } catch (loginError) {
    password.value = "";
    password.focus();
    error.textContent = loginError.message || "登录失败，请重试";
  } finally {
    submit.disabled = false;
    submit.textContent = "登录并进入";
  }
});
