import os
import dotenv

from subtitle import get_subtitle_text

dotenv.load_dotenv()
sessdata = os.getenv("BILIBILI_SESSDATA")

bvid = "BV1ooDyBmE6v"

subtitle_text, info = get_subtitle_text(bvid, sessdata)

print(f"subtitle:{subtitle_text}\n info:{info}")