"""engine-test용 로컬 서버: 정적 파일 + 로그 받기.

python test/log-server.py  (저장소 루트에서)
→ 아이패드(같은 와이파이)에서 http://<PC IP>:8765/test/engine.html
→ 페이지가 로그를 5초마다 POST /log 로 보내고, logs/engine-YYYY-MM-DD.txt 에 쌓인다.
"""
import datetime, http.server, os, socket

PORT = 8765
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_DIR = os.path.join(ROOT, 'logs')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_GET(self):
        # 주소만 치면 엔진 화면으로, 로그 폴더는 밖에서 못 보게
        if self.path in ('/', '/index.html'):
            self.send_response(302); self.send_header('Location', '/test/engine.html'); self.end_headers(); return
        if self.path.startswith('/logs'):
            self.send_error(404); return
        super().do_GET()

    def do_POST(self):
        if self.path != '/log':
            self.send_error(404); return
        body = self.rfile.read(int(self.headers.get('Content-Length', 0))).decode('utf-8', 'replace')
        os.makedirs(LOG_DIR, exist_ok=True)
        path = os.path.join(LOG_DIR, f'engine-{datetime.date.today()}.txt')
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
