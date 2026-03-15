# B站视频速览工具

一键总结 B 站视频内容，提取核心要点和关键章节，支持点击时间戳直接跳转视频。

---

## 项目结构

```
b_plug-in/                    # Python 后端
├── main.py                   # FastAPI 主服务，提供 /summarize 接口
├── subtitle.py               # B站字幕获取逻辑
├── summarizer.py             # 调用千问 API 进行 AI 总结
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
```

**如何获取 SESSDATA：**
1. 浏览器登录 bilibili.com
2. F12 → Application → Cookies → `https://www.bilibili.com`
3. 找到 `SESSDATA`，复制其 Value 粘贴到上面

> ⚠️ SESSDATA 约 30 天过期，过期后重新复制更新 `.env` 即可，无需重启服务。

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

### 5. 使用

打开任意 B 站视频页面，点击右侧蓝色「**速览**」按钮，等待 5~15 秒即可看到：

- 一句话总结
- 3~5 条核心要点
- 关键章节列表（点击可直接跳转视频）

---

## 接口文档

后端启动后访问 `http://127.0.0.1:8000/docs` 查看完整 Swagger 文档。

| 接口 | 方法 | 说明 |
|------|------|------|
| `/summarize` | POST | 传入 bvid，返回摘要和章节 |
| `/health` | GET | 检查服务是否正常运行 |
| `/check` | GET | 检查 SESSDATA 是否有效 |

**请求示例：**

```bash
curl -X POST http://127.0.0.1:8000/summarize \
  -H "Content-Type: application/json" \
  -d '{"bvid": "BV1XLcfzgES5"}'
```

**返回示例：**

```json
{
  "one_line": "大学生低成本生活全攻略",
  "summary": ["外卖用淘金币返现", "出行靠支付宝领券", "购物善用拼多多"],
  "chapters": [
    {"title": "开场介绍", "seconds": 0, "desc": "作者介绍省钱成果"},
    {"title": "吃饭省钱技巧", "seconds": 39, "desc": "外卖平台比价方法"}
  ],
  "title": "视频标题",
  "bvid": "BV1XLcfzgES5"
}
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
| 浏览器插件 | Chrome Manifest V3 |

---

## 注意事项

- `.env` 文件包含密钥，**不要提交到 Git**，确保 `.gitignore` 中包含 `.env`
- 本工具仅供个人学习使用，请遵守 B 站用户协议
- SESSDATA 约每 30 天过期，更新后无需重启服务