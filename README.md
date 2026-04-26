# Bilibili Video Summary

一个用于 B 站视频总结的项目，包含：

- FastAPI 后端
- Chrome/Edge 扩展前端
- SQLite 持久化配置
- 可选的 GitHub 推送和截图上传

## 功能

- 解析当前视频页并生成视频概览
- 支持合集/分 P 视频，按当前 `p` 处理
- 在评论区上方展示可展开的视频总结
- 可选自动推送 Markdown 到 GitHub
- 配置保存在 SQLite，重启后不丢失
- 扩展内可直接配置后端地址和 API Key

## 项目结构

```text
b_plug-in/
├─ main.py
├─ config_store.py
├─ subtitle.py
├─ summarizer.py
├─ image_host.py
├─ github_push.py
├─ video_capture.py
├─ requirements.txt
├─ Dockerfile
├─ docker-compose.yml
├─ .env.example
└─ bilibili-extension-front/
   ├─ manifest.json
   ├─ background.js
   ├─ content.js
   ├─ sidebar.css
   ├─ options.html
   ├─ options.css
   └─ options.js
```

## 本地启动

要求：

- Python 3.10+
- Chrome 或 Edge

安装依赖：

```bash
pip install -r requirements.txt
```

复制环境变量模板：

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

至少配置：

```env
DASHSCOPE_API_KEY=
BILIBILI_SESSDATA=
```

启动后端：

```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

接口文档：

```text
http://127.0.0.1:8000/docs
```

## Docker 部署

这是给别人快速部署最合适的方式。默认做了两件事：

- 容器内运行 FastAPI 服务
- SQLite 数据库存到宿主机 `./data`，容器重启后不会丢

### 1. 准备环境变量

```bash
cp .env.example .env
```

至少填写：

```env
DASHSCOPE_API_KEY=
BILIBILI_SESSDATA=
```

如果要推送 GitHub，再填写：

```env
GITHUB_TOKEN=
GITHUB_REPO=owner/repo
GITHUB_PATH=video_summaries
GITHUB_BRANCH=main
```

如果要上传截图，再填写：

```env
IMGBB_API_KEY=
```

如果你是部署到服务器，建议把 `API_BASE_URL` 改成你的实际地址，例如：

```env
API_BASE_URL=https://api.example.com
```

### 2. 启动服务

```bash
docker compose up -d --build
```

查看日志：

```bash
docker compose logs -f
```

停止服务：

```bash
docker compose down
```

### 3. 数据持久化

`docker-compose.yml` 已经把 SQLite 挂载到：

```text
./data/app_data.db
```

也就是说：

- 配置页保存的 API Key 会保留
- 后端配置会保留
- 容器重建后数据还在

### 4. 对外访问

默认端口：

```text
http://127.0.0.1:8000
```

如果部署在服务器上：

- 把服务器 `8000` 端口放行，或
- 用 Nginx/Caddy 反向代理到 `8000`

建议正式环境走反向代理和 HTTPS。

## 扩展安装

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择目录：

```text
bilibili-extension-front
```

## 扩展配置

点击浏览器工具栏里的扩展图标，会直接打开设置页。

在设置页中可以：

- 配置后端地址
- 测试后端连接
- 读取后端当前配置
- 保存 API Key / Token / Repo 等配置到 SQLite

常见后端地址示例：

```text
http://127.0.0.1:8000
```

```text
https://api.example.com
```

## SQLite 配置持久化

后端提供：

- `GET /config`
- `POST /config`
- `GET /health`

配置优先级：

1. SQLite 中的值
2. `.env` 默认值

默认数据库文件：

```text
app_data.db
```

Docker 部署时默认是：

```text
/app/data/app_data.db
```

当前持久化的配置包括：

- `DASHSCOPE_API_KEY`
- `BILIBILI_SESSDATA`
- `IMGBB_API_KEY`
- `GITHUB_TOKEN`
- `GITHUB_REPO`
- `GITHUB_PATH`
- `GITHUB_BRANCH`
- `SUMMARY_CACHE_TTL_MINUTES`
- `API_BASE_URL`

## 主要接口

- `POST /summarize`
- `POST /report`
- `POST /capture-frames`
- `POST /upload-image`
- `POST /push-report`
- `GET /config`
- `POST /config`
- `GET /health`

## 常见问题

### 1. 页面内可以总结，但 GitHub 推送失败

检查：

- `GITHUB_TOKEN`
- `GITHUB_REPO`
- Token 是否有仓库 `Contents` 写权限

### 2. 合集视频切换分 P 后总结不对

现在后端和前端都按当前 URL 的 `p` 参数处理。切换分 P 后刷新或重新点击总结即可。

### 3. Docker 启动了，但扩展连不上后端

检查：

- 设置页中的后端地址是否正确
- 服务器防火墙或安全组是否放行 `8000`
- 如果用了反向代理，扩展里应填代理后的地址

### 4. 为什么推荐本地或自部署，而不是公共后端

因为这个项目会用到用户自己的 `BILIBILI_SESSDATA`。让用户自己部署后端更稳，也更容易获得信任。
