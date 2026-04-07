const API_BASE = "http://127.0.0.1:8000";

const PANEL_MIN_WIDTH = 320;
const PANEL_MAX_WIDTH = 720;
const PANEL_DEFAULT_WIDTH = 380;
const STYLE_STORAGE_KEY = "bs-output-style";

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
      <div class="bs-style-wrap">
        <label for="bs-style">输出风格</label>
        <select id="bs-style">
          <option value="专业">专业</option>
          <option value="通俗">通俗</option>
          <option value="简洁">简洁</option>
          <option value="深度">深度</option>
        </select>
      </div>
      <button id="bs-parse-btn" class="bs-parse-btn">解析当前视频</button>
      <button id="bs-refresh-btn" class="bs-refresh-btn">重新解析</button>
    </div>
    <div class="bs-body" id="bs-body"></div>
  `;
  document.body.appendChild(panel);

  btn.addEventListener("click", onOpenPanel);
  document.getElementById("bs-close-btn").addEventListener("click", () => {
    panel.classList.remove("open");
    btn.style.display = "block";
  });

  const styleSelect = document.getElementById("bs-style");
  const savedStyle = localStorage.getItem(STYLE_STORAGE_KEY) || "专业";
  styleSelect.value = savedStyle;
  styleSelect.addEventListener("change", () => {
    localStorage.setItem(STYLE_STORAGE_KEY, styleSelect.value);
  });

  document.getElementById("bs-parse-btn").addEventListener("click", () => onParse(false));
  document.getElementById("bs-refresh-btn").addEventListener("click", () => onParse(true));

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
  const style = (document.getElementById("bs-style")?.value || "专业").trim();
  if (!bvid) {
    renderError("无法识别视频ID，请确认当前在视频页面");
    return;
  }

  onOpenPanel();
  const body = document.getElementById("bs-body");

  if (!forceRefresh && bvid === lastBvid && cachedResult && cachedResult.style === style) {
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
      body: JSON.stringify({ bvid, sessdata, style, force_refresh: forceRefresh }),
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
      <div class="bs-empty-desc">点击上方“解析当前视频”开始生成总结。</div>
      <div class="bs-empty-desc">支持缓存、知识图谱和输出风格自定义。</div>
    </div>
  `;
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

  const kgHTML = renderKnowledgeGraph(data.knowledge_graph || {});

  body.innerHTML = `
    <div class="bs-video-title">${escapeHTML(data.title || "")}</div>

    <div class="bs-meta-row">
      <span class="bs-tag">风格：${escapeHTML(data.style || "专业")}</span>
      <span class="bs-tag ${data.cached ? "is-cache" : ""}">${data.cached ? "命中缓存" : "实时生成"}</span>
    </div>

    <div class="bs-section-title">一句话总结</div>
    <div class="bs-one-line">${escapeHTML(data.one_line || "")}</div>

    <div class="bs-section-title">核心要点</div>
    ${pointsHTML}

    <div class="bs-section-title">章节跳转 · 点击直达</div>
    ${chaptersHTML || '<div style="font-size:13px;color:#6b7280">暂无章节信息</div>'}

    <div class="bs-section-title">知识图谱</div>
    ${kgHTML}
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
}

function renderKnowledgeGraph(graph) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes.slice(0, 12) : [];
  const edges = Array.isArray(graph.edges) ? graph.edges.slice(0, 24) : [];

  if (!nodes.length) {
    return '<div style="font-size:13px;color:#6b7280">暂无图谱信息</div>';
  }

  const width = 320;
  const height = 220;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = 78;

  const posMap = new Map();
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    posMap.set(String(n.id || `n${i}`), { x, y, label: n.label || `节点${i + 1}` });
  });

  const lineSvg = edges.map(edge => {
    const from = posMap.get(String(edge.source || ""));
    const to = posMap.get(String(edge.target || ""));
    if (!from || !to) return "";
    return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#94a3b8" stroke-width="1.4" />`;
  }).join("");

  const nodeHtml = [...posMap.values()].map(item => `
    <div class="bs-kg-node" style="left:${item.x}px;top:${item.y}px" title="${escapeHTML(item.label)}">
      ${escapeHTML(item.label)}
    </div>
  `).join("");

  const edgeList = edges.map(edge => {
    const source = posMap.get(String(edge.source || ""))?.label || edge.source || "?";
    const target = posMap.get(String(edge.target || ""))?.label || edge.target || "?";
    return `<div class="bs-kg-edge-item">${escapeHTML(source)} <span>→ ${escapeHTML(edge.relation || "关联")} →</span> ${escapeHTML(target)}</div>`;
  }).join("");

  return `
    <div class="bs-kg-wrap">
      <div class="bs-kg-canvas">
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
          ${lineSvg}
        </svg>
        ${nodeHtml}
      </div>
      <div class="bs-kg-edge-list">
        ${edgeList || '<div class="bs-kg-edge-item">暂无关系信息</div>'}
      </div>
    </div>
  `;
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
