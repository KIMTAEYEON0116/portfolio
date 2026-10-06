"""
노션 일지 동기화 스크립트

노션 DB의 모든 페이지 본문을 읽어 portfolio.db(notion_logs 테이블)에 캐시합니다.
일지를 새로 쓰거나 수정한 뒤 아래 명령으로 갱신하세요.

    python sync_notion.py
"""

import asyncio
import sys

from main import init_db, sync_notion_logs

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")


def show_progress(done: int, total: int, filled: int):
    pct = done * 100 // total if total else 0
    print(f"  {done:4d}/{total}  ({pct:3d}%)  내용 있음 {filled}건", flush=True)


async def main():
    init_db()
    print("노션 일지 동기화를 시작합니다...", flush=True)
    result = await sync_notion_logs(progress=show_progress)
    print("\n동기화 완료")
    print(f"  전체 페이지 : {result['total']}건")
    print(f"  내용 있음   : {result['filled']}건")
    print(f"  비어 있음   : {result['empty']}건")


if __name__ == "__main__":
    asyncio.run(main())
