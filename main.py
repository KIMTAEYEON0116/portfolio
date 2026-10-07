"""
포트폴리오 자기소개 사이트 - FastAPI 백엔드
- 정적 파일(index.html, style.css, script.js 등) 서빙
- 방명록(Guestbook) REST API (SQLite 저장)
- CORS 설정 포함
"""

from fastapi import FastAPI, HTTPException, Header, Depends, Request, BackgroundTasks
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import sqlite3
import os
import sys
import time
import asyncio
import secrets
import hashlib
import pathlib
import logging
from datetime import datetime
import httpx
from dotenv import load_dotenv

if sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))  # .env 파일 로드 (실행 위치와 무관하게)

# ──────────────────────────────────────────────
# 앱 초기화
# ──────────────────────────────────────────────
logger = logging.getLogger("portfolio")

# API 문서(/docs)는 기본 비공개. 필요할 때만 ENABLE_DOCS=1 로 켠다.
ENABLE_DOCS = os.getenv("ENABLE_DOCS", "0") == "1"

app = FastAPI(
    title="포트폴리오 자기소개 사이트 API",
    description="개인 포트폴리오 사이트의 방명록 데이터를 관리하는 API입니다.",
    version="1.0.0",
    docs_url="/docs" if ENABLE_DOCS else None,
    redoc_url="/redoc" if ENABLE_DOCS else None,
    openapi_url="/openapi.json" if ENABLE_DOCS else None,
)

# ──────────────────────────────────────────────
# 노션 설정
# ──────────────────────────────────────────────
NOTION_TOKEN = os.getenv("NOTION_TOKEN", "")
NOTION_DB_ID = os.getenv("NOTION_DB_ID", "")
NOTION_HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
}

# CORS: 허용 출처를 명시적으로 제한 (배포 시 ALLOWED_ORIGINS 환경변수로 지정)
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:8000,http://127.0.0.1:8000"
    ).split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,          # 쿠키/인증정보를 쓰지 않으므로 비활성
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-Admin-Token"],
)

# ──────────────────────────────────────────────
# 관리자 인증 (방명록 수정/삭제 전용)
# ──────────────────────────────────────────────
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")

# ──────────────────────────────────────────────
# 방명록 알림 메일 (선택 기능)
#   .env 에 SMTP_USER / SMTP_PASSWORD 가 없으면 조용히 비활성화된다.
#   Gmail 은 계정 비밀번호가 아니라 "앱 비밀번호"(16자리)를 넣어야 한다.
# ──────────────────────────────────────────────
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
NOTIFY_TO = os.getenv("NOTIFY_TO", SMTP_USER)
MAIL_ENABLED = bool(SMTP_USER and SMTP_PASSWORD and NOTIFY_TO)


def send_guestbook_mail(entry_id: int, title: str, author: str, content: str, lang: str):
    """새 방명록을 메일로 알린다. 실패해도 예외를 밖으로 내보내지 않는다."""
    if not MAIL_ENABLED:
        return
    try:
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        safe_title = " ".join(title.split())[:60]   # 줄바꿈으로 메일 헤더를 조작하지 못하게
        msg["Subject"] = f"[포트폴리오 방명록] {safe_title}"
        msg["From"] = SMTP_USER
        msg["To"] = NOTIFY_TO
        msg.set_content(
            f"새 방명록이 등록되었습니다.\n\n"
            f"번호   : {entry_id}\n"
            f"작성자 : {author}\n"
            f"언어   : {lang}\n"
            f"제목   : {title}\n"
            f"{'-' * 40}\n"
            f"{content}\n"
        )
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
            smtp.starttls()
            smtp.login(SMTP_USER, SMTP_PASSWORD)
            smtp.send_message(msg)
        logger.info("방명록 알림 메일 발송 완료 (id=%s)", entry_id)
    except Exception as e:
        # 자격증명이 로그에 섞이지 않도록 예외 '유형'만 남긴다
        logger.warning("방명록 알림 메일 발송 실패 (id=%s): %s", entry_id, type(e).__name__)


def require_admin(x_admin_token: str = Header(default="", alias="X-Admin-Token")):
    """방명록 수정/삭제처럼 되돌릴 수 없는 작업에만 적용한다."""
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="관리자 기능이 비활성화되어 있습니다.")
    if not secrets.compare_digest(x_admin_token.encode("utf-8"), ADMIN_TOKEN.encode("utf-8")):
        raise HTTPException(status_code=401, detail="인증에 실패했습니다.")


# ──────────────────────────────────────────────
# 방명록 작성 속도 제한 (IP 기준, 메모리 저장)
# ──────────────────────────────────────────────
RATE_LIMIT_MAX = 5        # IP 하나당 허용 횟수
RATE_LIMIT_WINDOW = 60.0  # 기준 시간(초)
GLOBAL_MAX_PER_HOUR = int(os.getenv("GUESTBOOK_MAX_PER_HOUR", "30"))  # 전체 합계 (알림 메일 폭주 방지)
# nginx 등 리버스 프록시 뒤에서는 모든 요청이 127.0.0.1 로 보인다.
# TRUST_PROXY=1 이면 프록시가 넣어 준 X-Real-IP / X-Forwarded-For 를 쓴다.
TRUST_PROXY = os.getenv("TRUST_PROXY", "0") == "1"
_post_history: dict = {}
_global_posts: list = []


def client_ip(request: Request) -> str:
    if TRUST_PROXY:
        real = request.headers.get("x-real-ip") or request.headers.get("x-forwarded-for", "").split(",")[0]
        if real.strip():
            return real.strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(request: Request):
    global _global_posts
    now = time.monotonic()
    _global_posts = [t for t in _global_posts if now - t < 3600]
    if len(_global_posts) >= GLOBAL_MAX_PER_HOUR:
        raise HTTPException(status_code=429, detail="요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.")
    # 오래된 IP 기록은 지워 메모리가 계속 늘지 않게 한다
    if len(_post_history) > 1000:
        for k in [k for k, v in _post_history.items() if not v or now - v[-1] >= RATE_LIMIT_WINDOW]:
            del _post_history[k]
    ip = client_ip(request)
    recent = [t for t in _post_history.get(ip, []) if now - t < RATE_LIMIT_WINDOW]
    if len(recent) >= RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.")
    recent.append(now)
    _post_history[ip] = recent
    _global_posts.append(now)

# ──────────────────────────────────────────────
# DB 초기화
# ──────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(__file__), "portfolio.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """테이블 생성 (없으면)"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS guestbook (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            title   TEXT    NOT NULL,
            author  TEXT    NOT NULL DEFAULT '匿名',
            content TEXT    NOT NULL,
            date    TEXT    NOT NULL,
            lang    TEXT    DEFAULT 'ja',
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS notion_logs (
            page_id     TEXT PRIMARY KEY,
            date        TEXT NOT NULL,
            title       TEXT NOT NULL,
            content     TEXT NOT NULL DEFAULT '',
            block_count INTEGER NOT NULL DEFAULT 0,
            url         TEXT DEFAULT '',
            fetched_at  TEXT DEFAULT (datetime('now','localtime'))
        )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_notion_logs_date ON notion_logs(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_guestbook_lang ON guestbook(lang, id DESC)")
    conn.commit()
    conn.close()

@app.on_event("startup")
def startup():
    init_db()
    print("✅ DB 초기화 완료 | 서버 시작")

# ──────────────────────────────────────────────
# Pydantic 스키마
# ──────────────────────────────────────────────
class GuestbookEntry(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    author: Optional[str] = Field(None, max_length=40)
    content: str = Field(..., min_length=1, max_length=2000)
    lang: Optional[str] = Field("ja", pattern="^(ja|ko)$")

class GuestbookUpdateEntry(BaseModel):
    """PATCH 요청용 - 모든 필드 선택적"""
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    author: Optional[str] = Field(None, max_length=40)
    content: Optional[str] = Field(None, min_length=1, max_length=2000)

class GuestbookResponse(BaseModel):
    id: int
    title: str
    author: str
    content: str
    date: str
    lang: str

# ──────────────────────────────────────────────
# 방명록 API
# ──────────────────────────────────────────────
@app.get("/api/guestbook", response_model=list[GuestbookResponse], summary="방명록 목록 조회")
def get_guestbook(lang: Optional[str] = None):
    """방명록 전체 목록을 최신순으로 반환합니다. lang 파라미터가 있으면 해당 언어 항목만 필터링합니다."""
    conn = get_db()
    try:
        cursor = conn.cursor()
        if lang:
            cursor.execute(
                "SELECT id, title, author, content, date, lang FROM guestbook WHERE lang = ? ORDER BY id DESC",
                (lang,)
            )
        else:
            cursor.execute(
                "SELECT id, title, author, content, date, lang FROM guestbook ORDER BY id DESC"
            )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


@app.post("/api/guestbook", response_model=GuestbookResponse, status_code=201, summary="방명록 등록",
          dependencies=[Depends(check_rate_limit)])
def post_guestbook(entry: GuestbookEntry, background: BackgroundTasks):
    """새 방명록 항목을 등록합니다. 등록 후 알림 메일을 백그라운드로 보냅니다."""
    if not entry.title.strip() or not entry.content.strip():
        raise HTTPException(status_code=422, detail="제목과 내용은 필수입니다.")

    author = entry.author.strip() if entry.author and entry.author.strip() else "匿名"
    now = datetime.now().strftime("%Y.%m.%d")

    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO guestbook (title, author, content, date, lang) VALUES (?, ?, ?, ?, ?)",
            (entry.title.strip(), author, entry.content.strip(), now, entry.lang)
        )
        new_id = cursor.lastrowid
        conn.commit()

        cursor.execute("SELECT id, title, author, content, date, lang FROM guestbook WHERE id = ?", (new_id,))
        row = cursor.fetchone()
        result = dict(row)
    finally:
        conn.close()

    # 알림 메일은 응답을 지연시키지 않도록 백그라운드로 보낸다.
    # 발송 실패해도 등록은 이미 커밋되어 있으므로 영향이 없다.
    background.add_task(send_guestbook_mail, result["id"], result["title"],
                        result["author"], result["content"], result["lang"])
    return result


@app.patch("/api/guestbook/{entry_id}", response_model=GuestbookResponse, summary="방명록 수정 (관리자 전용)",
           dependencies=[Depends(require_admin)])
def patch_guestbook(entry_id: int, update: GuestbookUpdateEntry):
    """지정한 ID의 방명록 항목을 부분 수정합니다. 전달된 필드만 업데이트됩니다."""
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, author, content, date, lang FROM guestbook WHERE id = ?", (entry_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="해당 항목을 찾을 수 없습니다.")

        current = dict(row)
        new_title   = update.title.strip()   if update.title   is not None else current["title"]
        new_author  = update.author.strip()  if update.author  is not None else current["author"]
        new_content = update.content.strip() if update.content is not None else current["content"]

        if not new_title or not new_content:
            raise HTTPException(status_code=422, detail="제목과 내용은 빈 값으로 수정할 수 없습니다.")

        cursor.execute(
            "UPDATE guestbook SET title = ?, author = ?, content = ? WHERE id = ?",
            (new_title, new_author, new_content, entry_id)
        )
        conn.commit()

        cursor.execute("SELECT id, title, author, content, date, lang FROM guestbook WHERE id = ?", (entry_id,))
        updated_row = cursor.fetchone()
        return dict(updated_row)
    finally:
        conn.close()


@app.delete("/api/guestbook/{entry_id}", status_code=204, summary="방명록 삭제 (관리자 전용)",
            dependencies=[Depends(require_admin)])
def delete_guestbook(entry_id: int):
    """지정한 ID의 방명록 항목을 삭제합니다."""
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM guestbook WHERE id = ?", (entry_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="해당 항목을 찾을 수 없습니다.")
        cursor.execute("DELETE FROM guestbook WHERE id = ?", (entry_id,))
        conn.commit()
    finally:
        conn.close()


# ──────────────────────────────────────────────
# 헬스체크
# ──────────────────────────────────────────────
@app.get("/api/health", summary="서버 상태 확인")
def health():
    return {"status": "ok", "message": "포트폴리오 서버가 정상 동작 중입니다 ✅"}


# ──────────────────────────────────────────────
# 노션 일지 (페이지 본문) 동기화 및 조회
# ──────────────────────────────────────────────
def _rich_text(rich) -> str:
    return "".join(t.get("plain_text", "") for t in (rich or []))


LOG_IMAGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "log_images")
os.makedirs(LOG_IMAGE_DIR, exist_ok=True)

IMAGE_EXT = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif",
    "image/webp": ".webp", "image/svg+xml": ".svg",
}


async def download_log_image(client, block_id: str, url: str):
    """노션 이미지를 log_images/ 에 저장하고 로컬 경로를 반환한다.

    노션 내부 파일 URL은 약 1시간 뒤 만료되므로 그대로 저장하면
    다음 조회 때 전부 깨진다. 동기화 시점에 받아 두어야 한다.
    """
    name_base = hashlib.md5(block_id.encode()).hexdigest()[:16]
    for existing in os.listdir(LOG_IMAGE_DIR):
        if existing.startswith(name_base):
            return "./log_images/" + existing          # 이미 받아 둔 파일
    try:
        res = await client.get(url, timeout=40.0)
        if res.status_code != 200 or len(res.content) < 512:
            return None
        ext = IMAGE_EXT.get(res.headers.get("content-type", "").split(";")[0])
        if not ext:
            ext = os.path.splitext(url.split("?")[0])[1] or ".png"
        fname = name_base + ext
        with open(os.path.join(LOG_IMAGE_DIR, fname), "wb") as f:
            f.write(res.content)
        return "./log_images/" + fname
    except Exception as e:
        logger.warning("이미지 저장 실패 %s: %s", block_id, e)
        return None


def blocks_to_markdown(blocks: list, images: dict = None) -> str:
    """노션 블록 목록을 프런트엔드 파서가 이해하는 마크다운으로 변환한다.

    images: {block_id: 로컬경로} — 미리 내려받은 이미지 경로 매핑.
    """
    images = images or {}
    lines = []
    for b in blocks:
        btype = b.get("type", "")
        body = b.get(btype, {})
        if not isinstance(body, dict):
            continue

        if btype == "code":
            text = _rich_text(body.get("rich_text"))
            if text.strip():
                lang = body.get("language", "") or ""
                lines.append("```" + lang + "\n" + text + "\n```")
            continue

        if btype == "image":
            # 내려받아 둔 로컬 경로를 우선 사용 (노션 내부 URL은 만료됨)
            local = images.get(b.get("id"))
            if not local and body.get("external"):
                local = body["external"].get("url", "")
            if local:
                lines.append("![" + _rich_text(body.get("caption")) + "](" + local + ")")
            continue

        if btype == "divider":
            lines.append("")
            continue

        text = _rich_text(body.get("rich_text")).strip()
        if not text:
            continue

        if btype in ("heading_1", "heading_2", "heading_3"):
            lines.append("## " + text)
        elif btype in ("bulleted_list_item", "numbered_list_item", "to_do", "toggle"):
            lines.append("- " + text)
        elif btype in ("quote", "callout"):
            lines.append("**" + text + "**")
        else:
            lines.append(text)

    return "\n\n".join(lines).strip()


async def fetch_notion_pages() -> list:
    """노션 DB의 모든 페이지(제목/날짜/URL)를 가져온다."""
    url = f"https://api.notion.com/v1/databases/{NOTION_DB_ID}/query"
    body = {"page_size": 100}
    pages = []

    async with httpx.AsyncClient(timeout=20.0) as client:
        while True:
            res = await client.post(url, headers=NOTION_HEADERS, json=body)
            if res.status_code != 200:
                logger.error("Notion DB 조회 실패 %s: %s", res.status_code, res.text[:300])
                raise HTTPException(status_code=502, detail="노션 데이터를 불러오지 못했습니다.")
            data = res.json()

            for page in data.get("results", []):
                props = page.get("properties", {})
                title, date_str = "", ""
                for prop in props.values():
                    if prop.get("type") == "title" and not title:
                        title = _rich_text(prop.get("title"))
                    elif prop.get("type") == "date" and prop.get("date") and not date_str:
                        date_str = prop["date"]["start"][:10]
                if title and date_str:
                    pages.append({"id": page["id"], "title": title,
                                  "date": date_str, "url": page.get("url", "")})

            if not data.get("has_more"):
                break
            body["start_cursor"] = data["next_cursor"]

    return pages


async def fetch_page_blocks(client, page_id: str) -> list:
    """한 페이지의 본문 블록 전체를 가져온다 (페이지네이션 포함)."""
    blocks, start_cursor = [], None
    while True:
        url = f"https://api.notion.com/v1/blocks/{page_id}/children?page_size=100"
        if start_cursor:
            url += f"&start_cursor={start_cursor}"
        res = await client.get(url, headers=NOTION_HEADERS)
        if res.status_code != 200:
            logger.warning("블록 조회 실패 %s: %s", res.status_code, res.text[:200])
            break
        data = res.json()
        blocks.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        start_cursor = data["next_cursor"]
    return blocks


async def sync_notion_logs(progress=None) -> dict:
    """모든 노션 페이지의 본문을 읽어 로컬 DB에 캐시한다."""
    if not NOTION_TOKEN or not NOTION_DB_ID:
        raise HTTPException(status_code=500, detail="노션 설정이 되어 있지 않습니다.")

    pages = await fetch_notion_pages()
    filled = empty = 0

    conn = get_db()
    try:
        cur = conn.cursor()
        async with httpx.AsyncClient(timeout=20.0) as client:
            for idx, page in enumerate(pages):
                blocks = await fetch_page_blocks(client, page["id"])

                # 이미지 블록을 먼저 내려받아 로컬 경로를 확보한다
                images = {}
                for blk in blocks:
                    if blk.get("type") != "image":
                        continue
                    img = blk.get("image", {})
                    src = (img.get("file") or img.get("external") or {}).get("url", "")
                    if not src:
                        continue
                    saved = await download_log_image(client, blk["id"], src)
                    if saved:
                        images[blk["id"]] = saved

                content = blocks_to_markdown(blocks, images)
                if content:
                    filled += 1
                else:
                    empty += 1

                cur.execute(
                    """INSERT INTO notion_logs
                         (page_id, date, title, content, block_count, url, fetched_at)
                       VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
                       ON CONFLICT(page_id) DO UPDATE SET
                         date=excluded.date, title=excluded.title,
                         content=excluded.content, block_count=excluded.block_count,
                         url=excluded.url, fetched_at=excluded.fetched_at""",
                    (page["id"], page["date"], page["title"], content, len(blocks), page["url"])
                )
                if idx % 20 == 0:
                    conn.commit()
                    if progress:
                        progress(idx + 1, len(pages), filled)

                # 노션 API 속도 제한(초당 3회)을 넘지 않도록 간격을 둔다
                await asyncio.sleep(0.34)

        conn.commit()
    finally:
        conn.close()

    return {"total": len(pages), "filled": filled, "empty": empty}


# 노션 원문에는 고객사 이름·개인 메모가 그대로 들어 있다. 사이트 화면은 정리된 logdata.json 만 쓰므로
# 원문 조회는 관리자 전용으로 둔다.
@app.get("/api/logs", summary="일지(노션 페이지 본문) 조회 (관리자 전용)",
         dependencies=[Depends(require_admin)])
def get_logs(include_empty: bool = False):
    """캐시된 노션 일지를 날짜별로 묶어 반환합니다."""
    conn = get_db()
    try:
        cur = conn.cursor()
        sql = "SELECT date, title, content, block_count, url FROM notion_logs"
        if not include_empty:
            sql += " WHERE content != ''"
        sql += " ORDER BY date ASC, title ASC"
        rows = [dict(r) for r in cur.execute(sql).fetchall()]
    finally:
        conn.close()

    grouped = {}
    for row in rows:
        grouped.setdefault(row["date"], []).append({
            "title": row["title"],
            "content": row["content"],
            "blocks": row["block_count"],
            "url": row["url"],
        })
    return grouped


@app.get("/api/logs/stats", summary="일지 통계 (관리자 전용)",
         dependencies=[Depends(require_admin)])
def get_log_stats():
    """히트맵·요약 지표용 집계를 반환합니다."""
    conn = get_db()
    try:
        cur = conn.cursor()
        total, filled = cur.execute(
            "SELECT COUNT(*), SUM(CASE WHEN content != '' THEN 1 ELSE 0 END) FROM notion_logs"
        ).fetchone()
        entries = {r["date"]: r["n"] for r in cur.execute(
            "SELECT date, COUNT(*) AS n FROM notion_logs WHERE content != '' "
            "GROUP BY date ORDER BY date").fetchall()}
        blocks = {r["date"]: r["b"] for r in cur.execute(
            "SELECT date, SUM(block_count) AS b FROM notion_logs WHERE content != '' "
            "GROUP BY date ORDER BY date").fetchall()}
    finally:
        conn.close()

    return {
        "total_pages": total or 0,
        "filled_pages": filled or 0,
        "days_with_content": len(entries),
        "entries_per_day": entries,
        "blocks_per_day": blocks,
    }


@app.post("/api/logs/sync", summary="노션 일지 동기화 (관리자 전용)",
          dependencies=[Depends(require_admin)])
async def post_sync_logs():
    return await sync_notion_logs()


# ──────────────────────────────────────────────
# 정적 파일 서빙 (CSS, JS, 이미지)
# 반드시 API 라우트 뒤에 마운트!
# ──────────────────────────────────────────────
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_ROOT = os.path.realpath(STATIC_DIR)


def resolve_static_path(full_path: str):
    """요청 경로를 STATIC_ROOT 안쪽으로 제한한다. 벗어나면 None을 반환."""
    parts = [p for p in full_path.replace("\\", "/").split("/") if p]
    # .env · .git · .claude 같은 숨김 파일/폴더는 절대 내보내지 않는다
    if any(p.startswith(".") for p in parts):
        return None
    # projects/ 아래는 익명화한 목업만 공개 (고객사 원본 소스 차단)
    if parts and parts[0] == "projects" and parts[:3] != ["projects", "hospital", "mockup"]:
        return None
    candidate = os.path.realpath(os.path.join(STATIC_ROOT, full_path))
    try:
        if os.path.commonpath([STATIC_ROOT, candidate]) != STATIC_ROOT:
            return None
    except ValueError:
        # 드라이브가 다른 경우 등 비교 불가 → 거부
        return None
    return candidate

# 정적 파일 직접 서빙용 확장자 목록
STATIC_EXTENSIONS = {
    ".css", ".js", ".json", ".png", ".jpg", ".jpeg", ".gif", ".svg",
    ".ico", ".webp", ".woff", ".woff2", ".ttf", ".mp4", ".webm", ".pdf", ".html"
}

# HTML·JS·CSS·JSON 은 매번 서버에 바뀌었는지 물어본다(ETag → 바뀌지 않았으면 304).
# 이미지·영상은 하루 동안 브라우저에 둔다. 예전에는 전부 no-store 라 방문할 때마다
# 수십 MB 를 다시 받았다.
NO_CACHE_HEADERS = {"Cache-Control": "no-cache"}
MEDIA_CACHE_HEADERS = {"Cache-Control": "public, max-age=86400"}
MEDIA_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp",
                    ".woff", ".woff2", ".ttf", ".mp4", ".webm", ".pdf"}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    # 다른 사이트가 이 페이지를 iframe 으로 감싸지 못하게 (같은 사이트 안의 목업 iframe 은 허용)
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    return response

SITE_URL = os.getenv("SITE_URL", "").rstrip("/")

NOT_FOUND_HTML = """<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ページが見つかりません</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#EDF2FA;color:#2C3E50;
font-family:'Noto Sans JP','Noto Sans KR',sans-serif}div{text-align:center;padding:24px}
h1{font-size:20px;margin:0 0 8px}p{margin:4px 0;font-size:14px;color:#5B6B7F}a{color:#2C3E50;font-weight:700}</style>
</head><body><div><h1>ページが見つかりません</h1><p>페이지를 찾을 수 없습니다</p>
<p style="margin-top:14px"><a href="/" target="_top">ホームへ戻る / 홈으로</a></p></div></body></html>"""


def _site_origin(request: Request) -> str:
    """og:image 같은 절대 URL 용 출처. SITE_URL 이 있으면 그것을, 없으면 요청에서 만든다."""
    if SITE_URL:
        return SITE_URL
    proto = request.url.scheme
    host = request.headers.get("host", "")
    if TRUST_PROXY:
        proto = request.headers.get("x-forwarded-proto", proto).split(",")[0].strip()
        host = request.headers.get("x-forwarded-host", host).split(",")[0].strip()
    return f"{proto}://{host}" if host else ""


def _index(request: Request):
    """index.html 의 공유 미리보기 이미지(og:image)를 절대 URL 로 바꿔 내보낸다.
    (SNS·메신저 미리보기는 상대 경로 이미지를 읽지 못한다)"""
    index_path = os.path.join(STATIC_DIR, "index.html")
    html = open(index_path, encoding="utf-8").read()
    origin = _site_origin(request)
    if origin:
        html = html.replace('content="og-image.png"', f'content="{origin}/og-image.png"')
    body = html.encode("utf-8")
    etag = '"' + hashlib.md5(body).hexdigest() + '"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, **NO_CACHE_HEADERS})
    return Response(body, media_type="text/html; charset=utf-8", headers={"ETag": etag, **NO_CACHE_HEADERS})


def _file(request: Request, path: str, headers: dict):
    """FileResponse + ETag 재검증: 바뀌지 않은 파일은 본문 없이 304 로 답한다."""
    resp = FileResponse(path, headers=headers, stat_result=os.stat(path))  # stat 을 넘겨야 ETag 가 바로 채워진다
    etag = resp.headers.get("etag")
    if etag and request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, **headers})
    return resp


# HEAD 도 받는다: 링크 미리보기 봇·가동 감시 도구는 GET 전에 HEAD 를 보내는 경우가 있다 (예전엔 405)
@app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
def serve_index(request: Request, full_path: str = ""):
    """정적 파일(.css/.js/.png/.html 등)은 직접 반환, 나머지는 메인 index.html (SPA)"""
    if full_path in ("index.html", "/index.html"):
        return _index(request)
    if full_path:
        file_path = resolve_static_path(full_path)
        if file_path:
            # 디렉토리인 경우 디렉토리 내 index.html 서빙
            if os.path.isdir(file_path):
                sub_index = os.path.join(file_path, "index.html")
                if os.path.isfile(sub_index):
                    return _file(request, sub_index, NO_CACHE_HEADERS)
            elif os.path.isfile(file_path):
                ext = pathlib.Path(full_path).suffix.lower()
                if ext in STATIC_EXTENSIONS:
                    headers = MEDIA_CACHE_HEADERS if ext in MEDIA_EXTENSIONS else NO_CACHE_HEADERS
                    return _file(request, file_path, headers)

        # 정적 파일 확장자인데 실물이 없으면 404 로 알린다.
        # SPA fallback 으로 index.html 을 돌려주면 이미지가 200 으로 응답돼
        # 브라우저가 깨진 이미지를 그리고, onerror 도 늦게 걸린다.
        ext = pathlib.Path(full_path).suffix.lower()
        if ext == ".html":
            # 없는 .html 주소에 홈 화면을 돌려주면, 목업 폴더 안에서는 CSS 를 못 찾아
            # 스타일이 다 빠진 홈 화면이 보였다. 안내 페이지로 404 를 돌려준다.
            return Response(NOT_FOUND_HTML, status_code=404, media_type="text/html; charset=utf-8")
        if ext and ext in STATIC_EXTENSIONS:
            raise HTTPException(status_code=404, detail=f"{full_path} 을(를) 찾을 수 없습니다.")

    if os.path.exists(os.path.join(STATIC_DIR, "index.html")):
        return _index(request)
    raise HTTPException(status_code=404, detail="index.html 파일을 찾을 수 없습니다.")


# ──────────────────────────────────────────────
# 직접 실행 시
# ──────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    # 기본은 로컬 전용. 외부 노출이 필요하면 HOST 환경변수로 지정한다.
    uvicorn.run("main:app", host=os.getenv("HOST", "127.0.0.1"), port=int(os.getenv("PORT", "8000")),
                reload=os.getenv("RELOAD", "0") == "1")
