"""engine-test용 로컬 서버: 정적 파일 + 로그 받기.

python test/log-server.py  (저장소 루트에서)
→ 아이패드(같은 와이파이)에서 http://<PC IP>:8765/test/engine.html
→ 페이지가 로그를 5초마다 POST /log 로 보내고, logs/engine-YYYY-MM-DD.txt 에 쌓인다.
"""
import datetime, http.server, json, os, socket, urllib.parse
import sys
# 창 없이(pythonw, 작업 스케줄러) 켜면 출력할 곳이 없어 요청마다 죽음 → 버림통으로
if sys.stdout is None: sys.stdout = open(os.devnull, 'w')
if sys.stderr is None: sys.stderr = open(os.devnull, 'w')

PORT = 8765
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_DIR = os.path.join(ROOT, 'logs')
# 음원 서랍(PLAN-실험실): 선생님 주소에서만. 상자에선 DRAWER=/drawer(C:\덕구box\음원서랍), 없으면 꺼짐
DRAWER = os.environ.get('DRAWER', '')
AUDIO_EXT = ('.m4a', '.mp3', '.wav', '.aac', '.ogg', '.flac', '.mp4', '.webm', '.opus')
DRAWER_MAX = 300 * 1048576


def drawer_path(name):
    # 이름만 받음(폴더 넘나들기 막기)
    name = os.path.basename(urllib.parse.unquote(name)).strip()
    if not name or name.startswith('.') or not name.lower().endswith(AUDIO_EXT): return None
    return os.path.join(DRAWER, name)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_GET(self):
        # 주소만 치면 엔진 화면으로, 로그 폴더는 밖에서 못 보게
        if self.path in ('/', '/index.html'):
            self.send_response(302); self.send_header('Location', '/test/engine.html'); self.end_headers(); return
        if self.path.startswith('/logs'):
            self.send_error(404); return
        if self.path.startswith('/drawer/'):
            return self.drawer_get()
        super().do_GET()

    def send_json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code); self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)

    def drawer_get(self):
        if not DRAWER or not os.path.isdir(DRAWER): return self.send_json({'error': '서랍 없음'}, 404)
        if self.path.split('?')[0] == '/drawer/list':
            items = [{'name': e.name, 'size': e.stat().st_size, 'mtime': int(e.stat().st_mtime)}
                     for e in os.scandir(DRAWER) if e.is_file() and drawer_path(e.name)]
            return self.send_json(sorted(items, key=lambda x: -x['mtime']))
        if self.path.startswith('/drawer/f/'):
            p = drawer_path(self.path[len('/drawer/f/'):].split('?')[0])
            if not p or not os.path.isfile(p): return self.send_error(404)
            self.send_response(200); self.send_header('Content-Type', self.guess_type(p))
            self.send_header('Content-Length', str(os.path.getsize(p))); self.end_headers()
            with open(p, 'rb') as f:
                while (c := f.read(1 << 20)): self.wfile.write(c)
            return
        self.send_error(404)

    def drawer_put(self):
        # POST /drawer/up?name=곡.m4a  (본문 = 파일 그대로). 같은 이름 있으면 (2)(3)… 붙임
        if not DRAWER or not os.path.isdir(DRAWER): return self.send_json({'error': '서랍 없음'}, 404)
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        n = int(self.headers.get('Content-Length', 0))
        p = drawer_path((q.get('name') or [''])[0])
        if not p: return self.send_json({'error': '소리 파일 이름이 아니에요'}, 400)
        if n <= 0 or n > DRAWER_MAX: return self.send_json({'error': '파일이 비었거나 너무 커요(300MB까지)'}, 400)
        base, ext = os.path.splitext(p); i = 2
        while os.path.exists(p): p = f'{base} ({i}){ext}'; i += 1
        tmp = p + '.part'
        with open(tmp, 'wb') as f:
            left = n
            while left > 0:
                c = self.rfile.read(min(left, 1 << 20))
                if not c: break
                f.write(c); left -= len(c)
        if left > 0: os.remove(tmp); return self.send_json({'error': '올리다 끊겼어요'}, 400)
        os.replace(tmp, p)
        self.send_json({'name': os.path.basename(p)})

    def do_POST(self):
        if self.path.startswith('/drawer/up'):
            return self.drawer_put()
        # /log = 엔진 검증 창, /log-app = 앱(app/) — 파일을 따로 쌓는다
        if self.path not in ('/log', '/log-app'):
            self.send_error(404); return
        body = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode('utf-8', 'replace')
        os.makedirs(LOG_DIR, exist_ok=True)
        path = os.path.join(LOG_DIR, f"{'app' if self.path == '/log-app' else 'engine'}-{datetime.date.today()}.txt")
        with open(path, 'a', encoding='utf-8') as f:
            f.write(body if body.endswith('\n') else body + '\n')
        self.send_response(204); self.end_headers()

    def log_message(self, fmt, *args):
        if self.command != 'POST': super().log_message(fmt, *args)


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try: s.connect(('8.8.8.8', 80)); return s.getsockname()[0]
    except OSError: return '127.0.0.1'
    finally: s.close()


if __name__ == '__main__':
    print(f'아이패드에서 열기: http://{lan_ip()}:{PORT}/test/engine.html', flush=True)
    print(f'로그 저장 위치: {LOG_DIR}', flush=True)
    http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
