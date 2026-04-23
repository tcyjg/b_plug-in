import httpx
from bilibili_api import Credential, video
from bilibili_api.utils import network as bili_network

# Avoid advertising brotli in environments where aiohttp/brotli is unstable.
bili_network.HEADERS["Accept-Encoding"] = "gzip, deflate"


async def get_subtitle_text(bvid: str, sessdata: str, page: int = 1) -> tuple[str | None, dict]:
    """
    Return subtitle text plus basic page metadata for the requested BV and page number.
    """
    cred = Credential(sessdata=sessdata)
    v = video.Video(bvid=bvid, credential=cred)

    info = await v.get_info()
    pages = await v.get_pages()
    if not pages:
        return None, {"title": info["title"], "duration": info["duration"], "page": page, "cid": None}

    page_index = min(max(page - 1, 0), len(pages) - 1)
    current_page = pages[page_index]
    cid = current_page["cid"]
    part = (current_page.get("part") or "").strip()
    title = info["title"]
    full_title = f"{title} - {part}" if part and part != title else title

    try:
        subtitle_info = await v.get_subtitle(cid)
        subtitles = subtitle_info.get("subtitles", [])
        if not subtitles:
            return None, {"title": full_title, "duration": info["duration"], "page": page_index + 1, "cid": cid}

        target = next((item for item in subtitles if "zh" in item.get("lan", "")), subtitles[0])
        url = "https:" + target["subtitle_url"]
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()

        lines = []
        for item in data.get("body", []):
            seconds = int(item["from"])
            content = item["content"].strip()
            if content:
                lines.append(f"[{seconds}s] {content}")

        return "\n".join(lines), {"title": full_title, "duration": info["duration"], "page": page_index + 1, "cid": cid}
    except Exception as exc:
        print(f"subtitle fetch failed: {exc}")
        return None, {"title": full_title, "duration": info["duration"], "page": page_index + 1, "cid": cid}
