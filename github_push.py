import base64
import os

import httpx

from config_store import get_config

GITHUB_API = "https://api.github.com"


def _get_github_config() -> tuple[str, str, str, str]:
    token = get_config("GITHUB_TOKEN")
    repo = get_config("GITHUB_REPO")
    path = get_config("GITHUB_PATH", "reports")
    branch = get_config("GITHUB_BRANCH", "main")
    if not token:
        raise ValueError("Missing GITHUB_TOKEN")
    if not repo:
        raise ValueError("Missing GITHUB_REPO")
    return token, repo, path, branch


async def _find_available_filename(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    repo: str,
    folder: str,
    branch: str,
    base_name: str,
    ext: str,
) -> str:
    resp = await client.get(
        f"{GITHUB_API}/repos/{repo}/contents/{folder}",
        headers=headers,
        params={"ref": branch},
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
    token, repo, folder, branch = _get_github_config()
    base_name, ext = os.path.splitext(filename)
    encoded_content = base64.b64encode(content.encode("utf-8")).decode("utf-8")
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        actual_filename = await _find_available_filename(client, headers, repo, folder.rstrip("/"), branch, base_name, ext)
        path = f"{folder.rstrip('/')}/{actual_filename}"
        if not message:
            message = f"docs: add report {actual_filename}"

        resp = await client.put(
            f"{GITHUB_API}/repos/{repo}/contents/{path}",
            headers=headers,
            json={"message": message, "content": encoded_content, "branch": branch},
        )
        if resp.status_code not in (200, 201):
            detail = resp.json().get("message", resp.text)
            raise ValueError(f"GitHub push failed: {detail}")
        data = resp.json()

    html_url = data.get("content", {}).get("html_url", "")
    return html_url or f"https://github.com/{repo}/blob/{branch}/{path}"
