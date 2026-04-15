import asyncio
from github_push import push_markdown


async def main():
    content = "# 测试报告\n\n这是一条来自 B站视频速览工具的测试推送。\n\n> 时间: 测试时间"
    print("正在推送测试文件到 GitHub...")
    try:
        url = await push_markdown("test.md", content, "test: 测试 GitHub 推送")
        print(f"推送成功！\n文件地址: {url}")
    except Exception as e:
        print(f"推送失败: {e}")


asyncio.run(main())
