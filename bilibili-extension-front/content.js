const API_BASE = "http://127.0.0.1:8000";

const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 720;
const PANEL_DEFAULT_WIDTH = 380;

const INLINE_SUMMARY_ID = "bili-inline-summary";
const INLINE_SUMMARY_BODY_ID = "bili-inline-summary-body";
const AUTO_PUSH_KEY = "bili_summary_auto_push";
const INLINE_COLLAPSED_KEY = "bili_summary_inline_collapsed";

let lastVideoKey = null;
let cachedResult = null;
let loading = false;
let panelWidth = PANEL_DEFAULT_WIDTH;
let ensureInlineTimer = null;

function injectUI() {
  if (document.getElementById("bili-summarizer-panel")) return;

  const panel = document.createElement("div");
  panel.id = "bili-summarizer-panel";
  panel.style.width = `${panelWidth}px`;
  panel.innerHTML = `
    <div class="bs-resizer" id="bs-resizer" title="Resize sidebar"></div>
    <div class="bs-header">
      <span>视频总结</span>
      <button class="bs-close" id="bs-close-btn">×</button>
    </div>
    <div class="bs-controls">
      <button id="bs-parse-btn" class="bs-parse-btn">总结视频</button>
      <button id="bs-refresh-btn" class="bs-refresh-btn">重新生成</button>
    </div>
    <div class="bs-settings-row">
      <label class="bs-setting-check">
        <input type="checkbox" id="bs-auto-push-checkbox">
        <span>自动推送到 GitHub</span>
      </label>
    </div>
    <div class="bs-body" id="bs-body"></div>
  `;
  document.body.appendChild(panel);

  document.getElementById("bs-close-btn").addEventListener("click", () => {
    panel.classList.remove("open");
  });
  document.getElementById("bs-parse-btn").addEventListener("click", () => onParse(false));
  document.getElementById("bs-refresh-btn").addEventListener("click", () => onParse(true));
  document.getElementById("bs-auto-push-checkbox").addEventListener("change", (event) => {
    setAutoPushEnabled(Boolean(event.target.checked));
    syncSettingsUI();
  });

  initResize(panel, document.getElementById("bs-resizer"));
  renderWelcome();
  ensureInlineSummaryShell();
  syncSettingsUI();
}

function onOpenPanel() {
  const panel = document.getElementById("bili-summarizer-panel");
  if (panel) panel.classList.add("open");
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
  document.getElementById("bs-auto-push-checkbox")?.setAttribute("checked", autoPush ? "checked" : "");
  const sidebarCheckbox = document.getElementById("bs-auto-push-checkbox");
  if (sidebarCheckbox) sidebarCheckbox.checked = autoPush;

  const inlineCheckbox = document.getElementById("bs-inline-auto-push-checkbox");
  if (inlineCheckbox) inlineCheckbox.checked = autoPush;

  applyInlineCollapsedState();
}

async function onParse(forceRefresh) {
  if (loading) return;

  const bvid = getBvid();
  const page = getCurrentPage();
  if (!bvid) {
    renderError("未检测到视频 ID，请进入具体视频页后再解析。");
    return;
  }

  onOpenPanel();

  const videoKey = `${bvid}:p${page}`;
  if (!forceRefresh && videoKey === lastVideoKey && cachedResult) {
    renderResult(cachedResult);
    renderInlineSummary(cachedResult);
    await generateMDReport({ bvid, page, forceRefresh: false });
    return;
  }

  const body = document.getElementById("bs-body");
  loading = true;
  if (body) {
    body.innerHTML = `
      <div class="bs-loading">
        <div class="bs-spinner"></div>
        <span>正在解析视频内容...</span>
        <span style="font-size:11px;color:#9ca3af">通常需要 5 到 15 秒</span>
      </div>
    `;
  }
  renderInlineStatus("正在生成视频总结...");

  try {
    const sessdata = getCookie("SESSDATA") || "";
    const resp = await fetch(`${API_BASE}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bvid, page, sessdata, force_refresh: forceRefresh }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: "请求失败" }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    lastVideoKey = videoKey;
    cachedResult = data;
    renderResult(data);
    renderInlineSummary(data);
    await generateMDReport({ bvid, page, forceRefresh });
  } catch (error) {
    const message = escapeHTML(error.message || "未知错误");
    renderError(`${message}<br><br><span style="font-size:11px;color:#6b7280">请确认后端服务已启动：uvicorn main:app --reload --port 8000</span>`);
    renderInlineStatus(`总结生成失败：${message}`, true);
  } finally {
    loading = false;
  }
}

function renderWelcome() {
  const body = document.getElementById("bs-body");
  if (!body) return;

  body.innerHTML = `
    <div class="bs-empty">
      <div class="bs-empty-title">等待开始</div>
      <div class="bs-empty-desc">从评论区上方点击“总结视频”后，这里会显示完整摘要、章节和流程图。</div>
      <div class="bs-empty-desc">“自动推送到 GitHub” 可以在前端直接控制，并保存在浏览器本地。</div>
    </div>
  `;
}

async function generateMDReport(options = {}) {
  const bvid = options.bvid || getBvid();
  const page = options.page || getCurrentPage();
  if (!bvid) return;

  const body = document.getElementById("bs-body");
  if (!body) return;

  const old = document.getElementById("bs-md-progress");
  if (old) old.remove();

  const progressEl = document.createElement("div");
  progressEl.id = "bs-md-progress";
  progressEl.className = "bs-md-progress";
  body.appendChild(progressEl);

  try {
    const sessdata = getCookie("SESSDATA") || "";

    progressEl.innerHTML = `
      <div class="bs-loading">
        <div class="bs-spinner"></div>
        <span>正在生成 Markdown 报告...</span>
      </div>
    `;

    const reportResp = await fetch(`${API_BASE}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bvid, page, sessdata, force_refresh: !!options.forceRefresh }),
    });

    if (!reportResp.ok) {
      const err = await reportResp.json().catch(() => ({ detail: "请求失败" }));
      throw new Error(err.detail || `HTTP ${reportResp.status}`);
    }

    const reportData = await reportResp.json();
    const keyframes = (reportData.sections || []).filter((section) => section.is_keyframe);
    const frameMap = {};

    if (keyframes.length > 0) {
      progressEl.innerHTML = `
        <div class="bs-loading">
          <div class="bs-spinner"></div>
          <span>正在抓取关键画面...</span>
          <span style="font-size:11px;color:#9ca3af">共 ${keyframes.length} 个时间点</span>
        </div>
      `;

      const timestamps = keyframes.map((section) => Math.floor(Number(section.timestamp) || 0));
      const framesResp = await fetch(`${API_BASE}/capture-frames`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bvid, page, sessdata, timestamps }),
      });

      if (framesResp.ok) {
        const framesData = await framesResp.json();
        Object.assign(frameMap, framesData.frames || {});
      }
    }

    const filename = `${sanitizeFilename(reportData.title || `${bvid}-P${page}`)}.md`;
    const content = buildMarkdown(reportData, frameMap);

    if (!getAutoPushEnabled()) {
      progressEl.innerHTML = `
        <div class="bs-md-success bs-md-note">
          已生成 Markdown，但当前设置为不自动推送 GitHub。
        </div>
      `;
      return;
    }

    progressEl.innerHTML = `
      <div class="bs-loading">
        <div class="bs-spinner"></div>
        <span>正在推送到 GitHub...</span>
      </div>
    `;

    const pushResp = await fetch(`${API_BASE}/push-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content }),
    });

    if (!pushResp.ok) {
      const err = await pushResp.json().catch(() => ({ detail: "推送失败" }));
      throw new Error(err.detail || `HTTP ${pushResp.status}`);
    }

    const result = await pushResp.json();
    progressEl.innerHTML = `
      <div class="bs-md-success">
        报告已自动推送到 GitHub。<br>
        <a href="${escapeHTML(result.url)}" target="_blank" rel="noreferrer">${escapeHTML(result.url)}</a>
      </div>
    `;
  } catch (error) {
    progressEl.innerHTML = `<div class="bs-error">报告生成或推送失败：${escapeHTML(error.message || "未知错误")}</div>`;
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
  lines.push("## 内容概览");
  lines.push("");
  lines.push(reportData.overview || "暂无概览");
  lines.push("");
  lines.push("## 分段解析");
  lines.push("");

  for (const section of reportData.sections || []) {
    const time = formatTimeMD(section.timestamp);
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
        <h2 class="bs-inline-title">视频总结</h2>
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
        <div class="bs-inline-hint">结果会展示在这里，并可按设置自动推送到 GitHub。</div>
      </div>
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

function scheduleEnsureInlineSummary() {
  if (ensureInlineTimer) return;
  ensureInlineTimer = window.setTimeout(() => {
    ensureInlineTimer = null;
    if (!document.getElementById(INLINE_SUMMARY_ID)) {
      ensureInlineSummaryShell();
    }
  }, 250);
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

function renderInlineStatus(message, isError = false) {
  const shell = ensureInlineSummaryShell();
  if (!shell) return;

  const content = shell.querySelector("#bs-inline-status-content");
  if (!content) return;

  content.className = isError ? "bs-inline-status-content is-error" : "bs-inline-status-content";
  content.innerHTML = message;
}

function renderInlineSummary(data) {
  const shell = ensureInlineSummaryShell();
  if (!shell) return;

  const content = shell.querySelector("#bs-inline-status-content");
  if (!content) return;

  const summaryItems = (data.summary || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("");
  const chapters = (data.chapters || [])
    .slice(0, 6)
    .map(
      (chapter) => `
        <button class="bs-inline-chapter" type="button" data-seconds="${Number(chapter.seconds) || 0}">
          <span class="bs-inline-time">${formatTime(Number(chapter.seconds) || 0)}</span>
          <span class="bs-inline-chapter-title">${escapeHTML(chapter.title || "未命名章节")}</span>
        </button>
      `
    )
    .join("");

  content.className = "bs-inline-status-content is-ready";
  content.innerHTML = `
    <div class="bs-inline-meta">
      <span class="bs-inline-badge ${data.cached ? "is-cache" : ""}">${data.cached ? "缓存结果" : "最新生成"}</span>
      <span class="bs-inline-bvid">${escapeHTML(data.bvid || "")}</span>
      <button class="bs-inline-secondary" type="button" id="bs-inline-refresh-btn">重新生成</button>
    </div>
    <h3 class="bs-inline-video-title">${escapeHTML(data.title || "")}</h3>
    <div class="bs-inline-one-line">${escapeHTML(data.one_line || "")}</div>
    <div class="bs-inline-grid">
      <div class="bs-inline-column">
        <div class="bs-inline-section-title">重点摘要</div>
        <ul class="bs-inline-list">${summaryItems || "<li>暂无摘要</li>"}</ul>
      </div>
      <div class="bs-inline-column">
        <div class="bs-inline-section-title">章节跳转</div>
        <div class="bs-inline-chapters">${chapters || '<div class="bs-inline-empty">暂无章节</div>'}</div>
      </div>
    </div>
  `;

  content.querySelector("#bs-inline-refresh-btn")?.addEventListener("click", () => onParse(true));
  content.querySelectorAll(".bs-inline-chapter").forEach((button) => {
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

function renderError(message) {
  const body = document.getElementById("bs-body");
  if (!body) return;
  body.innerHTML = `<div class="bs-error">错误：${message}</div>`;
}

function renderResult(data) {
  const body = document.getElementById("bs-body");
  if (!body) return;

  const chaptersHTML = (data.chapters || [])
    .map(
      (chapter) => `
        <div class="bs-chapter" data-seconds="${Number(chapter.seconds) || 0}">
          <div class="bs-chapter-top">
            <span class="bs-chapter-title">${escapeHTML(chapter.title || "未命名章节")}</span>
            <span class="bs-chapter-time">${formatTime(Number(chapter.seconds) || 0)}</span>
          </div>
          <div class="bs-chapter-desc">${escapeHTML(chapter.desc || "")}</div>
        </div>
      `
    )
    .join("");

  const pointsHTML = (data.summary || [])
    .map(
      (point) => `
        <div class="bs-point">
          <div class="bs-dot"></div>
          <span>${escapeHTML(point || "")}</span>
        </div>
      `
    )
    .join("");

  body.innerHTML = `
    <div class="bs-video-title">${escapeHTML(data.title || "")}</div>
    <div class="bs-meta-row">
      <span class="bs-tag ${data.cached ? "is-cache" : ""}">${data.cached ? "缓存结果" : "最新生成"}</span>
    </div>
    <div class="bs-section-title">一句话总结</div>
    <div class="bs-one-line">${escapeHTML(data.one_line || "")}</div>
    <div class="bs-section-title">重点摘要</div>
    ${pointsHTML || '<div style="font-size:13px;color:#6b7280">暂无摘要</div>'}
    <div class="bs-section-title">章节导览</div>
    ${chaptersHTML || '<div style="font-size:13px;color:#6b7280">暂无章节信息</div>'}
    <div class="bs-section-title">流程图</div>
    ${renderFlowchart(data.flowchart_uml || "")}
  `;

  body.querySelectorAll(".bs-chapter").forEach((element) => {
    element.addEventListener("click", () => {
      const sec = parseInt(element.dataset.seconds, 10);
      const video = document.querySelector("video");
      if (video && !Number.isNaN(sec)) {
        video.currentTime = sec;
        video.play();
      }
    });
  });

  const umlPreview = body.querySelector(".bs-uml-preview");
  if (umlPreview) {
    const encoded = encodeMermaid(data.flowchart_uml || "");
    umlPreview.src = `https://mermaid.ink/img/${encoded}`;
    umlPreview.onerror = () => {
      const fallback = body.querySelector(".bs-uml-fallback");
      if (fallback) fallback.style.display = "block";
      umlPreview.style.display = "none";
    };
  }
}

function renderFlowchart(uml) {
  const clean = String(uml || "").trim();
  if (!clean) return '<div style="font-size:13px;color:#6b7280">暂无流程图</div>';

  return `
    <div class="bs-flow-wrap">
      <img class="bs-uml-preview" alt="流程图预览" />
      <pre class="bs-uml-fallback">${escapeHTML(clean)}</pre>
    </div>
  `;
}

function encodeMermaid(code) {
  const utf8 = encodeURIComponent(code).replace(/%([0-9A-F]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );
  return btoa(utf8).replaceAll("+", "-").replaceAll("/", "_");
}

function initResize(panel, handle) {
  let dragging = false;

  const onMove = (event) => {
    if (!dragging) return;
    const pointerX = event.clientX ?? event.touches?.[0]?.clientX;
    if (typeof pointerX !== "number") return;
    const width = window.innerWidth - pointerX;
    const safeWidth = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, width));
    panelWidth = safeWidth;
    panel.style.width = `${panelWidth}px`;
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove("bs-resizing");
  };

  handle.addEventListener("mousedown", () => {
    dragging = true;
    document.body.classList.add("bs-resizing");
  });
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);

  handle.addEventListener("touchstart", () => {
    dragging = true;
    document.body.classList.add("bs-resizing");
  }, { passive: true });
  window.addEventListener("touchmove", onMove, { passive: true });
  window.addEventListener("touchend", onUp);
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
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function formatTimeMD(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
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
  cachedResult = null;
  if (ensureInlineTimer) {
    clearTimeout(ensureInlineTimer);
    ensureInlineTimer = null;
  }
  document.getElementById("bili-summarizer-panel")?.remove();
  document.getElementById(INLINE_SUMMARY_ID)?.remove();
  setTimeout(injectUI, 1000);
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
