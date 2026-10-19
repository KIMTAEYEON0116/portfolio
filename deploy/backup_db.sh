#!/usr/bin/env bash
# 방명록 DB(portfolio.db) 를 하루 1회 복사해 둔다 (setup.sh 가 cron 에 등록: 매일 03:20 JST).
# 보관: 14일. 복구: cp ~/portfolio/backups/portfolio-YYYYMMDD.db ~/portfolio/portfolio.db && sudo systemctl restart portfolio
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$APP/backups"
mkdir -p "$DIR"
OUT="$DIR/portfolio-$(date +%Y%m%d).db"
if command -v sqlite3 >/dev/null; then
  sqlite3 "$APP/portfolio.db" ".backup '$OUT'"      # 쓰는 도중이어도 깨지지 않는 복사
else
  cp "$APP/portfolio.db" "$OUT"
fi
find "$DIR" -name "portfolio-*.db" -mtime +14 -delete
echo "$(date "+%F %T") backup ok: $OUT ($(stat -c %s "$OUT") bytes)"
