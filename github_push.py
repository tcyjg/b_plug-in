import os
import base64
import httpx
from dotenv import load_dotenv

load_dotenv()

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "")  # owner/repo 格式
GITHUB_PATH = os.getenv("GITHUB_PATH", "reports")  # 目标文件夹
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")

GITHUB_API = "https://api.github.com"


def _check_config():
    if not GITHUB_TOKEN:
        raise ValueError("未配置 GITHUB_TOKEN，请在 .env 中添加")
    if not GITHUB_REPO:
        raise ValueError("未配置 GITHUB_REPO（格式: owner/repo），请在 .env 中添加")


async def _find_available_filename(client, headers, base_name: str, ext: str) -> str:
    """查找不冲突的文件名，如果已存在则加 _1, _2, ... 后缀"""
    folder = GITHUB_PATH.rstrip("/")

    # 获取目标目录下所有文件名
    resp = await client.get(
        f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{folder}",
        headers=headers,
        params={"ref": GITHUB_BRANCH},
    )
    existing = set()
    if resp.status_code == 200:
        for item in resp.json():
            existing.add(item["name"])

    if f"{base_name}{ext}" not in existing:
        return f"{base_name}{ext}"

    n = 1
    while f"{base_name}_{n}{ext}" in existing:
        n += 1
    return f"{base_name}_{n}{ext}"


async def push_markdown(filename: str, content: str, message: str = "") -> str:
    """
    推送 Markdown 文件到 GitHub 仓库指定目录。
    同名文件自动加数字后缀（_1, _2, ...），不覆盖。
    返回文件的 GitHub 页面 URL。
    """
    _check_config()

    base_name, ext = os.path.splitext(filename)

    encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")

    headers = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        actual_filename = await _find_available_filename(client, headers, base_name, ext)
        path = f"{GITHUB_PATH.rstrip('/')}/{actual_filename}"

        if not message:
            message = f"docs: 添加视频报告 {actual_filename}"

        url = f"{GITHUB_API}/repos/{GITHUB_REPO}/contents/{path}"

        resp = await client.put(url, headers=headers, json={
            "message": message,
            "content": encoded_content,
            "branch": GITHUB_BRANCH,
        })
        if resp.status_code not in (200, 201):
            detail = resp.json().get("message", resp.text)
            raise ValueError(f"GitHub 推送失败: {detail}")

        data = resp.json()

    html_url = data.get("content", {}).get("html_url", "")
    return html_url or f"https://github.com/{GITHUB_REPO}/blob/{GITHUB_BRANCH}/{path}"
