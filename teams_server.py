#!/usr/bin/env python3
"""
2026 학생창의력 챔피언대회 – 팀 데이터 저장 + AI 프록시 서버
필요 패키지: 없음 (Python 표준 라이브러리만 사용)
실행 방법: python teams_server.py
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import json, os, urllib.parse, urllib.request, socket, ssl

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
DATA_FILE  = os.path.join(BASE_DIR, 'teams_data.json')
CONFIG_FILE = os.path.join(BASE_DIR, 'server_config.json')
PORT = 5000
GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent'

# ── 설정 읽기/쓰기 (API 키 저장) ──────────────────────────────────────────

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_config(cfg):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)

# ── 팀 데이터 읽기/쓰기 ───────────────────────────────────────────────────

def load_all():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_all(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ── SSL 컨텍스트 (Windows 인증서 문제 대응) ───────────────────────────────

def make_ssl_ctx():
    ctx = ssl.create_default_context()
    try:
        ctx.load_default_certs()
    except Exception:
        pass
    return ctx

# ── HTTP 핸들러 ───────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print(f"  [{self.client_address[0]}] {fmt % args}")

    def _cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def send_json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    # ── GET ──────────────────────────────────────────────────────────────

    def do_GET(self):
        parts = urllib.parse.urlparse(self.path).path.strip('/').split('/')

        # GET /api/health
        if parts == ['api', 'health']:
            cfg = load_config()
            key = cfg.get('api_key', '').strip()
            valid = key.startswith('AIza') and len(key) > 20
            self.send_json(200, {
                'status': 'ok',
                'version': '1.1',
                'hasKey': valid
            })

        # GET /api/key-status
        elif parts == ['api', 'key-status']:
            cfg = load_config()
            key = cfg.get('api_key', '').strip()
            valid = key.startswith('AIza') and len(key) > 20
            self.send_json(200, {'hasKey': valid})

        # GET /api/teams
        elif parts == ['api', 'teams']:
            data = load_all()
            teams = [{'name': n, 'savedAt': d.get('_savedAt', '')} for n, d in data.items()]
            self.send_json(200, teams)

        # GET /api/team/<팀명>
        elif len(parts) == 3 and parts[:2] == ['api', 'team']:
            team_name = urllib.parse.unquote(parts[2])
            data = load_all()
            self.send_json(200, data.get(team_name, {}))

        else:
            self.send_json(404, {'error': 'not found'})

    # ── POST ─────────────────────────────────────────────────────────────

    def do_POST(self):
        parts = urllib.parse.urlparse(self.path).path.strip('/').split('/')
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length)

        # POST /api/set-key  →  API 키 서버에 저장
        if parts == ['api', 'set-key']:
            try:
                body = json.loads(raw.decode('utf-8'))
                key = body.get('api_key', '').strip()
                if not key:
                    self.send_json(400, {'error': 'api_key is empty'})
                    return
                if not (key.startswith('AIza') and len(key) > 20):
                    self.send_json(400, {'error': 'Gemini API 키 형식이 올바르지 않습니다. AIza 로 시작하는 키를 입력하세요.'})
                    return
                cfg = load_config()
                cfg['api_key'] = key
                save_config(cfg)
                print(f"  → Gemini API 키 저장 완료 (AIza...{key[-6:]})")
                self.send_json(200, {'ok': True})
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        # POST /api/chat  →  Gemini API 프록시 (스트리밍)
        elif parts == ['api', 'chat']:
            cfg = load_config()
            api_key = cfg.get('api_key', '').strip()
            if not api_key:
                self.send_json(401, {'error': '서버에 API 키가 설정되지 않았습니다. 선생님께 문의하세요.'})
                return
            try:
                body = json.loads(raw.decode('utf-8'))
                req_data = json.dumps(body).encode('utf-8')
                gemini_url = f'{GEMINI_URL}?key={urllib.parse.quote(api_key)}&alt=sse'
                req = urllib.request.Request(
                    gemini_url,
                    data=req_data,
                    headers={'Content-Type': 'application/json'}
                )

                # ★ Gemini 연결을 먼저 열고 (헤더 전송 전),
                #   성공해야만 클라이언트에 200을 보낸다
                ssl_ctx = make_ssl_ctx()
                try:
                    resp = urllib.request.urlopen(req, context=ssl_ctx, timeout=90)
                except ssl.SSLError:
                    # SSL 인증서 문제 → 검증 비활성화 재시도
                    ssl_ctx2 = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
                    ssl_ctx2.check_hostname = False
                    ssl_ctx2.verify_mode = ssl.CERT_NONE
                    resp = urllib.request.urlopen(req, context=ssl_ctx2, timeout=90)

                # Gemini가 200 OK를 반환했을 때만 여기에 도달
                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream; charset=utf-8')
                self.send_header('Cache-Control', 'no-cache')
                self.send_header('X-Accel-Buffering', 'no')
                self._cors_headers()
                self.end_headers()

                with resp:
                    while True:
                        chunk = resp.read(2048)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        self.wfile.flush()

            except urllib.error.HTTPError as e:
                err_body = e.read().decode('utf-8', errors='replace')
                try:
                    err_json = json.loads(err_body)
                    msg = err_json.get('error', {}).get('message', err_body)
                except Exception:
                    msg = err_body
                print(f"  → Gemini 오류 {e.code}: {msg[:120]}")
                self.send_json(e.code, {'error': msg})
            except Exception as e:
                print(f"  → Gemini 연결 실패: {e}")
                self.send_json(500, {'error': str(e)})

        # POST /api/team/<팀명>  →  팀 데이터 저장
        elif len(parts) == 3 and parts[:2] == ['api', 'team']:
            team_name = urllib.parse.unquote(parts[2])
            try:
                team_data = json.loads(raw.decode('utf-8'))
                all_data = load_all()
                all_data[team_name] = team_data
                save_all(all_data)
                print(f"  → 팀 저장: [{team_name}]  (총 {len(all_data)}팀)")
                self.send_json(200, {'ok': True, 'team': team_name})
            except Exception as e:
                self.send_json(500, {'error': str(e)})

        else:
            self.send_json(404, {'error': 'not found'})

# ── 로컬 IP ───────────────────────────────────────────────────────────────

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

# ── 메인 ─────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    import sys
    if sys.platform == 'win32':
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

    cfg = load_config()
    has_key = bool(cfg.get('api_key', ''))
    local_ip = get_local_ip()

    class ThreadedServer(ThreadingMixIn, HTTPServer):
        daemon_threads = True  # 메인 종료 시 스레드도 함께 종료

    server = ThreadedServer(('0.0.0.0', PORT), Handler)

    print()
    print("=" * 56)
    print("  [SERVER] 창의력챔피언대회 서버 가동!")
    print("=" * 56)
    print(f"  이 PC:    http://localhost:{PORT}")
    print(f"  다른 PC:  http://{local_ip}:{PORT}")
    print(f"  API 키:   {'설정됨 (학생 접속 가능)' if has_key else '미설정 → 웹 앱에서 설정하세요'}")
    print("  종료:     Ctrl+C")
    print("=" * 56)
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  서버를 종료합니다.")
