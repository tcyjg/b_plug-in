import json
import re

from openai import OpenAI

from config_store import get_config

SUMMARY_PROMPT = """请你根据视频字幕内容，输出结构化总结 JSON。
要求：
1. summary: 3~5 条关键总结，每条尽量简洁
2. chapters: 若干章节，每个包含 title / seconds / desc
3. one_line: 一句话概括
4. flowchart_uml: Mermaid flowchart TD，描述视频逻辑流程

请只返回 JSON，不要额外解释。

视频标题：{title}
字幕内容：
{subtitle}
"""

CONTENT_REPORT_PROMPT = """
请根据视频字幕生成结构化内容报告，并只返回 JSON：
1. overview: 用 150~300 字概括视频核心内容
2. sections: 输出若干分段，每段包含
   - timestamp: 起始秒数
   - title: 该段标题
   - content: 该段内容摘要，帮助读者通过文字了解视频讲了什么
   - is_keyframe: 是否值得抓取关键画面

视频标题：{title}
字幕内容：
{subtitle}
"""


def _create_client() -> OpenAI:
    api_key = get_config("DASHSCOPE_API_KEY")
    if not api_key:
        raise ValueError("Missing DASHSCOPE_API_KEY")
    return OpenAI(
        api_key=api_key,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    )


def _parse_json_response(raw: str) -> dict:
    clean = re.sub(r"^```json\s*", "", raw.strip())
    clean = re.sub(r"\s*```$", "", clean)
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        matched = re.search(r"\{[\s\S]*\}", clean)
        if not matched:
            raise
        return json.loads(matched.group(0))


def summarize(title: str, subtitle_text: str) -> dict:
    client = _create_client()
    subtitle_trimmed = subtitle_text[:12000]

    resp = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {"role": "system", "content": "你是一个只输出 JSON 的视频总结助手。"},
            {"role": "user", "content": SUMMARY_PROMPT.format(title=title, subtitle=subtitle_trimmed)},
        ],
        temperature=0.3,
    )

    raw = resp.choices[0].message.content.strip()
    data = _parse_json_response(raw)
    data.setdefault("one_line", "")
    data.setdefault("summary", [])
    data.setdefault("chapters", [])

    flowchart_uml = str(data.get("flowchart_uml") or "").strip()
    if not flowchart_uml.startswith("flowchart TD"):
        flowchart_uml = "flowchart TD\n  A[开始] --> B[视频内容解析]\n  B --> C[输出总结]"
    data["flowchart_uml"] = flowchart_uml
    return data


def generate_content_report(title: str, subtitle_text: str) -> dict:
    client = _create_client()
    subtitle_trimmed = subtitle_text[:12000]

    resp = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {"role": "system", "content": "你是一个只输出 JSON 的视频内容报告助手。"},
            {"role": "user", "content": CONTENT_REPORT_PROMPT.format(title=title, subtitle=subtitle_trimmed)},
        ],
        temperature=0.3,
    )

    raw = resp.choices[0].message.content.strip()
    data = _parse_json_response(raw)
    data.setdefault("overview", "")
    data.setdefault("sections", [])
    for sec in data["sections"]:
        sec.setdefault("timestamp", 0)
        sec.setdefault("title", "")
        sec.setdefault("content", "")
        sec.setdefault("is_keyframe", False)
    return data
