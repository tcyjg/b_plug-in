const STORAGE_KEY = "api_base_url";
const DEFAULT_API_BASE = "http://127.0.0.1:8000";

const CONFIG_FIELDS = {
  DASHSCOPE_API_KEY: "dashscope-api-key",
  BILIBILI_SESSDATA: "bilibili-sessdata",
  IMGBB_API_KEY: "imgbb-api-key",
  GITHUB_TOKEN: "github-token",
  GITHUB_REPO: "github-repo",
  GITHUB_PATH: "github-path",
  GITHUB_BRANCH: "github-branch",
  SUMMARY_CACHE_TTL_MINUTES: "cache-ttl",
};

function status(message, isError = false) {
  const el = document.getElementById("status");
  el.textContent = message;
  el.classList.toggle("is-error", isError);
}

async function getApiBase() {
  const result = await chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_API_BASE });
  return String(result[STORAGE_KEY] || DEFAULT_API_BASE);
}

async function loadBaseUrl() {
  document.getElementById("api-base-url").value = await getApiBase();
}

async function saveBaseUrl() {
  const value = String(document.getElementById("api-base-url").value || "").trim() || DEFAULT_API_BASE;
  await chrome.storage.sync.set({ [STORAGE_KEY]: value });
  status("后端地址已保存。刷新 B 站页面后生效。");
  return value;
}

async function resetBaseUrl() {
  await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_API_BASE });
  await loadBaseUrl();
  status("已恢复默认后端地址。");
}

async function testConnection() {
  const apiBase = String(document.getElementById("api-base-url").value || "").trim() || DEFAULT_API_BASE;
  status("正在测试连接...");
  try {
    const resp = await fetch(`${apiBase}/health`);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    status(`连接成功。服务状态: ${data.status}`);
  } catch (error) {
    status(`连接失败: ${error.message || "未知错误"}`, true);
  }
}

function setFieldValues(values) {
  for (const [key, id] of Object.entries(CONFIG_FIELDS)) {
    const input = document.getElementById(id);
    if (!input) continue;
    const value = values[key];
    if (value == null) continue;
    if (value === "***") {
      input.value = "";
      input.placeholder = "已配置，留空则不修改";
    } else {
      input.value = String(value);
    }
  }
}

async function loadRemoteConfig() {
  const apiBase = await getApiBase();
  status("正在读取后端配置...");
  try {
    const resp = await fetch(`${apiBase}/config`);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const data = await resp.json();
    setFieldValues(data.values || {});
    status("已从后端读取配置。敏感字段不会回显明文。");
  } catch (error) {
    status(`读取配置失败: ${error.message || "未知错误"}`, true);
  }
}

function collectConfigValues() {
  const values = {};
  for (const [key, id] of Object.entries(CONFIG_FIELDS)) {
    const input = document.getElementById(id);
    if (!input) continue;
    const raw = String(input.value || "").trim();
    const isSecret = key.includes("KEY") || key.includes("TOKEN") || key.includes("SESSDATA");
    if (isSecret) {
      if (raw) values[key] = raw;
      continue;
    }
    if (raw) {
      values[key] = raw;
    }
  }
  return values;
}

async function saveRemoteConfig() {
  const apiBase = await getApiBase();
  const values = collectConfigValues();
  if (Object.keys(values).length === 0) {
    status("没有可保存的配置。敏感字段留空时不会修改后端。");
    return;
  }

  status("正在保存到后端...");
  try {
    const resp = await fetch(`${apiBase}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: `HTTP ${resp.status}` }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }
    status("后端配置已保存到 SQLite。");
    await loadRemoteConfig();
  } catch (error) {
    status(`保存配置失败: ${error.message || "未知错误"}`, true);
  }
}

document.getElementById("test-btn").addEventListener("click", () => {
  void testConnection();
});

document.getElementById("save-base-btn").addEventListener("click", () => {
  void saveBaseUrl();
});

document.getElementById("reset-btn").addEventListener("click", () => {
  void resetBaseUrl();
});

document.getElementById("load-config-btn").addEventListener("click", () => {
  void loadRemoteConfig();
});

document.getElementById("save-config-btn").addEventListener("click", () => {
  void saveRemoteConfig();
});

void loadBaseUrl();
