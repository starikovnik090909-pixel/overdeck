# -*- coding: utf-8 -*-
"""
Overdeck · мод «Замена лица». Локальный движок: камера -> замена лица -> MJPEG-поток.
Всё считается на этом компьютере, в интернет уходит только первая загрузка моделей.

Лицо находит MediaPipe (без сборки C++), замену делает inswapper_128 через onnxruntime
(на видеокарте NVIDIA — CUDA/DirectML, иначе процессор).

Запуск:  python worker.py --port 5177 --models ./models [--source face.jpg] [--demo]
Управление: GET /status, GET /stream, GET /snapshot.jpg, POST /source (байты картинки),
            POST /config (json: swap, mirror, camera, blend, quality)
"""
import argparse, json, os, sys, threading, time, urllib.request
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import cv2

SWAPPER_URL = 'https://huggingface.co/ezioruan/inswapper_128.onnx/resolve/main/inswapper_128.onnx'
BUFFALO_URL = 'https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip'
ARC = np.array([[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
                [41.5493, 92.3655], [70.7299, 92.2041]], dtype=np.float32)

ST = {'state': 'start', 'msg': 'Запуск…', 'fps': 0.0, 'face': False, 'source': False, 'provider': '',
      'progress': 0.0, 'error': ''}
CFG = {'swap': True, 'mirror': False, 'camera': 0, 'blend': 1.0, 'quality': 80}
LOCK = threading.Lock()
PRINT = {'on': False, 'last': -1}
LAST = {'jpg': None, 'n': 0}
SRC_BYTES = {'data': None}


def set_state(**k):
    with LOCK:
        ST.update(k)


# ---------- геометрия (чистая математика, проверяется тестом без моделей) ----------
def align_matrix(kps, size):
    """Матрица 2x3: 5 точек лица -> эталон ArcFace для квадрата size×size."""
    dst = ARC * (size / 112.0)
    m, _ = cv2.estimateAffinePartial2D(np.asarray(kps, np.float32), dst, method=cv2.LMEDS)
    return m


def crop(img, kps, size):
    m = align_matrix(kps, size)
    return cv2.warpAffine(img, m, (size, size), borderValue=0.0), m


def paste_back(frame, fake, m, size, feather=0.12):
    """Вставка 128x128 результата обратно в кадр с мягкой маской."""
    im = cv2.invertAffineTransform(m)
    h, w = frame.shape[:2]
    fake_full = cv2.warpAffine(fake, im, (w, h), borderValue=0.0)
    mask = np.zeros((size, size), np.float32)
    b = max(2, int(size * feather))
    mask[b:size - b, b:size - b] = 1.0
    k = (b * 2) | 1
    mask = cv2.GaussianBlur(mask, (k, k), 0)
    mask_full = cv2.warpAffine(mask, im, (w, h), borderValue=0.0)[:, :, None]
    out = frame.astype(np.float32) * (1 - mask_full) + fake_full.astype(np.float32) * mask_full
    return out.astype(np.uint8)


# ---------- модели ----------
def download(url, dst, label, tag='x'):
    if os.path.exists(dst) and os.path.getsize(dst) > 1000000:
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + '.part'
    set_state(state='download', msg='Скачиваю: ' + label, progress=0.0)
    req = urllib.request.Request(url, headers={'User-Agent': 'Overdeck'})
    with urllib.request.urlopen(req, timeout=60) as r, open(tmp, 'wb') as f:
        total = int(r.headers.get('Content-Length') or 0)
        got = 0
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
            got += len(b)
            if total:
                set_state(progress=got / total)
                if PRINT['on']:
                    pc = int(got * 100 / total)
                    if pc != PRINT['last']:
                        PRINT['last'] = pc
                        print('PCT:%d|%s' % (pc, tag), flush=True)
    os.replace(tmp, dst)


def ensure_models(models):
    swapper = os.path.join(models, 'inswapper_128.onnx')
    arc = os.path.join(models, 'w600k_r50.onnx')
    download(SWAPPER_URL, swapper, 'модель замены лица (~550 МБ, один раз)', 'swap')
    if not os.path.exists(arc):
        import zipfile, io
        zp = os.path.join(models, 'buffalo_l.zip')
        download(BUFFALO_URL, zp, 'модель распознавания лица (~280 МБ, один раз)', 'arc')
        with zipfile.ZipFile(zp) as z:
            with z.open('w600k_r50.onnx') as s, open(arc, 'wb') as d:
                d.write(s.read())
        try:
            os.remove(zp)
        except OSError:
            pass
    return swapper, arc


def providers():
    import onnxruntime as ort
    av = ort.get_available_providers()
    for p in ('CUDAExecutionProvider', 'DmlExecutionProvider'):
        if p in av:
            return [p, 'CPUExecutionProvider'], p.replace('ExecutionProvider', '')
    return ['CPUExecutionProvider'], 'CPU'


class Engine:
    def __init__(self, models):
        import onnxruntime as ort
        import onnx
        from onnx import numpy_helper
        import mediapipe as mp
        sw, arc = ensure_models(models)
        prov, name = providers()
        set_state(provider=name, msg='Загружаю модели…')
        self.sw = ort.InferenceSession(sw, providers=prov)
        self.arc = ort.InferenceSession(arc, providers=prov)
        self.emap = numpy_helper.to_array(onnx.load(sw).graph.initializer[-1])
        self.mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1,
                                                    refine_landmarks=True, min_detection_confidence=0.5,
                                                    min_tracking_confidence=0.5)
        self.mesh_img = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1,
                                                        refine_landmarks=True, min_detection_confidence=0.5)
        self.latent = None

    @staticmethod
    def kps_from(res, w, h):
        if not res.multi_face_landmarks:
            return None
        lm = res.multi_face_landmarks[0].landmark
        P = lambda i: (lm[i].x * w, lm[i].y * h)
        eyes = sorted([P(468), P(473)], key=lambda p: p[0])
        mouth = sorted([P(61), P(291)], key=lambda p: p[0])
        return np.array([eyes[0], eyes[1], P(1), mouth[0], mouth[1]], np.float32)

    def set_source(self, img_bgr):
        h, w = img_bgr.shape[:2]
        res = self.mesh_img.process(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
        kps = self.kps_from(res, w, h)
        if kps is None:
            return False
        aimg, _ = crop(img_bgr, kps, 112)
        blob = cv2.dnn.blobFromImage(aimg, 1.0 / 127.5, (112, 112), (127.5, 127.5, 127.5), swapRB=True)
        emb = self.arc.run(None, {self.arc.get_inputs()[0].name: blob})[0][0]
        emb = emb / np.linalg.norm(emb)
        lat = emb.reshape(1, -1) @ self.emap
        self.latent = (lat / np.linalg.norm(lat)).astype(np.float32)
        return True

    def process(self, frame, blend=1.0):
        h, w = frame.shape[:2]
        res = self.mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        kps = self.kps_from(res, w, h)
        if kps is None:
            return frame, False
        if self.latent is None:
            return frame, True
        aimg, m = crop(frame, kps, 128)
        blob = cv2.dnn.blobFromImage(aimg, 1.0 / 255, (128, 128), (0, 0, 0), swapRB=True)
        pred = self.sw.run(None, {'target': blob, 'source': self.latent})[0][0]
        fake = np.clip(255 * pred.transpose(1, 2, 0), 0, 255).astype(np.uint8)[:, :, ::-1]
        if blend < 1.0:
            fake = cv2.addWeighted(fake, blend, aimg, 1 - blend, 0)
        return paste_back(frame, np.ascontiguousarray(fake), m, 128), True


# ---------- цикл камеры ----------
def open_cam(idx):
    cap = cv2.VideoCapture(int(idx), cv2.CAP_DSHOW if os.name == 'nt' else 0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    return cap


def demo_frame(t):
    img = np.full((720, 1280, 3), 18, np.uint8)
    cv2.putText(img, 'DEMO: engine without models', (330, 330), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (180, 196, 43), 3)
    cv2.circle(img, (640 + int(200 * np.sin(t)), 460), 40, (180, 196, 43), -1)
    return img


def loop(args):
    eng = None
    try:
        if not args.demo:
            eng = Engine(args.models)
            if args.source and os.path.exists(args.source):
                SRC_BYTES['data'] = open(args.source, 'rb').read()
        cap = None if args.demo else open_cam(CFG['camera'])
        cam_now = CFG['camera']
        set_state(state='run', msg='Работает', progress=1.0)
        n, t0 = 0, time.time()
        while True:
            if SRC_BYTES['data'] is not None and eng:
                img = cv2.imdecode(np.frombuffer(SRC_BYTES['data'], np.uint8), cv2.IMREAD_COLOR)
                SRC_BYTES['data'] = None
                ok = img is not None and eng.set_source(img)
                set_state(source=bool(ok), msg='Работает' if ok else 'На фото не нашёл лицо — возьми другое')
            if cap is not None:
                if CFG['camera'] != cam_now:
                    cap.release(); cap = open_cam(CFG['camera']); cam_now = CFG['camera']
                ok, frame = cap.read()
                if not ok:
                    set_state(msg='Нет кадра с камеры'); time.sleep(0.2); continue
            else:
                frame = demo_frame(time.time()); time.sleep(0.03)
            if CFG['mirror']:
                frame = cv2.flip(frame, 1)
            face = False
            if eng and CFG['swap']:
                frame, face = eng.process(frame, float(CFG['blend']))
            n += 1
            if time.time() - t0 >= 1.0:
                set_state(fps=round(n / (time.time() - t0), 1)); n, t0 = 0, time.time()
            set_state(face=face)
            okj, buf = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, int(CFG['quality'])])
            if okj:
                LAST['jpg'] = buf.tobytes(); LAST['n'] += 1
    except Exception as e:  # noqa
        set_state(state='error', error=str(e), msg='Ошибка: ' + str(e))
        raise


class Srv(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        # клиент (админка, OBS) закрыл соединение — это нормально, не засоряем лог
        et = sys.exc_info()[0]
        if et and issubclass(et, (ConnectionError, OSError)):
            return
        super().handle_error(request, client_address)


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, o, code=200):
        b = json.dumps(o, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/status':
            with LOCK:
                return self._json(dict(ST, config=CFG))
        if p == '/snapshot.jpg':
            j = LAST['jpg']
            if not j:
                return self._json({'error': 'no frame'}, 503)
            self.send_response(200); self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Content-Length', str(len(j))); self.end_headers(); self.wfile.write(j); return
        if p == '/stream':
            self.send_response(200)
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=f')
            self.send_header('Cache-Control', 'no-store'); self.end_headers()
            last = -1
            try:
                while True:
                    if LAST['n'] != last and LAST['jpg']:
                        last = LAST['n']; j = LAST['jpg']
                        self.wfile.write(b'--f\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n' % len(j))
                        self.wfile.write(j); self.wfile.write(b'\r\n')
                    else:
                        time.sleep(0.01)
            except (BrokenPipeError, ConnectionResetError, OSError):
                return
        self._json({'error': 'not found'}, 404)

    def do_POST(self):
        n = int(self.headers.get('Content-Length') or 0)
        body = self.rfile.read(n) if n else b''
        p = self.path.split('?')[0]
        if p == '/source':
            SRC_BYTES['data'] = body; set_state(source=False, msg='Читаю фото…')
            return self._json({'ok': True})
        if p == '/config':
            try:
                d = json.loads(body.decode('utf-8') or '{}')
            except ValueError:
                return self._json({'error': 'bad json'}, 400)
            for k in CFG:
                if k in d:
                    CFG[k] = type(CFG[k])(d[k]) if not isinstance(CFG[k], bool) else bool(d[k])
            return self._json({'ok': True, 'config': CFG})
        self._json({'error': 'not found'}, 404)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=5177)
    ap.add_argument('--models', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'models'))
    ap.add_argument('--source', default='')
    ap.add_argument('--camera', type=int, default=0)
    ap.add_argument('--demo', action='store_true')
    ap.add_argument('--prefetch', action='store_true', help='только скачать модели и выйти')
    a = ap.parse_args()
    if a.prefetch:
        PRINT['on'] = True
        ensure_models(a.models)
        print('PREFETCH_OK', flush=True)
        return
    CFG['camera'] = a.camera
    threading.Thread(target=loop, args=(a,), daemon=True).start()
    srv = Srv(('127.0.0.1', a.port), H)
    print('faceswap worker on 127.0.0.1:%d' % a.port, flush=True)
    srv.serve_forever()


if __name__ == '__main__':
    main()
