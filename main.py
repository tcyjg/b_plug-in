from datetime import datetime, timedelta
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from github_push import push_markdown
from image_host import upload_base64_image
from subtitle import get_subtitle_text
from summarizer import generate_content_report, summarize
from video_capture import capture_frames

load_dotenv()

SESSDATA = os.getenv("BILIBILI_SESSDATA", "")
CACHE_TTL_MINUTES = int(os.getenv("SUMMARY_CACHE_TTL_MINUTES", "120"))

app = FastAPI(title="Bilibili Video Summary Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SummarizeRequest(BaseModel):
    bvid: str
    page: int = Field(default=1, ge=1)
    sessdata: str = ""
    force_refresh: bool = False


class ReportRequest(BaseModel):
    bvid: str
    page: int = Field(default=1, ge=1)
    sessdata: str = ""
    force_refresh: bool = False


class UploadImageRequest(BaseModel):
    image: str


class PushReportRequest(BaseModel):
    filename: str
    content: str
    message: str = ""


class CaptureFramesRequest(BaseModel):
    bvid: str
    page: int = Field(default=1, ge=1)
    sessdata: str = ""
    timestamps: list[int]


_summary_cache: dict[str, dict] = {}
_report_cache: dict[str, dict] = {}


def _cache_key(prefix: str, bvid: str, page: int) -> str:
    return f"{prefix}:{bvid}:p{page}"


def _clear_expired_cache() -> None:
    now = datetime.utcnow()
    for cache in (_summary_cache, _report_cache):
        expired = [key for key, payload in cache.items() if isinstance(payload.get("expire_at"), datetime) and payload["expire_at"] <= now]
        for key in expired:
            cache.pop(key, None)


def _resolve_sessdata(sessdata: str) -> str:
    return sessdata or SESSDATA


@app.post("/summarize")
async def summarize_video(req: SummarizeRequest):
    sessdata = _resolve_sessdata(req.sessdata)
    if not sessdata:
        raise HTTPException(400, "Missing Bilibili SESSDATA")

    _clear_expired_cache()
    key = _cache_key("summary", req.bvid, req.page)
    if not req.force_refresh and key in _summary_cache:
        cached = _summary_cache[key]["data"].copy()
        cached["cached"] = True
        return cached

    subtitle_text, info = await get_subtitle_text(req.bvid, sessdata, req.page)
    if not subtitle_text:
        raise HTTPException(422, f"No subtitle found for {info['title']}")

    result = summarize(info["title"], subtitle_text)
    result["title"] = info["title"]
    result["bvid"] = req.bvid
    result["page"] = info["page"]
    result["cached"] = False

    _summary_cache[key] = {
        "data": result,
        "expire_at": datetime.utcnow() + timedelta(minutes=CACHE_TTL_MINUTES),
    }
    return result


@app.post("/report")
async def generate_report(req: ReportRequest):
    sessdata = _resolve_sessdata(req.sessdata)
    if not sessdata:
        raise HTTPException(400, "Missing Bilibili SESSDATA")

    _clear_expired_cache()
    key = _cache_key("report", req.bvid, req.page)
    if not req.force_refresh and key in _report_cache:
        cached = _report_cache[key]["data"].copy()
        cached["cached"] = True
        return cached

    subtitle_text, info = await get_subtitle_text(req.bvid, sessdata, req.page)
    if not subtitle_text:
        raise HTTPException(422, f"No subtitle found for {info['title']}")

    result = generate_content_report(info["title"], subtitle_text)
    result["title"] = info["title"]
    result["bvid"] = req.bvid
    result["page"] = info["page"]
    result["cached"] = False

    _report_cache[key] = {
        "data": result,
        "expire_at": datetime.utcnow() + timedelta(minutes=CACHE_TTL_MINUTES),
    }
    return result


@app.post("/upload-image")
async def upload_image(req: UploadImageRequest):
    try:
        return {"url": await upload_base64_image(req.image)}
    except Exception as exc:
        raise HTTPException(500, f"Image upload failed: {exc}")


@app.post("/capture-frames")
async def capture_frames_endpoint(req: CaptureFramesRequest):
    sessdata = _resolve_sessdata(req.sessdata)
    if not sessdata:
        raise HTTPException(400, "Missing Bilibili SESSDATA")

    try:
        result = await capture_frames(req.bvid, sessdata, req.timestamps, req.page)
        return {"frames": {str(k): v for k, v in result.items()}}
    except Exception as exc:
        raise HTTPException(500, f"Capture frames failed: {exc}")


@app.post("/push-report")
async def push_report(req: PushReportRequest):
    try:
        return {"url": await push_markdown(req.filename, req.content, req.message)}
    except Exception as exc:
        raise HTTPException(500, f"GitHub push failed: {exc}")


@app.get("/health")
def health():
    return {"status": "ok", "summary_cache_size": len(_summary_cache), "report_cache_size": len(_report_cache)}
