import httpx

from config_store import get_config

IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload"


async def upload_base64_image(b64_data: str) -> str:
    api_key = get_config("IMGBB_API_KEY")
    if not api_key:
        raise ValueError("Missing IMGBB_API_KEY")

    if b64_data.startswith("data:"):
        b64_data = b64_data.split(",", 1)[1]

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(IMGBB_UPLOAD_URL, data={"key": api_key, "image": b64_data})
        resp.raise_for_status()
        data = resp.json()
        if data.get("status") != 200 or not data.get("data", {}).get("url"):
            raise ValueError(f"Image upload failed: {data.get('error', {}).get('message', 'unknown error')}")
        return data["data"]["url"]
