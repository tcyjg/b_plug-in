const API_BASE = "http://127.0.0.1:8000";

// ── 注入侧边栏 ───────────────────────────────────
function injectUI() {
  if (document.getElementById("bili-summarizer-btn")) return;

  const btn = document.createElement("button");
  btn.id = "bili-summarizer-btn";
  btn.textContent = "速 览";
  document.body.appendChild(btn);

  const panel = document.createElement("div");
  panel.id = "bili-summarizer-panel";
  panel.innerHTML = `
    <div class="bs-header">
      <span>⚡ 视频速览</span>
      <button class="bs-close" id="bs-close-btn">✕</button>
    </div>
    <div class="bs-body" id="bs-body"></div>
  `;
  document.body.appendChild(panel);

  btn.addEventListener("click", onOpen);
  document.getElementById("bs-close-btn").addEventListener("click", () => {
    panel.classList.remove("open");
    btn.style.display = "block";
  });
}

// ── 打开并加载 ───────────────────────────────────
let lastBvid = null;
let cachedResult = null;

async function onOpen() {
  const bvid = getBvid();
  if (!bvid) {
    alert("无法识别视频ID，请确认在视频页面");
    return;
  }

  const panel = document.getElementById("bili-summarizer-panel");
  const body  = document.getElementById("bs-body");
  panel.classList.add("open");
  document.getElementById("bili-summarizer-btn").style.display = "none";

  // 同一视频不重复请求
  if (bvid === lastBvid && cachedResult) {
    renderResult(cachedResult);
    return;
  }

  body.innerHTML = `
    <div class="bs-loading">
      <div class="bs-spinner"></div>
      <span>正在分析视频内容...</span>
      <span style="font-size:11px;color:#bbb">通常需要 5~15 秒</span>
    </div>
  `;

  try {
    const sessdata = getCookie("SESSDATA") || "";

    const resp = await fetch(`${API_BASE}/summarize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bvid, sessdata }),
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
    body.innerHTML = `
      <div class="bs-error">
        ❌ ${e.message}<br><br>
        <span style="font-size:11px;color:#999">
          请确认后端服务正在运行：<br>
          uvicorn main:app --reload --port 8000
        </span>
      </div>
    `;
  }
}

// ── 渲染结果 ─────────────────────────────────────
function renderResult(data) {
  const body = document.getElementById("bs-body");

  const chaptersHTML = (data.chapters || []).map(ch => `
    <div class="bs-chapter" data-seconds="${ch.seconds}">
      <div class="bs-chapter-top">
        <span class="bs-chapter-title">${ch.title}</span>
        <span class="bs-chapter-time">${formatTime(ch.seconds)}</span>
      </div>
      <div class="bs-chapter-desc">${ch.desc}</div>
    </div>
  `).join("");

  const pointsHTML = (data.summary || []).map(p => `
    <div class="bs-point">
      <div class="bs-dot"></div>
      <span>${p}</span>
    </div>
  `).join("");

  body.innerHTML = `
    <div class="bs-video-title">${data.title || ""}</div>

    <div class="bs-section-title">一句话总结</div>
    <div class="bs-one-line">${data.one_line || ""}</div>

    <div class="bs-section-title">核心要点</div>
    ${pointsHTML}

    <div class="bs-section-title">章节跳转 · 点击直达</div>
    ${chaptersHTML || '<div style="font-size:13px;color:#999">暂无章节信息</div>'}
  `;

  // 点击章节跳转
  body.querySelectorAll(".bs-chapter").forEach(el => {
    el.addEventListener("click", () => {
      const sec = parseInt(el.dataset.seconds);
      const videoEl = document.querySelector("video");
      if (videoEl) {
        videoEl.currentTime = sec;
        videoEl.play();
        // 可选：关闭面板让用户看视频
        // document.getElementById("bili-summarizer-panel").classList.remove("open");
        // document.getElementById("bili-summarizer-btn").style.display = "block";
      }
    });
  });
}

// ── 工具函数 ─────────────────────────────────────
function getBvid() {
  const match = location.pathname.match(/\/(BV\w+)/i);
  return match ? match[1] : null;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : "";
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── B站是SPA，监听路由变化 ───────────────────────
let lastPath = location.pathname;
injectUI();

const observer = new MutationObserver(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    lastBvid = null;
    cachedResult = null;
    // 移除旧UI，重新注入
    document.getElementById("bili-summarizer-btn")?.remove();
    document.getElementById("bili-summarizer-panel")?.remove();
    setTimeout(injectUI, 1000); // 等页面渲染完
  }
});
observer.observe(document.body, { childList: true, subtree: true });
