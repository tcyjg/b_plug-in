const DEFAULT_API_BASE = "http://127.0.0.1:8000";
const API_BASE_STORAGE_KEY = "api_base_url";

const INLINE_SUMMARY_ID = "bili-inline-summary";
const INLINE_SUMMARY_BODY_ID = "bili-inline-summary-body";
const AUTO_PUSH_KEY = "bili_summary_auto_push";
const INLINE_COLLAPSED_KEY = "bili_summary_inline_collapsed";

let lastVideoKey = null;
let cachedReport = null;
let loading = false;
let ensureInlineTimer = null;

function getApiBase() {
  return new Promise((resolve) => {
    if (!chrome?.storage?.sync) {
      resolve(DEFAULT_API_BASE);
      return;
    }
    chrome.storage.sync.get({ [API_BASE_STORAGE_KEY]: DEFAULT_API_BASE }, (result) => {
      resolve(String(result?.[API_BASE_STORAGE_KEY] || DEFAULT_API_BASE));
    });
  });
}

async function apiFetch(path, init) {
  const apiBase = await getApiBase();
  return fetch(`${apiBase}${path}`, init);
}

function injectUI() {
  ensureInlineSummaryShell();
  syncSettingsUI();
}

function getAutoPushEnabled() {
  const raw = localStorage.getItem(AUTO_PUSH_KEY);
  return raw !== "0";
}

function setAutoPushEnabled(enabled) {
  localStorage.setItem(AUTO_PUSH_KEY, enabled ? "1" : "0");
}

function getInlineCollapsed() {
  return localStorage.getItem(INLINE_COLLAPSED_KEY) === "1";
}

function setInlineCollapsed(collapsed) {
  localStorage.setItem(INLINE_COLLAPSED_KEY, collapsed ? "1" : "0");
  applyInlineCollapsedState();
}

function toggleInlineCollapsed() {
  setInlineCollapsed(!getInlineCollapsed());
}

function applyInlineCollapsedState() {
  const shell = document.getElementById(INLINE_SUMMARY_ID);
  if (!shell) return;

  const collapsed = getInlineCollapsed();
  shell.classList.toggle("is-collapsed", collapsed);
  const toggle = shell.querySelector("#bs-inline-collapse-btn");
  if (toggle) {
    toggle.textContent = collapsed ? "展开总结" : "收起总结";
  }
}

function syncSettingsUI() {
  const autoPush = getAutoPushEnabled();
  const inlineCheckbox = document.getElementById("bs-inline-auto-push-checkbox");
  if (inlineCheckbox) inlineCheckbox.checked = autoPush;
  applyInlineCollapsedState();
}

async function onParse(forceRefresh) {
  if (loading) return;

  const bvid = getBvid();
  const page = getCurrentPage();
  if (!bvid) {
    renderInlineStatus("未检测到视频 ID，请进入具体视频页后再解析。", true);
    return;
  }

  const videoKey = `${bvid}:p${page}`;
  if (!forceRefresh && videoKey === lastVideoKey && cachedReport) {
    renderInlineReport(cachedReport);
    await handleMarkdownReport(cachedReport, false);
    return;
  }

  loading = true;
  renderInlineStatus("正在读取视频内容并生成总结...");

  try {
    const sessdata = getCookie("SESSDATA") || "";
    const resp = await apiFetch("/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bvid, page, sessdata, force_refresh: forceRefresh }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: "请求失败" }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }

    const reportData = await resp.json();
    lastVideoKey = videoKey;
    cachedReport = reportData;
    renderInlineReport(reportData);
    await handleMarkdownReport(reportData, forceRefresh);
  } catch (error) {
    renderInlineStatus(`总结生成失败：${escapeHTML(error.message || "未知错误")}`, true);
  } finally {
    loading = false;
  }
}

async function handleMarkdownReport(reportData, forceRefresh) {
  const shell = ensureInlineSummaryShell();
  if (!shell) return;
  const note = shell.querySelector("#bs-inline-push-note");
  if (!note) return;

  try {
    note.textContent = "正在整理 Markdown 报告...";
    const bvid = reportData.bvid || getBvid();
    const page = reportData.page || getCurrentPage();

    if (!getAutoPushEnabled()) {
      note.textContent = "已生成内容总结。当前设置为不自动推送 GitHub，也不会上传文档和截图。";
      return;
    }

    const sessdata = getCookie("SESSDATA") || "";

    const keyframes = (reportData.sections || []).filter((section) => section.is_keyframe);
    const frameMap = {};
    if (keyframes.length > 0) {
      const timestamps = keyframes.map((section) => Math.floor(Number(section.timestamp) || 0));
      const framesResp = await apiFetch("/capture-frames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bvid, page, sessdata, timestamps }),
      });
      if (framesResp.ok) {
        const framesData = await framesResp.json();
        Object.assign(frameMap, framesData.frames || {});
      }
    }

    note.textContent = "正在推送到 GitHub...";
    const filename = `${sanitizeFilename(reportData.title || `${bvid}-P${page}`)}.md`;
    const content = buildMarkdown(reportData, frameMap);
    const pushResp = await apiFetch("/push-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content }),
    });

    if (!pushResp.ok) {
      const err = await pushResp.json().catch(() => ({ detail: "推送失败" }));
      throw new Error(err.detail || `HTTP ${pushResp.status}`);
    }

    const result = await pushResp.json();
    note.innerHTML = `已自动推送到 GitHub：<a href="${escapeHTML(result.url)}" target="_blank" rel="noreferrer">${escapeHTML(result.url)}</a>`;
  } catch (error) {
    note.textContent = `报告处理失败：${error.message || "未知错误"}`;
  }
}

function buildMarkdown(reportData, frameMap) {
  const lines = [];
  const title = reportData.title || "视频报告";
  const bvid = reportData.bvid || "";
  const page = reportData.page || 1;

  lines.push(`# ${title}`);
  lines.push("");
  lines.push(`> BV号: ${bvid} | 分P: P${page} | 生成时间: ${new Date().toLocaleString("zh-CN")}`);
  lines.push("");
  lines.push(buildBilibiliIframe(bvid, page));
  lines.push("");
  lines.push("## 视频内容概览");
  lines.push("");
  lines.push(reportData.overview || "暂无概览");
  lines.push("");
  lines.push("## 视频内容分段");
  lines.push("");

  for (const section of reportData.sections || []) {
    const time = formatTime(section.timestamp);
    lines.push(`### [${time}] ${section.title || "未命名片段"}`);
    lines.push("");
    lines.push(section.content || "");
    lines.push("");

    const frame = frameMap[String(section.timestamp)] || frameMap[section.timestamp];
    if (frame) {
      lines.push(`![${section.title || "关键画面"}](${frame})`);
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("*由 B站视频速览工具自动生成*");
  return lines.join("\n");
}

function buildBilibiliIframe(bvid, page = 1) {
  return [
    "<iframe",
    `  src="https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&page=${encodeURIComponent(page)}"`,
    '  width="800"',
    '  height="450"',
    '  scrolling="no"',
    '  border="0"',
    '  frameborder="no"',
    '  framespacing="0"',
    '  allowfullscreen="true">',
    "</iframe>",
  ].join("\n");
}

function ensureInlineSummaryShell() {
  const anchor = findInlineAnchor();
  if (!anchor) return null;

  let shell = document.getElementById(INLINE_SUMMARY_ID);
  if (shell && shell.parentElement === anchor.parentElement && shell.nextElementSibling === anchor) {
    syncSettingsUI();
    return shell;
  }

  if (shell) shell.remove();

  shell = document.createElement("section");
  shell.id = INLINE_SUMMARY_ID;
  shell.className = "bs-inline-summary";
  shell.innerHTML = `
    <div class="bs-inline-header">
      <div>
        <div class="bs-inline-kicker">AI VIDEO SUMMARY</div>
        <h2 class="bs-inline-title">视频内容总结</h2>
      </div>
      <button class="bs-inline-toggle" type="button" id="bs-inline-collapse-btn">收起总结</button>
    </div>
    <div class="bs-inline-body" id="${INLINE_SUMMARY_BODY_ID}">
      <div class="bs-inline-settings">
        <label class="bs-setting-check">
          <input type="checkbox" id="bs-inline-auto-push-checkbox">
          <span>自动推送到 GitHub</span>
        </label>
      </div>
      <div class="bs-inline-status-content" id="bs-inline-status-content">
        <button class="bs-inline-primary" type="button" id="bs-inline-parse-btn">点击总结视频</button>
        <div class="bs-inline-hint">总结会直接展示在这里，重点是帮助读者快速了解视频内容。</div>
      </div>
      <div class="bs-inline-push-note" id="bs-inline-push-note"></div>
    </div>
  `;

  anchor.parentElement.insertBefore(shell, anchor);
  shell.querySelector("#bs-inline-parse-btn")?.addEventListener("click", () => onParse(false));
  shell.querySelector("#bs-inline-collapse-btn")?.addEventListener("click", () => toggleInlineCollapsed());
  shell.querySelector("#bs-inline-auto-push-checkbox")?.addEventListener("change", (event) => {
    setAutoPushEnabled(Boolean(event.target.checked));
    syncSettingsUI();
  });

  syncSettingsUI();
  return shell;
}

function findInlineAnchor() {
  const selectors = [
    "#commentapp",
    ".comment-container",
    ".bili-comment-container",
    ".reply-list",
    ".comment-wrap",
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.parentElement) return element;
  }

  const fallback = document.querySelector("#viewbox_report, #arc_toolbar_report, .video-info-container");
  return fallback && fallback.parentElement ? fallback : null;
}

function scheduleEnsureInlineSummary() {
  if (ensureInlineTimer) return;
  ensureInlineTimer = window.setTimeout(() => {
    ensureInlineTimer = null;
    if (!document.getElementById(INLINE_SUMMARY_ID)) {
      ensureInlineSummaryShell();
    }
  }, 250);
}

function renderInlineStatus(message, isError = false) {
  const shell = ensureInlineSummaryShell();
  if (!shell) return;

  const content = shell.querySelector("#bs-inline-status-content");
  if (!content) return;

  content.className = isError ? "bs-inline-status-content is-error" : "bs-inline-status-content";
  content.innerHTML = message;
}

function renderInlineReport(data) {
  const shell = ensureInlineSummaryShell();
  if (!shell) return;

  const content = shell.querySelector("#bs-inline-status-content");
  if (!content) return;

  const sections = (data.sections || [])
    .slice(0, 8)
    .map(
      (section) => `
        <button class="bs-inline-section-card" type="button" data-seconds="${Number(section.timestamp) || 0}">
          <div class="bs-inline-section-meta">
            <span class="bs-inline-time">${formatTime(section.timestamp)}</span>
            <span class="bs-inline-section-name">${escapeHTML(section.title || "未命名片段")}</span>
          </div>
          <div class="bs-inline-section-text">${escapeHTML(section.content || "")}</div>
        </button>
      `
    )
    .join("");

  content.className = "bs-inline-status-content is-ready";
  content.innerHTML = `
    <div class="bs-inline-meta">
      <span class="bs-inline-badge ${data.cached ? "is-cache" : ""}">${data.cached ? "缓存结果" : "最新生成"}</span>
      <span class="bs-inline-bvid">${escapeHTML(data.bvid || "")} · P${escapeHTML(String(data.page || 1))}</span>
      <button class="bs-inline-secondary" type="button" id="bs-inline-refresh-btn">重新生成</button>
    </div>
    <h3 class="bs-inline-video-title">${escapeHTML(data.title || "")}</h3>
    <div class="bs-inline-overview-title">视频概览</div>
    <div class="bs-inline-overview">${escapeHTML(data.overview || "")}</div>
    <div class="bs-inline-overview-title">视频中的内容</div>
    <div class="bs-inline-sections">${sections || '<div class="bs-inline-empty">暂无分段内容</div>'}</div>
  `;

  content.querySelector("#bs-inline-refresh-btn")?.addEventListener("click", () => onParse(true));
  content.querySelectorAll(".bs-inline-section-card").forEach((button) => {
    button.addEventListener("click", () => {
      const sec = parseInt(button.dataset.seconds, 10);
      const video = document.querySelector("video");
      if (video && !Number.isNaN(sec)) {
        video.currentTime = sec;
        video.play();
      }
    });
  });
}

function getBvid() {
  const match = location.pathname.match(/\/(BV\w+)/i);
  return match ? match[1] : null;
}

function getCurrentPage() {
  const url = new URL(window.location.href);
  const p = Number(url.searchParams.get("p") || "1");
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 1;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : "";
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function sanitizeFilename(name) {
  return String(name || "report").replace(/[\\/:*?"<>|]/g, "_").substring(0, 80);
}

function escapeHTML(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resetPageState() {
  lastVideoKey = null;
  cachedReport = null;
  if (ensureInlineTimer) {
    clearTimeout(ensureInlineTimer);
    ensureInlineTimer = null;
  }
  document.getElementById(INLINE_SUMMARY_ID)?.remove();
  setTimeout(injectUI, 500);
}

let lastRoute = `${location.pathname}${location.search}`;
injectUI();

const observer = new MutationObserver(() => {
  const currentRoute = `${location.pathname}${location.search}`;
  if (currentRoute !== lastRoute) {
    lastRoute = currentRoute;
    resetPageState();
    return;
  }

  if (!document.getElementById(INLINE_SUMMARY_ID)) {
    scheduleEnsureInlineSummary();
  }
});

observer.observe(document.body, { childList: true, subtree: true });
