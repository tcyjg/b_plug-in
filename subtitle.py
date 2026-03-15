# subtitle.py
import asyncio
from bilibili_api import video, Credential
import os

async def get_subtitle_text(bvid: str, sessdata: str) -> tuple[str, dict]:
    """
    返回 (字幕文本, 视频信息)
    字幕文本格式：[时间秒数] 内容
    """
    cred = Credential(sessdata=sessdata)
    v = video.Video(bvid=bvid, credential=cred)

    # 获取视频基本信息
    info = await v.get_info()
    title = info["title"]
    duration = info["duration"]

    # 获取视频的 cid（分P视频取第一P）
    pages = await v.get_pages()
    cid = pages[0]["cid"]

    # 尝试获取字幕
    try:
        subtitle_info = await v.get_subtitle(cid)
        subtitles = subtitle_info.get("subtitles", [])

        if not subtitles:
            return None, {"title": title, "duration": duration}

        # 优先取中文字幕，没有就取第一个
        target = next(
            (s for s in subtitles if "zh" in s.get("lan", "")),
            subtitles[0]
        )

        # 拉取字幕内容（是个 JSON 文件的 URL）
        import httpx
        url = "https:" + target["subtitle_url"]
        async with httpx.AsyncClient() as client:
            resp = await client.get(url)
            data = resp.json()

        # 拼接成带时间戳的文本
        lines = []
        for item in data["body"]:
            seconds = int(item["from"])
            content = item["content"].strip()
            lines.append(f"[{seconds}s] {content}")

        return "\n".join(lines), {"title": title, "duration": duration}

    except Exception as e:
        print(f"字幕获取失败: {e}")
        return None, {"title": title, "duration": duration}