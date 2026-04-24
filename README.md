# Bilibili Video Summary

一个用于 B 站视频内容总结的轻量工具，包含：

- FastAPI 后端
- Chrome 扩展前端
- SQLite 持久化配置存储
- 可选的 GitHub 报告推送

当前版本支持：

- 在 B 站视频页评论区上方展示“视频内容总结”
- 支持合集 / 分 P 视频，按当前 `p` 正确解析
- 点击分段内容跳转到对应时间点
- 扩展设置页可配置后端地址
- 后端配置持久化到 SQLite

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

## 运行要求

- Python 3.10+
- Chrome 或 Edge（支持加载解压扩展）

## 安装依赖

```bash
pip install -r requirements.txt
```

## 后端配置方式

后端现在支持两种配置来源：

1. `.env` 默认值
2. SQLite 持久化配置

启动后会自动创建 SQLite 数据库文件：

```text
app_data.db
```

数据库里会保存这些配置项：

- `DASHSCOPE_API_KEY`
- `BILIBILI_SESSDATA`
- `IMGBB_API_KEY`
- `GITHUB_TOKEN`
- `GITHUB_REPO`
- `GITHUB_PATH`
- `GITHUB_BRANCH`
- `SUMMARY_CACHE_TTL_MINUTES`
- `API_BASE_URL`

## 最简启动方式

先复制环境变量模板：

```bash
copy .env.example .env
```

然后至少填这两个：

```env
DASHSCOPE_API_KEY=
BILIBILI_SESSDATA=
```

如果你还要启用 GitHub 推送，再补：

```env
GITHUB_TOKEN=
GITHUB_REPO=owner/repo
GITHUB_PATH=video_summaries
GITHUB_BRANCH=main
```

如果你要上传关键帧图片，再补：

```env
IMGBB_API_KEY=
```

启动后端：

```bash
uvicorn main:app --host 127.0.0.1 --port 8000
```

启动成功后默认地址：

```text
http://127.0.0.1:8000
```

API 文档：

```text
http://127.0.0.1:8000/docs
```

## 扩展安装

1. 打开 `chrome://extensions/`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择目录：

```text
bilibili-extension-front
```

## 配置扩展后端地址

扩展已经内置设置页。

打开方式有两种：

1. 点击浏览器工具栏上的扩展图标，会直接打开设置页
2. 在扩展详情页点击“扩展选项”

然后填写后端地址，例如：

```text
http://127.0.0.1:8000
```

或：

```text
https://api.example.com
```

保存后，刷新 B 站视频页即可生效。

## 推荐部署方式

如果是给别人使用，推荐采用：

- 每个人本地运行一个后端
- 扩展里填自己的后端地址

原因：

- 用户自己的 `SESSDATA` 不需要发给公共服务器
- 更安全
- 也更容易排查问题

如果你要做服务器部署，推荐：

- 一台轻量 Linux 服务器
- 反向代理到 FastAPI
- 用户在扩展设置页填写你的 API 域名

## SQLite 配置管理接口

获取当前配置：

```http
GET /config
```

更新配置：

```http
POST /config
Content-Type: application/json
```

请求体示例：

```json
{
  "values": {
    "DASHSCOPE_API_KEY": "your-key",
    "BILIBILI_SESSDATA": "your-sessdata",
    "API_BASE_URL": "http://127.0.0.1:8000",
    "GITHUB_REPO": "owner/repo"
  }
}
```

注意：

- 返回的敏感字段会被掩码显示
- 实际值保存在 `app_data.db`

## 主要接口

- `POST /summarize`
- `POST /report`
- `POST /capture-frames`
- `POST /upload-image`
- `POST /push-report`
- `GET /config`
- `POST /config`
- `GET /health`

## 当前前端行为

- 在 B 站视频页评论区上方插入总结卡片
- 点击“总结视频”后生成内容总结
- “视频中的内容”每个分段可点击跳转
- 可展开 / 收起总结
- 可切换是否自动推送 GitHub
- 如果未开启自动推送，则不会生成 Markdown 上传链路，也不会上传截图

## 常见问题

### 1. 为什么没有总结内容？

常见原因：

- 当前视频没有字幕
- `BILIBILI_SESSDATA` 失效
- 后端没有正常启动

### 2. 为什么合集视频总是解析第一集？

当前版本已经支持按 URL 里的 `p` 参数解析。  
如果仍然不对，先刷新页面再重新生成。

### 3. 为什么 GitHub 推送失败？

检查：

- `GITHUB_TOKEN`
- `GITHUB_REPO`
- token 是否有仓库写权限

### 4. 为什么扩展请求不到后端？

检查：

- 后端是否已启动
- 扩展设置页里的后端地址是否正确
- 修改地址后是否刷新了 B 站视频页

## 后续建议

如果你准备公开给别人使用，下一步建议做：

- `start.bat` 一键启动脚本
- Docker 部署
- 扩展设置页增加“测试连接”按钮
- 后端管理鉴权
