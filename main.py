# main.py
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import os

from subtitle import get_subtitle_text
from summarizer import summarize

load_dotenv()
SESSDATA = os.getenv("BILIBILI_SESSDATA", "")

app = FastAPI(title="B站视频总结服务")

# 允许插件跨域调用
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class SummarizeRequest(BaseModel):
    bvid: str
    sessdata: str = ""  # 插件可以把浏览器 cookie 传过来

@app.post("/summarize")
async def summarize_video(req: SummarizeRequest):
    # 优先用请求里传来的 sessdata，没有就用 .env 里的
    sessdata = req.sessdata or SESSDATA

    if not sessdata:
        raise HTTPException(400, "需要 B站登录态 SESSDATA")

    # 获取字幕
    subtitle_text, info = await get_subtitle_text(req.bvid, sessdata)

    if not subtitle_text:
        raise HTTPException(422, f"视频《{info['title']}》没有找到字幕，暂不支持")

    # AI 总结
    result = summarize(info["title"], subtitle_text)
    result["title"] = info["title"]
    result["bvid"] = req.bvid

    return result

@app.get("/health")
def health():
    return {"status": "ok"}