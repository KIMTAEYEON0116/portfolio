#!/usr/bin/env bash
# EC2(Ubuntu) 첫 설정 — 사이트 파일을 /home/ubuntu/portfolio 에 올린 뒤 한 번 실행한다.
#   cd ~/portfolio && bash deploy/setup.sh
# 다시 실행해도 안전하다(이미 된 단계는 건너뛰거나 덮어쓴다).
set -euo pipefail
APP=/home/ubuntu/portfolio
cd "$APP"

echo "[1/5] 패키지 설치 (python, nginx)"
sudo apt-get update -y
sudo apt-get install -y python3-venv python3-pip nginx

echo "[2/5] 가상환경 + 라이브러리"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt

echo "[3/5] .env 확인"
if [ ! -f .env ]; then
  cp .env.example .env
  # 배포 기본값: 외부에는 nginx 만 열고, 앱은 내부(127.0.0.1)에서만 받는다
  sed -i 's/^RELOAD=.*/RELOAD=0/; s/^TRUST_PROXY=.*/TRUST_PROXY=1/; s/^HOST=.*/HOST=127.0.0.1/' .env
  echo "  .env 를 만들었습니다. 필요하면 SITE_URL·ALLOWED_ORIGINS·SMTP 값을 채우세요: nano $APP/.env"
fi
chmod 600 .env

echo "[4/5] 자동 실행 서비스 등록"
sudo cp deploy/portfolio.service /etc/systemd/system/portfolio.service
sudo systemctl daemon-reload
sudo systemctl enable --now portfolio
sudo systemctl restart portfolio

echo "[5/5] nginx 연결"
sudo cp deploy/nginx-portfolio.conf /etc/nginx/sites-available/portfolio
sudo ln -sf /etc/nginx/sites-available/portfolio /etc/nginx/sites-enabled/portfolio
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

sleep 2
if curl -fs http://127.0.0.1/api/health >/dev/null; then
  echo "완료: 브라우저에서 http://<EC2 공인 IP>/ 로 접속해 보세요."
else
  echo "앱이 응답하지 않습니다. 로그: sudo journalctl -u portfolio -n 50 --no-pager"
fi
