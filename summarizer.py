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

输出风格：{style}

要求：
1. summary：3~5 个要点，每条 15 字以内
2. chapters：关键章节列表，包含标题、开始秒数、一句话描述
3. one_line：整段视频的一句话总结（20 字以内）
4. knowledge_graph：提炼视频知识图谱，节点 4~8 个、关系 4~10 条

只输出 JSON，不要输出任何其他内容，格式如下：
{{
  "one_line": "xxx",
  "summary": ["要点1", "要点2", "要点3"],
  "chapters": [
    {{"title": "章节名", "seconds": 0, "desc": "简介"}}
  ],
  "knowledge_graph": {{
    "nodes": [
      {{"id": "n1", "label": "概念A", "type": "concept"}}
    ],
    "edges": [
      {{"source": "n1", "target": "n2", "relation": "影响"}}
    ]
  }}
}}

视频标题：{title}
字幕内容：
{subtitle}
"""

def summarize(title: str, subtitle_text: str, style: str = "专业") -> dict:
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
                    style=style,
                )
            }
        ],
        temperature=0.3,
    )

    raw = resp.choices[0].message.content.strip()
    print(f"模型原始输出：\n{raw}\n")

    # 去掉模型有时会加的 ```json ``` 包裹
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
    knowledge_graph = data.setdefault("knowledge_graph", {})
    knowledge_graph.setdefault("nodes", [])
    knowledge_graph.setdefault("edges", [])
    return data
