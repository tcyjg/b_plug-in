import base64
import io
import asyncio

import av
from bilibili_api import video, Credential
from bilibili_api.utils import network as bili_network
from image_host import upload_base64_image

bili_network.HEADERS["Accept-Encoding"] = "gzip, deflate"

HTTP_HEADERS = (
    "Referer: https://www.bilibili.com\r\n"
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36\r\n"
)


async def _get_stream_url(bvid: str, sessdata: str) -> str:
    cred = Credential(sessdata=sessdata)
    v = video.Video(bvid=bvid, credential=cred)
    info = await v.get_download_url(0)
    video_streams = info.get("dash", {}).get("video", [])
    if not video_streams:
        raise ValueError("无法获取视频流地址")
    return video_streams[0]["baseUrl"]


def _extract_frames(stream_url: str, timestamps: list[int]) -> dict[int, str]:
    """同步提取帧，返回 { timestamp: base64_jpeg }"""
    result = {}
    container = av.open(stream_url, options={"headers": HTTP_HEADERS})
    stream = container.streams.video[0]

    for ts in sorted(timestamps):
        try:
            container.seek(ts * 1_000_000)  # 微秒
            for frame in container.decode(stream):
                img = frame.to_image()
                buf = io.BytesIO()
                img.save(buf, format="JPEG", quality=85)
                result[ts] = base64.b64encode(buf.getvalue()).decode("utf-8")
                break
        except Exception as e:
            print(f"截帧失败 (ts={ts}): {e}")

    container.close()
    return result


async def capture_frames(
    bvid: str, sessdata: str, timestamps: list[int]
) -> dict[int, str]:
    """
    在指定时间点截取视频帧并上传图床。
    返回 { timestamp: imgbb_url }
    """
    stream_url = await _get_stream_url(bvid, sessdata)

    # PyAV 是同步库，放到线程池执行避免阻塞
    frames_b64 = await asyncio.to_thread(_extract_frames, stream_url, timestamps)

    result = {}
    for ts, b64 in frames_b64.items():
        try:
            url = await upload_base64_image(b64)
            result[ts] = url
        except Exception as e:
            print(f"上传失败 (ts={ts}): {e}")

    return result
