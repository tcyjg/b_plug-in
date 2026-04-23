import asyncio
import base64
import io

import av
from bilibili_api import Credential, video
from bilibili_api.utils import network as bili_network

from image_host import upload_base64_image

bili_network.HEADERS["Accept-Encoding"] = "gzip, deflate"

HTTP_HEADERS = (
    "Referer: https://www.bilibili.com\r\n"
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n"
)


async def _get_stream_url(bvid: str, sessdata: str, page: int = 1) -> str:
    cred = Credential(sessdata=sessdata)
    v = video.Video(bvid=bvid, credential=cred)
    page_index = max(page - 1, 0)
    info = await v.get_download_url(page_index)
    video_streams = info.get("dash", {}).get("video", [])
    if not video_streams:
        raise ValueError("No DASH video stream found")
    return video_streams[0]["baseUrl"]


def _extract_frames(stream_url: str, timestamps: list[int]) -> dict[int, str]:
    result: dict[int, str] = {}
    container = av.open(stream_url, options={"headers": HTTP_HEADERS})
    stream = container.streams.video[0]

    for ts in sorted(timestamps):
        try:
            container.seek(ts * 1_000_000)
            for frame in container.decode(stream):
                img = frame.to_image()
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                result[ts] = base64.b64encode(buf.getvalue()).decode("utf-8")
                break
        except Exception as exc:
            print(f"capture frame failed (ts={ts}): {exc}")

    container.close()
    return result


async def capture_frames(bvid: str, sessdata: str, timestamps: list[int], page: int = 1) -> dict[int, str]:
    stream_url = await _get_stream_url(bvid, sessdata, page)
    frames_b64 = await asyncio.to_thread(_extract_frames, stream_url, timestamps)

    result: dict[int, str] = {}
    for ts, b64 in frames_b64.items():
        try:
            result[ts] = await upload_base64_image(b64)
        except Exception as exc:
            print(f"upload frame failed (ts={ts}): {exc}")

    return result
