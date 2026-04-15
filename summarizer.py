from openai import OpenAI
import os
import json
import re
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    api_key=os.getenv("DASHSCOPE_API_KEY"),
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
)

SUMMARY_PROMPT = """你是一个视频内容分析助手。我会给你一段带时间戳的字幕内容，请分析后输出 JSON。

要求：
1. summary：3~5 个要点，每条 15 字以内
2. chapters：关键章节列表，包含标题、开始秒数、一句话描述
3. one_line：整段视频的一句话总结（20 字以内）
4. flowchart_uml：输出 Mermaid flowchart 语法，提炼视频核心思想流转过程（6~12 个节点）

只输出 JSON，不要输出任何其他内容，格式如下：
{{
  "one_line": "xxx",
  "summary": ["要点1", "要点2", "要点3"],
  "chapters": [
    {{"title": "章节名", "seconds": 0, "desc": "简介"}}
  ],
  "flowchart_uml": "flowchart TD\\n  A[核心问题] --> B[关键观点]"
}}

Mermaid 约束：
- 仅使用 `flowchart TD`
- 节点文案尽量短（2~10 字）
- 关系箭头统一使用 `-->`

视频标题：{title}
字幕内容：
{subtitle}
"""


def summarize(title: str, subtitle_text: str) -> dict:
    subtitle_trimmed = subtitle_text[:12000]

    resp = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {
                "role": "system",
                "content": "你是视频内容分析助手，只输出合法 JSON，不输出任何其他内容。"
            },
            {
                "role": "user",
                "content": SUMMARY_PROMPT.format(
                    title=title,
                    subtitle=subtitle_trimmed,
                )
            }
        ],
        temperature=0.3,
    )

    raw = resp.choices[0].message.content.strip()
    print(f"模型原始输出：\n{raw}\n")

    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        matched = re.search(r"\{[\s\S]*\}", raw)
        if not matched:
            raise
        data = json.loads(matched.group(0))

    data.setdefault("one_line", "")
    data.setdefault("summary", [])
    data.setdefault("chapters", [])

    flowchart_uml = str(data.get("flowchart_uml") or "").strip()
    if not flowchart_uml:
        flowchart_uml = "flowchart TD\n  A[视频主题] --> B[核心观点]\n  B --> C[关键结论]"
    if not flowchart_uml.startswith("flowchart TD"):
        flowchart_uml = "flowchart TD\n  A[视频主题] --> B[核心观点]\n  B --> C[关键结论]"
    data["flowchart_uml"] = flowchart_uml

    return data


CONTENT_REPORT_PROMPT = """你是一个视频内容分析助手。我会给你一段带时间戳的字幕内容，请生成一份详细的视频内容报告。

要求：
1. overview：对视频整体内容的详细概述（150~300字）
2. sections：按时间线划分关键事件/内容段落（6~15个段落），每个段落包含：
   - timestamp：该段落开始的秒数
   - title：段落标题（10字以内）
   - content：段落详细内容描述（30~80字）
   - is_keyframe：是否为关键画面/转折点/重要内容，标记为true的段落将在报告中配截图（6~8个即可）

只输出 JSON，不要输出任何其他内容，格式如下：
{{
  "overview": "视频整体内容概述",
  "sections": [
    {{"timestamp": 0, "title": "段落标题", "content": "详细描述", "is_keyframe": true}},
    {{"timestamp": 30, "title": "段落标题", "content": "详细描述", "is_keyframe": false}}
  ]
}}

视频标题：{title}
字幕内容：
{subtitle}
"""


def generate_content_report(title: str, subtitle_text: str) -> dict:
    """生成详细的视频内容报告，包含关键时间点用于截图"""
    subtitle_trimmed = subtitle_text[:12000]

    resp = client.chat.completions.create(
        model="qwen-plus",
        messages=[
            {
                "role": "system",
                "content": "你是视频内容分析助手，只输出合法 JSON，不输出任何其他内容。"
            },
            {
                "role": "user",
                "content": CONTENT_REPORT_PROMPT.format(
                    title=title,
                    subtitle=subtitle_trimmed,
                )
            }
        ],
        temperature=0.3,
    )

    raw = resp.choices[0].message.content.strip()
    print(f"报告模型原始输出：\n{raw}\n")

    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        matched = re.search(r"\{[\s\S]*\}", raw)
        if not matched:
            raise
        data = json.loads(matched.group(0))

    data.setdefault("overview", "")
    data.setdefault("sections", [])

    for sec in data["sections"]:
        sec.setdefault("timestamp", 0)
        sec.setdefault("title", "")
        sec.setdefault("content", "")
        sec.setdefault("is_keyframe", False)

    return data
