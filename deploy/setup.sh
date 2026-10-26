#!/usr/bin/env bash
# EC2(Ubuntu) 첫 설정 — 사이트 파일을 /home/ubuntu/portfolio 에 올린 뒤 한 번 실행한다.
#   cd ~/portfolio && bash deploy/setup.sh
# 다시 실행해도 안전하다(이미 된 단계는 건너뛰거나 덮어쓴다).
set -euo pipefail
APP=/home/ubuntu/portfolio
cd "$APP"

echo "[1/7] 패키지 설치 (python, nginx, sqlite3)"
sudo apt-get update -y
sudo apt-get install -y python3-venv python3-pip nginx sqlite3 fail2ban

echo "[2/7] 가상환경 + 라이브러리"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

echo "[3/7] .env 확인"
if [ ! -f .env ]; then
  cp .env.example .env
  # 배포 기본값: 외부에는 nginx 만 열고, 앱은 내부(127.0.0.1)에서만 받는다
  sed -i 's/^RELOAD=.*/RELOAD=0/; s/^TRUST_PROXY=.*/TRUST_PROXY=1/; s/^HOST=.*/HOST=127.0.0.1/' .env
  echo "  .env 를 만들었습니다. 필요하면 SITE_URL·ALLOWED_ORIGINS·SMTP 값을 채우세요: nano $APP/.env"
fi
chmod 600 .env

echo "[4/7] 자동 실행 서비스 등록"
sudo cp deploy/portfolio.service /etc/systemd/system/portfolio.service
sudo systemctl daemon-reload
sudo systemctl enable --now portfolio
sudo systemctl restart portfolio

echo "[5/7] nginx 연결"
sudo cp deploy/nginx-portfolio.conf /etc/nginx/sites-available/portfolio
sudo ln -sf /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/portfolio
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

echo "[6/7] fail2ban — 404·429·403 을 2분에 30번 넘게 내는 IP 를 1시간 차단"
sudo cp deploy/fail2ban-portfolio.conf /etc/fail2ban/filter.d/portfolio-abuse.conf
sudo cp deploy/fail2ban-portfolio.local /etc/fail2ban/jail.d/portfolio.local
sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban

echo "[7/7] 방명록 DB 하루 1회 백업 (03:20 JST, 14일 보관)"
chmod +x "$APP/deploy/backup_db.sh"
# crontab 이 아직 없으면 crontab -l 이 실패하는데, set -e 때문에 서브셸이 거기서 끝나 빈 목록이 등록되던 문제가 있었다
( crontab -l 2>/dev/null || true ) | grep -v "backup_db.sh" > /tmp/portfolio_cron.txt || true
echo "20 18 * * * bash $APP/deploy/backup_db.sh >> $APP/backups/backup.log 2>&1" >> /tmp/portfolio_cron.txt
crontab /tmp/portfolio_cron.txt && rm -f /tmp/portfolio_cron.txt

sleep 2
if curl -fs http://127.0.0.1/api/health >/dev/null; then
  echo "완료: 브라우저에서 http://<EC2 공인 IP>/ 로 접속해 보세요."
else
  echo "앱이 응답하지 않습니다. 로그: sudo journalctl -u portfolio -n 50 --no-pager"
fi
