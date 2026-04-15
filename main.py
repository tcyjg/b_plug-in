from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os

from subtitle import get_subtitle_text
from summarizer import summarize, generate_content_report

load_dotenv()
SESSDATA = os.getenv("BILIBILI_SESSDATA", "")
CACHE_TTL_MINUTES = int(os.getenv("SUMMARY_CACHE_TTL_MINUTES", "120"))

app = FastAPI(title="B站视频总结服务")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SummarizeRequest(BaseModel):
    bvid: str
    sessdata: str = ""
    force_refresh: bool = False


# 临时内存缓存：key = bvid
_summary_cache: dict[str, dict] = {}


def _clear_expired_cache() -> None:
    now = datetime.utcnow()
    expire_keys = []
    for key, payload in _summary_cache.items():
        expire_at = payload.get("expire_at")
        if isinstance(expire_at, datetime) and expire_at <= now:
            expire_keys.append(key)

    for key in expire_keys:
        _summary_cache.pop(key, None)


@app.post("/summarize")
async def summarize_video(req: SummarizeRequest):
    sessdata = req.sessdata or SESSDATA

    if not sessdata:
        raise HTTPException(400, "需要 B 站登录态 SESSDATA")

    _clear_expired_cache()
    key = req.bvid

    if not req.force_refresh and key in _summary_cache:
        cached = _summary_cache[key]["data"].copy()
        cached["cached"] = True
        return cached

    subtitle_text, info = await get_subtitle_text(req.bvid, sessdata)

    if not subtitle_text:
        raise HTTPException(422, f"视频《{info['title']}》没有找到字幕，暂不支持")

    result = summarize(info["title"], subtitle_text)
    result["title"] = info["title"]
    result["bvid"] = req.bvid
    result["cached"] = False

    _summary_cache[key] = {
        "data": result,
        "expire_at": datetime.utcnow() + timedelta(minutes=CACHE_TTL_MINUTES),
    }

    return result


class ReportRequest(BaseModel):
    bvid: str
    sessdata: str = ""
    force_refresh: bool = False


# 报告缓存：key = bvid
_report_cache: dict[str, dict] = {}


@app.post("/report")
async def generate_report(req: ReportRequest):
    """生成详细的视频内容报告，包含关键时间点"""
    sessdata = req.sessdata or SESSDATA

    if not sessdata:
        raise HTTPException(400, "需要 B 站登录态 SESSDATA")

    _clear_expired_cache()
    key = f"report_{req.bvid}"

    if not req.force_refresh and key in _report_cache:
        cached = _report_cache[key]["data"].copy()
        cached["cached"] = True
        return cached

    subtitle_text, info = await get_subtitle_text(req.bvid, sessdata)

    if not subtitle_text:
        raise HTTPException(422, f"视频《{info['title']}》没有找到字幕，暂不支持")

    result = generate_content_report(info["title"], subtitle_text)
    result["title"] = info["title"]
    result["bvid"] = req.bvid
    result["cached"] = False

    _report_cache[key] = {
        "data": result,
        "expire_at": datetime.utcnow() + timedelta(minutes=CACHE_TTL_MINUTES),
    }

    return result


@app.get("/health")
def health():
    return {"status": "ok", "cache_size": len(_summary_cache)}
