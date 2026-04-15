import os
import base64
import httpx
from dotenv import load_dotenv

load_dotenv()

IMGBB_API_KEY = os.getenv("IMGBB_API_KEY", "")
IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload"


async def upload_base64_image(b64_data: str) -> str:
    """
    上传 base64 图片到 imgbb 图床，返回图片 URL。
    b64_data 可以是纯 base64 字符串或 data:image/...;base64,... 格式。
    """
    if not IMGBB_API_KEY:
        raise ValueError("未配置 IMGBB_API_KEY，请在 .env 中添加")

    # 去掉 data:image/...;base64, 前缀
    if b64_data.startswith("data:"):
        b64_data = b64_data.split(",", 1)[1]

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            IMGBB_UPLOAD_URL,
            data={"key": IMGBB_API_KEY, "image": b64_data},
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") != 200 or not data.get("data", {}).get("url"):
            raise ValueError(f"图床上传失败: {data.get('error', {}).get('message', '未知错误')}")

        return data["data"]["url"]
