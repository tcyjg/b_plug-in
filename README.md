# B站视频速览工具

一键总结 B 站视频内容，提取核心要点和关键章节，支持点击时间戳直接跳转视频。支持生成带截图的 MD 报告并自动推送到 GitHub 仓库。

---

## 项目结构

```
b_plug-in/                    # Python 后端
├── main.py                   # FastAPI 主服务
├── subtitle.py               # B站字幕获取逻辑
├── summarizer.py             # 千问 API 调用（摘要 + 内容报告）
├── image_host.py             # imgbb 图床上传
├── github_push.py            # GitHub 仓库文件推送
├── .env                      # 密钥配置（不要上传到 Git）
└── venv/                     # Python 虚拟环境

bilibili-extension/           # Chrome 插件
├── manifest.json             # 插件配置
├── content.js                # 注入 B站页面的逻辑
└── sidebar.css               # 侧边栏样式
```

---

## 环境要求

- Python 3.10+
- Conda 或 venv 虚拟环境
- Chrome 浏览器
- 千问 API Key（[申请地址](https://dashscope.aliyun.com)）
- imgbb API Key（[申请地址](https://api.imgbb.com)，免费，用于截图上传）
- GitHub Personal Access Token（需要 `repo` 权限，用于推送报告）
- B站账号（用于获取字幕）

---

## 快速开始

### 1. 安装依赖

```bash
cd b_plug-in
conda activate 你的环境名

pip install fastapi uvicorn bilibili-api-python openai python-dotenv httpx \
  -i https://mirrors.aliyun.com/pypi/simple/
```

### 2. 配置密钥

在 `b_plug-in/` 目录下创建 `.env` 文件：

```env
DASHSCOPE_API_KEY=sk-你的千问APIKey
BILIBILI_SESSDATA=你的B站SESSDATA
IMGBB_API_KEY=你的imgbb_api_key
GITHUB_TOKEN=你的github_personal_access_token
GITHUB_REPO=owner/repo
GITHUB_PATH=reports
GITHUB_BRANCH=main
```

#### 获取各密钥的方式

**DASHSCOPE_API_KEY（千问 AI）**
1. 访问 [通义千问控制台](https://dashscope.aliyun.com)
2. 开通 DashScope 服务（免费额度可用）
3. 在 API-KEY 管理中创建并复制 Key

**BILIBILI_SESSDATA（B站登录态）**
1. 浏览器登录 bilibili.com
2. F12 → Application → Cookies → `https://www.bilibili.com`
3. 找到 `SESSDATA`，复制其 Value 粘贴到 `.env`

> ⚠️ SESSDATA 约 30 天过期，过期后重新复制更新 `.env` 即可，无需重启服务。

**IMGBB_API_KEY（图床）**
1. 访问 [imgbb API](https://api.imgbb.com/)
2. 注册账号并获取免费 API Key
3. 填入 `.env` 的 `IMGBB_API_KEY`

**GITHUB_TOKEN（GitHub 推送）**
1. 访问 GitHub → Settings → Developer settings → [Personal access tokens](https://github.com/settings/tokens) → Tokens (classic)
2. 点击 "Generate new token"
3. 保证 contents 有 read and write 权限
3. 勾选 `repo` 权限（完整的仓库访问）
4. 生成并复制 Token 到 `.env` 的 `GITHUB_TOKEN`

**GITHUB_REPO（目标仓库）**
- 格式为 `owner/repo`，例如 `zhangsan/video-reports`
- 需要是一个你已存在的仓库，且 Token 有写入权限

**GITHUB_PATH（目标文件夹）**
- 报告存放的目录路径，例如 `reports`
- 不需要提前在仓库中创建，首次推送时会自动建立
- 同名文件不会覆盖，自动加数字后缀（如 `视频标题_1.md`）

### 3. 启动后端

```bash
cd b_plug-in
uvicorn main:app --reload --port 8000
```

看到以下输出说明启动成功：

```
INFO: Uvicorn running on http://127.0.0.1:8000
```

### 4. 安装 Chrome 插件

1. 打开 `chrome://extensions/`
2. 右上角开启**开发者模式**
3. 点击**加载已解压的扩展程序**
4. 选择 `bilibili-extension/` 文件夹

> 修改插件代码后，回到 `chrome://extensions/` 点击扩展卡片上的刷新按钮，然后刷新 B 站页面即可。

### 5. 使用

打开任意 B 站视频页面，点击右侧蓝色「**AI速览**」按钮：

- **解析当前视频**：生成一句话总结、核心要点、章节跳转、核心思想流程图
- **重新解析**：强制刷新，忽略缓存重新分析
- **生成MD报告**：AI 生成详细内容报告，自动截取关键帧画面，上传图床后推送到 GitHub 仓库

---

## 接口文档

后端启动后访问 `http://127.0.0.1:8000/docs` 查看完整 Swagger 文档。

| 接口 | 方法 | 说明 |
|------|------|------|
| `/summarize` | POST | 传入 bvid，返回摘要和章节 |
| `/report` | POST | 传入 bvid，返回详细内容报告（含关键帧时间点） |
| `/upload-image` | POST | 上传 base64 截图到 imgbb 图床，返回图片 URL |
| `/push-report` | POST | 推送 Markdown 报告到 GitHub 仓库 |
| `/health` | GET | 检查服务是否正常运行 |

**请求示例：**

```bash
curl -X POST http://127.0.0.1:8000/summarize \
  -H "Content-Type: application/json" \
  -d '{"bvid": "BV1XLcfzgES5"}'
```

---

## 常见问题

| 问题 | 原因 | 解决方法 |
|------|------|----------|
| 字幕获取失败 | 该视频无 CC 字幕 | 换教程类、知识科普类视频 |
| 返回 422 | SESSDATA 未配置或已过期 | 重新从浏览器复制 SESSDATA |
| 插件不出现 | URL 格式不匹配 | 确认地址栏为 `bilibili.com/video/BVxxx` |
| 后端连不上 | 服务未启动 | 运行 `uvicorn main:app --port 8000` |
| JSON 解析报错 | 模型输出格式异常 | 查看终端日志，确认模型原始输出 |
| 图床上传失败 | IMGBB_API_KEY 未配置 | 检查 `.env` 中 `IMGBB_API_KEY` 是否正确 |
| GitHub 推送失败 | Token 权限不足或仓库不存在 | 确认 Token 有 `repo` 权限，仓库地址格式正确 |

---

## 开机自启（Windows）

在项目目录新建 `start.bat`：

```bat
@echo off
cd /d D:\code\py_code\b_plug-in
call D:\develop\pycharm\conda\con\Scripts\activate.bat
uvicorn main:app --port 8000
```

新建 `start_silent.vbs`（后台静默运行，无黑窗口）：

```vbscript
Set ws = CreateObject("Wscript.Shell")
ws.Run "cmd /c D:\code\py_code\b_plug-in\start.bat", 0, False
```

按 `Win + R` 输入 `taskschd.msc`，创建任务计划：
- 触发器：计算机启动时
- 操作：启动 `start_silent.vbs`
- 勾选「不管用户是否登录都要运行」

---

## 服务器部署（可选）

如需在 VPS 上部署，使用 systemd 管理服务：

```bash
# 上传代码
scp -r ./b_plug-in root@服务器IP:/root/bili-summarizer

# 创建服务
nano /etc/systemd/system/bili-summarizer.service
```

服务配置内容：

```ini
[Unit]
Description=Bilibili Summarizer API
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/bili-summarizer
ExecStart=/root/bili-summarizer/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable bili-summarizer
systemctl start bili-summarizer
```

部署后将 `content.js` 第一行的 API 地址改为服务器 IP：

```javascript
const API_BASE = "http://你的服务器IP:8000";
```

---

## 技术栈

| 模块 | 技术 |
|------|------|
| 后端框架 | FastAPI + Uvicorn |
| 字幕获取 | bilibili-api-python |
| AI 总结 | 通义千问 qwen-plus |
| 图床 | imgbb API |
| 报告存储 | GitHub Contents API |
| 浏览器插件 | Chrome Manifest V3 |

---

## 注意事项

- `.env` 文件包含密钥，**不要提交到 Git**，确保 `.gitignore` 中包含 `.env`
- 本工具仅供个人学习使用，请遵守 B 站用户协议
- SESSDATA 约每 30 天过期，更新后无需重启服务
- GitHub 推送同名文件不会覆盖，自动加数字后缀（`_1`, `_2`, ...）
