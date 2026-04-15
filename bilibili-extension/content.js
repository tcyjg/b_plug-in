const API_BASE = "http://127.0.0.1:8000";

const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 720;
const PANEL_DEFAULT_WIDTH = 380;

let lastBvid = null;
let cachedResult = null;
let loading = false;
let panelWidth = PANEL_DEFAULT_WIDTH;

function injectUI() {
  if (document.getElementById("bili-summarizer-btn")) return;

  const btn = document.createElement("button");
  btn.id = "bili-summarizer-btn";
  btn.textContent = "AI速览";
  document.body.appendChild(btn);

  const panel = document.createElement("div");
  panel.id = "bili-summarizer-panel";
  panel.style.width = `${panelWidth}px`;
  panel.innerHTML = `
    <div class="bs-resizer" id="bs-resizer" title="拖动调整宽度"></div>
    <div class="bs-header">
      <span>视频速览</span>
      <button class="bs-close" id="bs-close-btn">×</button>
    </div>
    <div class="bs-controls">
      <button id="bs-parse-btn" class="bs-parse-btn">解析当前视频</button>
      <button id="bs-refresh-btn" class="bs-refresh-btn">重新解析</button>
      <button id="bs-md-btn" class="bs-md-btn">生成MD报告</button>
    </div>
    <div class="bs-body" id="bs-body"></div>
  `;
  document.body.appendChild(panel);

  btn.addEventListener("click", onOpenPanel);
  document.getElementById("bs-close-btn").addEventListener("click", () => {
    panel.classList.remove("open");
    btn.style.display = "block";
  });

  document.getElementById("bs-parse-btn").addEventListener("click", () => onParse(false));
  document.getElementById("bs-refresh-btn").addEventListener("click", () => onParse(true));
  document.getElementById("bs-md-btn").addEventListener("click", () => generateMDReport());

  initResize(panel, document.getElementById("bs-resizer"));
  renderWelcome();
}

function onOpenPanel() {
  const panel = document.getElementById("bili-summarizer-panel");
  panel.classList.add("open");
  document.getElementById("bili-summarizer-btn").style.display = "none";
}

async function onParse(forceRefresh) {
  if (loading) return;

  const bvid = getBvid();
  if (!bvid) {
    renderError("无法识别视频ID，请确认当前在视频页面");
    return;
  }

  onOpenPanel();
  const body = document.getElementById("bs-body");

  if (!forceRefresh && bvid === lastBvid && cachedResult) {
    renderResult(cachedResult);
    return;
  }

  loading = true;
  body.innerHTML = `
    <div class="bs-loading">
      <div class="bs-spinner"></div>
      <span>正在分析视频内容...</span>
      <span style="font-size:11px;color:#9ca3af">通常需要 5~15 秒</span>
    </div>
  `;

  try {
    const sessdata = getCookie("SESSDATA") || "";

    const resp = await fetch(`${API_BASE}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bvid, sessdata, force_refresh: forceRefresh }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: "请求失败" }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    lastBvid = bvid;
    cachedResult = data;
    renderResult(data);
  } catch (e) {
    renderError(`${e.message}<br><br><span style="font-size:11px;color:#6b7280">请确认后端正在运行：<br>uvicorn main:app --reload --port 8000</span>`);
  } finally {
    loading = false;
  }
}

function renderWelcome() {
  const body = document.getElementById("bs-body");
  if (!body) return;
  body.innerHTML = `
    <div class="bs-empty">
      <div class="bs-empty-title">准备就绪</div>
      <div class="bs-empty-desc">点击上方"解析当前视频"开始生成总结。</div>
      <div class="bs-empty-desc">支持后端缓存和核心思想流程图。</div>
    </div>
  `;
}

// ========== MD 报告生成 ==========

async function generateMDReport() {
  if (loading) return;

  const bvid = getBvid();
  if (!bvid) {
    renderError("无法识别视频ID");
    return;
  }

  loading = true;
  const body = document.getElementById("bs-body");

  // 保留当前内容，在底部显示进度
  let progressEl = document.getElementById("bs-md-progress");
  if (!progressEl) {
    progressEl = document.createElement("div");
    progressEl.id = "bs-md-progress";
    progressEl.className = "bs-md-progress";
    body.appendChild(progressEl);
  }
  progressEl.innerHTML = `
    <div class="bs-loading">
      <div class="bs-spinner"></div>
      <span>正在生成内容报告...</span>
      <span style="font-size:11px;color:#9ca3af">AI 分析 + 截图中，请稍候</span>
    </div>
  `;

  try {
    const sessdata = getCookie("SESSDATA") || "";
    const resp = await fetch(`${API_BASE}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bvid, sessdata, force_refresh: false }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: "请求失败" }));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }

    const reportData = await resp.json();

    // 收集需要截图的关键帧时间点
    const keyframes = (reportData.sections || []).filter(s => s.is_keyframe);
    const frameMap = {};

    if (keyframes.length > 0) {
      progressEl.innerHTML = `
        <div class="bs-loading">
          <div class="bs-spinner"></div>
          <span>正在截取关键画面 (${keyframes.length} 张)...</span>
        </div>
      `;
      const videoEl = document.querySelector("video");
      if (videoEl) {
        for (const kf of keyframes) {
          try {
            const dataUrl = await captureFrame(videoEl, kf.timestamp);
            // 上传到图床
            progressEl.innerHTML = `
              <div class="bs-loading">
                <div class="bs-spinner"></div>
                <span>正在上传截图... (${Object.keys(frameMap).length + 1}/${keyframes.length})</span>
              </div>
            `;
            const imageUrl = await uploadImage(dataUrl);
            frameMap[kf.timestamp] = imageUrl;
          } catch (e) {
            console.warn(`截图/上传失败 (timestamp=${kf.timestamp}):`, e);
          }
        }
      }
    }

    // 生成 Markdown 并下载
    const md = buildMarkdown(reportData, frameMap);
    downloadMarkdown(md, `${sanitizeFilename(reportData.title || bvid)}_报告.md`);

    progressEl.innerHTML = `<div class="bs-md-success">报告已生成并下载！</div>`;
    setTimeout(() => {
      const p = document.getElementById("bs-md-progress");
      if (p) p.remove();
    }, 3000);

  } catch (e) {
    progressEl.innerHTML = `<div class="bs-error">报告生成失败：${escapeHTML(e.message)}</div>`;
  } finally {
    loading = false;
  }
}

function captureFrame(videoEl, timestamp) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const onSeeked = () => {
      videoEl.removeEventListener("seeked", onSeeked);
      try {
        canvas.width = videoEl.videoWidth || 640;
        canvas.height = videoEl.videoHeight || 360;
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      }
    };

    videoEl.addEventListener("seeked", onSeeked);
    videoEl.currentTime = timestamp;

    // 超时保护
    setTimeout(() => {
      videoEl.removeEventListener("seeked", onSeeked);
      reject(new Error("截图超时"));
    }, 5000);
  });
}

async function uploadImage(base64Data) {
  const resp = await fetch(`${API_BASE}/upload-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64Data }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: "上传失败" }));
    throw new Error(err.detail || `上传失败 HTTP ${resp.status}`);
  }
  const data = await resp.json();
  return data.url;
}

function buildMarkdown(reportData, frameMap) {
  const lines = [];
  const title = reportData.title || "视频报告";
  const bvid = reportData.bvid || "";

  lines.push(`# ${title}`);
  lines.push(``);
  lines.push(`> BV号: ${bvid} | 生成时间: ${new Date().toLocaleString("zh-CN")}`);
  lines.push(``);
  lines.push(`## 内容概述`);
  lines.push(``);
  lines.push(reportData.overview || "暂无概述");
  lines.push(``);

  lines.push(`## 内容时间线`);
  lines.push(``);

  for (const sec of reportData.sections || []) {
    const time = formatTimeMD(sec.timestamp);
    lines.push(`### [${time}] ${sec.title || "未命名"}`);
    lines.push(``);
    lines.push(sec.content || "");
    lines.push(``);

    // 如果有关键帧截图
    const frame = frameMap[sec.timestamp];
    if (frame) {
      lines.push(`![${sec.title || "截图"}](${frame})`);
      lines.push(``);
    }
  }

  lines.push(`---`);
  lines.push(`*由 B站视频速览 AI 自动生成*`);

  return lines.join("\n");
}

function formatTimeMD(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  }
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").substring(0, 80);
}

function downloadMarkdown(content, filename) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderError(message) {
  const body = document.getElementById("bs-body");
  if (!body) return;
  body.innerHTML = `<div class="bs-error">✖ ${message}</div>`;
}

function renderResult(data) {
  const body = document.getElementById("bs-body");

  const chaptersHTML = (data.chapters || []).map(ch => `
    <div class="bs-chapter" data-seconds="${Number(ch.seconds) || 0}">
      <div class="bs-chapter-top">
        <span class="bs-chapter-title">${escapeHTML(ch.title || "未命名章节")}</span>
        <span class="bs-chapter-time">${formatTime(Number(ch.seconds) || 0)}</span>
      </div>
      <div class="bs-chapter-desc">${escapeHTML(ch.desc || "")}</div>
    </div>
  `).join("");

  const pointsHTML = (data.summary || []).map(p => `
    <div class="bs-point">
      <div class="bs-dot"></div>
      <span>${escapeHTML(p || "")}</span>
    </div>
  `).join("");

  const flowchartHTML = renderFlowchart(data.flowchart_uml || "");

  body.innerHTML = `
    <div class="bs-video-title">${escapeHTML(data.title || "")}</div>

    <div class="bs-meta-row">
      <span class="bs-tag ${data.cached ? "is-cache" : ""}">${data.cached ? "命中缓存" : "实时生成"}</span>
    </div>

    <div class="bs-section-title">一句话总结</div>
    <div class="bs-one-line">${escapeHTML(data.one_line || "")}</div>

    <div class="bs-section-title">核心要点</div>
    ${pointsHTML}

    <div class="bs-section-title">章节跳转 · 点击直达</div>
    ${chaptersHTML || '<div style="font-size:13px;color:#6b7280">暂无章节信息</div>'}

    <div class="bs-section-title">核心思想流程图</div>
    ${flowchartHTML}
  `;

  body.querySelectorAll(".bs-chapter").forEach(el => {
    el.addEventListener("click", () => {
      const sec = parseInt(el.dataset.seconds, 10);
      const videoEl = document.querySelector("video");
      if (videoEl && !Number.isNaN(sec)) {
        videoEl.currentTime = sec;
        videoEl.play();
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
  const cleanUml = String(uml || "").trim();
  if (!cleanUml) {
    return '<div style="font-size:13px;color:#6b7280">暂无流程图信息</div>';
  }

  return `
    <div class="bs-flow-wrap">
      <img class="bs-uml-preview" alt="核心思想流程图" />
      <pre class="bs-uml-fallback">${escapeHTML(cleanUml)}</pre>
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

  const onMove = (e) => {
    if (!dragging) return;
    const pointerX = e.clientX ?? e.touches?.[0]?.clientX;
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

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : "";
}

function formatTime(seconds) {
  const s = Math.max(0, seconds | 0);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

let lastPath = location.pathname;
injectUI();

const observer = new MutationObserver(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    lastBvid = null;
    cachedResult = null;

    document.getElementById("bili-summarizer-btn")?.remove();
    document.getElementById("bili-summarizer-panel")?.remove();
    setTimeout(injectUI, 1000);
  }
});
observer.observe(document.body, { childList: true, subtree: true });
