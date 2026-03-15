# summarizer.py
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

# 注意：JSON示例里所有 { } 都改成 {{ }} 双括号转义
SUMMARY_PROMPT = """你是一个视频内容分析助手。我会给你一段带时间戳的字幕内容，请分析后输出 JSON。

要求：
1. summary：3~5个要点，每条15字以内，直接说结论
2. chapters：关键章节列表，包含标题、开始秒数、一句话描述
3. one_line：整个视频的一句话总结（20字以内）

只输出 JSON，不要其他任何内容，格式如下：
{{
  "one_line": "xxx",
  "summary": ["要点1", "要点2", "要点3"],
  "chapters": [
    {{"title": "章节名", "seconds": 0, "desc": "简介"}}
  ]
}}

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
                    subtitle=subtitle_trimmed
                )
            }
        ],
        temperature=0.3,
    )

    raw = resp.choices[0].message.content.strip()
    print(f"模型原始输出：\n{raw}\n")  # 调试用，确认输出

    # 去掉模型有时会加的 ```json ``` 包裹
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    return json.loads(raw)