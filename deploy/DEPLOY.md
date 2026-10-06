# EC2 배포 순서 (Ubuntu 24.04 기준)

## 0. 준비물
- 공개용 폴더 `Desktop\취업양성\portfolio_public` (작업 폴더 SAMPLE 은 올리지 않는다)
- 발표 영상 2개 (`presentation.mp4`, `hospital_presentation.mp4`) — 공개 폴더에는 빠져 있다
- EC2 키 파일 (`*.pem`)

## 1. EC2 만들기 (AWS 콘솔)
1. EC2 → 인스턴스 시작 → **Ubuntu Server 24.04 LTS**, 유형 `t3.micro`(또는 t2.micro), 스토리지 16GB
2. 키 페어 생성 → `.pem` 내려받기
3. 보안 그룹 인바운드 규칙
   - SSH 22 — **내 IP** 만
   - HTTP 80 — 0.0.0.0/0
   - HTTPS 443 — 0.0.0.0/0 (도메인을 붙일 경우)
4. (권장) 탄력적 IP 를 만들어 인스턴스에 연결 — 재시작해도 주소가 바뀌지 않는다

## 2. 키 파일 권한 (Windows PowerShell, 처음 한 번)
```powershell
icacls "C:\경로\내키.pem" /inheritance:r /grant:r "$($env:USERNAME):(R)"
```

## 3. 파일 올리기 (PowerShell)
```powershell
scp -i "C:\경로\내키.pem" -r "C:\Users\USER\Desktop\취업양성\portfolio_public" ubuntu@<공인IP>:/home/ubuntu/portfolio
scp -i "C:\경로\내키.pem" "<영상 폴더>\presentation.mp4" "<영상 폴더>\hospital_presentation.mp4" ubuntu@<공인IP>:/home/ubuntu/portfolio/
```
GitHub 에 올렸다면 서버에서 `git clone https://github.com/KIMTAEYEON0116/portfolio.git ~/portfolio` 로 받아도 된다(영상은 따로 scp).

## 4. 서버 설정 (SSH 접속 후)
```bash
ssh -i "C:\경로\내키.pem" ubuntu@<공인IP>
cd ~/portfolio && bash deploy/setup.sh
```
끝나면 브라우저에서 `http://<공인IP>/` 확인.

## 5. 도메인 + HTTPS (권장)
1. 도메인 DNS 에 A 레코드 → 공인 IP
2. `/etc/nginx/sites-available/portfolio` 의 `server_name _;` 을 `server_name 내도메인;` 으로
3. ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d 내도메인
   ```
4. `.env` 에 `SITE_URL=https://내도메인`, `ALLOWED_ORIGINS=https://내도메인` → `sudo systemctl restart portfolio`

## 고친 내용 반영 (다음부터)
1. PC: `python SAMPLE/tools/export_public.py --commit "変更内容"`
2. scp 로 다시 올리거나(서버의 `.env`·`portfolio.db`·영상은 건드리지 않게 폴더째 지우지 말 것), GitHub 이면 서버에서 `git pull`
3. `sudo systemctl restart portfolio`

## 자주 쓰는 명령
| 하고 싶은 것 | 명령 |
|---|---|
| 상태 확인 | `sudo systemctl status portfolio` |
| 로그 보기 | `sudo journalctl -u portfolio -n 100 --no-pager` |
| 재시작 | `sudo systemctl restart portfolio` |
| 방명록 DB 백업(PC로) | `scp -i 내키.pem ubuntu@<공인IP>:/home/ubuntu/portfolio/portfolio.db .` |
