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
GFPGAN_URL = 'https://huggingface.co/facefusion/models-3.0.0/resolve/main/gfpgan_1.4.onnx'
FFHQ512 = np.array([[192.98138, 239.94708], [318.90277, 240.1936], [256.63416, 314.01935],
                    [201.26117, 371.41043], [313.08905, 371.15118]], dtype=np.float32)
BUFFALO_URL = 'https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip'
ARC = np.array([[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366],
                [41.5493, 92.3655], [70.7299, 92.2041]], dtype=np.float32)

ST = {'state': 'start', 'msg': 'Запуск…', 'fps': 0.0, 'face': False, 'source': False, 'provider': '',
      'progress': 0.0, 'error': '', 'timing': '', 'enh': '', 'out': ''}
CFG = {'swap': True, 'mirror': False, 'camera': 0, 'blend': 1.0, 'quality': 80,
       'enhance': False, 'enh': 0.8, 'window': False, 'vcam': False}
LOCK = threading.Lock()
PRINT = {'on': False, 'last': -1}
LAST = {'jpg': None, 'n': 0}
SRC_BYTES = {'data': None}


def set_state(**k):
    with LOCK:
        ST.update(k)


# ---------- геометрия (чистая математика, проверяется тестом без моделей) ----------
def align_matrix(kps, size, tpl=None):
    """Матрица 2x3: 5 точек лица -> эталон (ArcFace по умолчанию) для квадрата size×size."""
    dst = (ARC * (size / 112.0)) if tpl is None else tpl
    m, _ = cv2.estimateAffinePartial2D(np.asarray(kps, np.float32), dst, method=cv2.LMEDS)
    return m


def crop(img, kps, size, tpl=None):
    m = align_matrix(kps, size, tpl)
    return cv2.warpAffine(img, m, (size, size), borderValue=0.0), m


OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
        176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]


def match_color(fake, target, mask):
    """Подгоняет цвет и контраст результата под лицо в кадре (по LAB, только внутри маски)."""
    f = cv2.cvtColor(fake, cv2.COLOR_BGR2LAB).astype(np.float32)
    t = cv2.cvtColor(target, cv2.COLOR_BGR2LAB).astype(np.float32)
    w = mask > 0.5
    if w.sum() < 50:
        return fake
    for c in range(3):
        fm, fs = f[:, :, c][w].mean(), f[:, :, c][w].std() + 1e-3
        tm, ts = t[:, :, c][w].mean(), t[:, :, c][w].std() + 1e-3
        k = min(1.4, max(0.7, ts / fs))
        f[:, :, c] = (f[:, :, c] - fm) * k + tm
    out = cv2.cvtColor(np.clip(f, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR)
    return out


def paste_back(frame, fake, m, size, oval=None, feather=0.12):
    """Вставка 128x128 результата в кадр. Граница — по контуру лица (если дан oval), считается только в окне вокруг лица."""
    im = cv2.invertAffineTransform(m)
    h, w = frame.shape[:2]
    if oval is not None and len(oval) > 2:
        x0 = max(0, int(oval[:, 0].min()) - 12); x1 = min(w, int(oval[:, 0].max()) + 12)
        y0 = max(0, int(oval[:, 1].min()) - 12); y1 = min(h, int(oval[:, 1].max()) + 12)
    else:
        x0, y0, x1, y1 = 0, 0, w, h
    if x1 - x0 < 8 or y1 - y0 < 8:
        return frame
    rw, rh = x1 - x0, y1 - y0
    im2 = im.copy(); im2[0, 2] -= x0; im2[1, 2] -= y0
    fake_roi = cv2.warpAffine(fake, im2, (rw, rh), flags=cv2.INTER_CUBIC, borderValue=0.0)
    # маска квадрата 128x128 с мягким краем (чтобы не было чёрной каймы)
    cm = np.zeros((size, size), np.float32)
    b = max(2, int(size * feather))
    cm[b:size - b, b:size - b] = 1.0
    k = (b * 2) | 1
    cm = cv2.GaussianBlur(cm, (k, k), 0)
    mask = cv2.warpAffine(cm, im2, (rw, rh), borderValue=0.0)
    if oval is not None and len(oval) > 2:
        hull = np.zeros((rh, rw), np.uint8)
        pts = (oval - np.array([x0, y0], np.float32)).astype(np.int32)
        cv2.fillConvexPoly(hull, cv2.convexHull(pts), 255)
        fw = max(8, int(max(oval[:, 0].max() - oval[:, 0].min(), 1)))
        er = max(1, int(fw * 0.035))
        hull = cv2.erode(hull, np.ones((er, er), np.uint8))
        bl = (int(fw * 0.07) | 1)
        hull = cv2.GaussianBlur(hull, (bl, bl), 0).astype(np.float32) / 255.0
        mask = mask * hull
    mask = mask[:, :, None]
    roi = frame[y0:y1, x0:x1].astype(np.float32)
    frame[y0:y1, x0:x1] = (roi * (1 - mask) + fake_roi.astype(np.float32) * mask).astype(np.uint8)
    return frame


# ---------- модели ----------
def download(url, dst, label, tag='x', side=False):
    if os.path.exists(dst) and os.path.getsize(dst) > 1000000:
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    tmp = dst + '.part'
    if side:
        set_state(enh='Скачиваю улучшение лица… 0%')
    else:
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
                if side:
                    set_state(enh='Скачиваю улучшение лица… %d%%' % int(got * 100 / total))
                else:
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
        so = ort.SessionOptions()
        so.log_severity_level = 3
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        if name == 'Dml':
            so.enable_mem_pattern = False   # требование DirectML
            so.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        self.sw = ort.InferenceSession(sw, sess_options=so, providers=prov)
        self.arc = ort.InferenceSession(arc, sess_options=so, providers=prov)
        self.kprev = None
        self.t = {'mesh': 0.0, 'swap': 0.0, 'paste': 0.0, 'enh': 0.0}
        self.emap = numpy_helper.to_array(onnx.load(sw).graph.initializer[-1])
        self.mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1,
                                                    refine_landmarks=True, min_detection_confidence=0.5,
                                                    min_tracking_confidence=0.5)
        self.mesh_img = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=1,
                                                        refine_landmarks=True, min_detection_confidence=0.5)
        self.latent = None
        self.models = models
        self.ort, self.so, self.prov = ort, so, prov
        self.gf = None
        self.gf_busy = False
        self.t['enh'] = 0.0

    def load_enh(self):
        """Фоновая загрузка GFPGAN: не блокирует видео, пока качается."""
        if self.gf is not None or self.gf_busy:
            return
        self.gf_busy = True

        def run():
            try:
                dst = os.path.join(self.models, 'gfpgan_1.4.onnx')
                download(GFPGAN_URL, dst, 'улучшение лица', 'enh', side=True)
                set_state(enh='Готовлю улучшение лица…')
                self.gf = self.ort.InferenceSession(dst, sess_options=self.so, providers=self.prov)
                set_state(enh='')
            except Exception as e:  # noqa
                set_state(enh='Улучшение лица не загрузилось: %s' % e)
                CFG['enhance'] = False
            finally:
                self.gf_busy = False
        threading.Thread(target=run, daemon=True).start()

    def enhance(self, frame, kps, oval, strength):
        """GFPGAN по уже вставленному лицу: возвращает чёткие поры, глаза, зубы. Вставка — по контуру лица."""
        t = time.time()
        aimg, m = crop(frame, kps, 512, FFHQ512)
        blob = cv2.dnn.blobFromImage(aimg, 1.0 / 127.5, (512, 512), (127.5, 127.5, 127.5), swapRB=True)
        out = self.gf.run(None, {self.gf.get_inputs()[0].name: blob})[0][0]
        img = np.clip((out.transpose(1, 2, 0) + 1.0) * 127.5, 0, 255).astype(np.uint8)[:, :, ::-1]
        img = np.ascontiguousarray(img)
        img = cv2.addWeighted(img, strength, aimg, 1 - strength, 0)
        res = paste_back(frame, img, m, 512, oval, feather=0.1)
        self._ema('enh', (time.time() - t) * 1000)
        return res

    @staticmethod
    def pts_from(res, w, h):
        if not res.multi_face_landmarks:
            return None
        lm = res.multi_face_landmarks[0].landmark
        return np.array([(p.x * w, p.y * h) for p in lm[:478]], np.float32)

    @staticmethod
    def kps_of(pts):
        eyes = sorted([pts[468], pts[473]], key=lambda p: p[0])
        mouth = sorted([pts[61], pts[291]], key=lambda p: p[0])
        return np.array([eyes[0], eyes[1], pts[1], mouth[0], mouth[1]], np.float32)

    def set_source(self, img_bgr):
        h, w = img_bgr.shape[:2]
        res = self.mesh_img.process(cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB))
        pts = self.pts_from(res, w, h)
        if pts is None:
            return False
        aimg, _ = crop(img_bgr, self.kps_of(pts), 112)
        blob = cv2.dnn.blobFromImage(aimg, 1.0 / 127.5, (112, 112), (127.5, 127.5, 127.5), swapRB=True)
        emb = self.arc.run(None, {self.arc.get_inputs()[0].name: blob})[0][0]
        emb = emb / np.linalg.norm(emb)
        lat = emb.reshape(1, -1) @ self.emap
        self.latent = (lat / np.linalg.norm(lat)).astype(np.float32)
        return True

    def _ema(self, key, v):
        self.t[key] = self.t[key] * 0.9 + v * 0.1 if self.t[key] else v

    def process(self, frame, blend=1.0):
        h, w = frame.shape[:2]
        sc = 640.0 / max(h, w)
        small = cv2.resize(frame, (int(w * sc), int(h * sc)), interpolation=cv2.INTER_AREA) if sc < 1 else frame
        t0 = time.time()
        res = self.mesh.process(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
        self._ema('mesh', (time.time() - t0) * 1000)
        pts = self.pts_from(res, w, h)
        if pts is None:
            self.kprev = None
            return frame, False
        if self.latent is None:
            return frame, True
        kps = self.kps_of(pts)
        if self.kprev is not None:   # сглаживаем дрожь: при малом движении — сильнее
            ed = max(1.0, float(np.linalg.norm(kps[1] - kps[0])))
            d = float(np.mean(np.linalg.norm(kps - self.kprev, axis=1))) / ed
            a = min(1.0, max(0.3, d * 6.0))
            kps = self.kprev * (1 - a) + kps * a
        self.kprev = kps
        t1 = time.time()
        aimg, m = crop(frame, kps, 128)
        blob = cv2.dnn.blobFromImage(aimg, 1.0 / 255, (128, 128), (0, 0, 0), swapRB=True)
        pred = self.sw.run(None, {'target': blob, 'source': self.latent})[0][0]
        fake = np.clip(255 * pred.transpose(1, 2, 0), 0, 255).astype(np.uint8)[:, :, ::-1]
        fake = np.ascontiguousarray(fake)
        self._ema('swap', (time.time() - t1) * 1000)
        t2 = time.time()
        cmask = np.zeros((128, 128), np.float32)
        cv2.ellipse(cmask, (64, 70), (42, 52), 0, 0, 360, 1.0, -1)
        fake = match_color(fake, aimg, cmask)
        if blend < 1.0:
            fake = cv2.addWeighted(fake, blend, aimg, 1 - blend, 0)
        out = paste_back(frame, fake, m, 128, pts[OVAL])
        self._ema('paste', (time.time() - t2) * 1000)
        if CFG['enhance']:
            if self.gf is None:
                self.load_enh()
            else:
                try:
                    out = self.enhance(out, kps, pts[OVAL], float(CFG['enh']))
                except Exception as e:  # noqa
                    set_state(enh='Улучшение лица отключено: %s' % e)
                    CFG['enhance'] = False
        return out, True


# ---------- цикл камеры ----------
class Cam(threading.Thread):
    """Читает камеру в отдельном потоке и держит только самый свежий кадр (без накопления задержки)."""
    def __init__(self, idx):
        threading.Thread.__init__(self); self.daemon = True
        self.idx = int(idx); self.frame = None; self.n = 0; self.stop = False; self.ok = True
        self.start()

    def run(self):
        cap = cv2.VideoCapture(self.idx, cv2.CAP_DSHOW if os.name == 'nt' else 0)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280); cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        while not self.stop:
            ok, f = cap.read()
            if not ok:
                self.ok = False; time.sleep(0.1); continue
            self.ok = True; self.frame = f; self.n += 1
        cap.release()


class Out:
    """Вывод на ПК: окно (его берёт OBS через «Захват окна») и виртуальная камера (OBS Virtual Camera)."""
    WIN = 'Overdeck - Zamena litsa'

    def __init__(self):
        self.win = False
        self.cam = None
        self.cam_sz = None
        self.installing = False
        self.fail = ''

    def _msg(self):
        if not CFG['window'] and not CFG['vcam'] and not self.installing:
            self.fail = ''
        parts = []
        if self.win:
            parts.append('окно на ПК открыто')
        if self.cam is not None:
            parts.append('виртуальная камера: ' + str(getattr(self.cam, 'device', 'OBS Virtual Camera')))
        if self.fail:
            parts.append(self.fail)
        set_state(out=' · '.join(parts))

    def _install_vcam(self):
        if self.installing:
            return
        self.installing = True
        set_state(out='Ставлю библиотеку виртуальной камеры…')

        def run():
            import subprocess
            try:
                r = subprocess.run([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check',
                                    'pyvirtualcam'], capture_output=True, timeout=300)
                if r.returncode != 0:
                    self.fail = 'не удалось поставить pyvirtualcam'; CFG['vcam'] = False
                import importlib; importlib.invalidate_caches()
            except Exception as e:  # noqa
                self.fail = 'не удалось поставить pyvirtualcam: %s' % e; CFG['vcam'] = False
            self.installing = False
        threading.Thread(target=run, daemon=True).start()

    def show(self, frame):
        # --- окно ---
        if CFG['window']:
            try:
                cv2.imshow(self.WIN, frame)
                cv2.waitKey(1)
                self.win = True
                if cv2.getWindowProperty(self.WIN, cv2.WND_PROP_VISIBLE) < 1:   # закрыли крестиком
                    CFG['window'] = False
            except Exception as e:  # noqa
                CFG['window'] = False; self.fail = 'окно: %s' % e
        if self.win and not CFG['window']:
            try:
                cv2.destroyWindow(self.WIN); cv2.waitKey(1)
            except Exception:
                pass
            self.win = False
        # --- виртуальная камера ---
        if CFG['vcam']:
            if self.cam is None and not self.installing:
                try:
                    import pyvirtualcam
                    h, w = 720, 1280
                    self.cam = pyvirtualcam.Camera(width=w, height=h, fps=30, fmt=pyvirtualcam.PixelFormat.BGR)
                    self.cam_sz = (w, h); self.fail = ''
                except ImportError:
                    self._install_vcam()
                except Exception as e:  # noqa
                    self.cam = None
                    self.fail = 'виртуальная камера недоступна: поставь OBS Studio и один раз нажми в нём «Запустить виртуальную камеру» (%s)' % str(e)[:80]
                    CFG['vcam'] = False
            if self.cam is not None:
                try:
                    f = frame if frame.shape[1] == self.cam_sz[0] and frame.shape[0] == self.cam_sz[1] else \
                        cv2.resize(frame, self.cam_sz, interpolation=cv2.INTER_AREA)
                    self.cam.send(np.ascontiguousarray(f))
                except Exception as e:  # noqa
                    self.fail = 'виртуальная камера: %s' % str(e)[:80]
                    self.close_cam(); CFG['vcam'] = False
        elif self.cam is not None:
            self.close_cam()
        self._msg()

    def close_cam(self):
        try:
            self.cam.close()
        except Exception:
            pass
        self.cam = None


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
        cam = None if args.demo else Cam(CFG['camera'])
        cam_now = CFG['camera']
        set_state(state='run', msg='Работает', progress=1.0)
        n, t0, seen = 0, time.time(), -1
        out = Out()
        while True:
            if SRC_BYTES['data'] is not None and eng:
                img = cv2.imdecode(np.frombuffer(SRC_BYTES['data'], np.uint8), cv2.IMREAD_COLOR)
                SRC_BYTES['data'] = None
                ok = img is not None and eng.set_source(img)
                set_state(source=bool(ok), msg='Работает' if ok else 'На фото не нашёл лицо — возьми другое')
            if cam is not None:
                if CFG['camera'] != cam_now:
                    cam.stop = True; cam = Cam(CFG['camera']); cam_now = CFG['camera']; seen = -1
                if cam.frame is None or cam.n == seen:
                    if not cam.ok:
                        set_state(msg='Нет кадра с камеры')
                    time.sleep(0.004); continue
                seen = cam.n; frame = cam.frame.copy()
            else:
                frame = demo_frame(time.time()); time.sleep(0.03)
            if CFG['mirror']:
                frame = cv2.flip(frame, 1)
            face = False
            if eng and CFG['swap']:
                frame, face = eng.process(frame, float(CFG['blend']))
            n += 1
            if time.time() - t0 >= 1.0:
                tm = ''
                if eng:
                    tm = 'лицо %d мс · замена %d мс · вставка %d мс' % (eng.t['mesh'], eng.t['swap'], eng.t['paste'])
                    if CFG['enhance'] and eng.gf is not None:
                        tm += ' · улучшение %d мс' % eng.t['enh']
                set_state(fps=round(n / (time.time() - t0), 1), timing=tm); n, t0 = 0, time.time()
            set_state(face=face)
            if CFG['window'] or CFG['vcam'] or out.win or out.cam is not None:
                out.show(frame)
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
    ap.add_argument('--cfg', default='', help='json с настройками при старте')
    ap.add_argument('--prefetch', action='store_true', help='только скачать модели и выйти')
    a = ap.parse_args()
    if a.prefetch:
        PRINT['on'] = True
        ensure_models(a.models)
        print('PREFETCH_OK', flush=True)
        return
    CFG['camera'] = a.camera
    if a.cfg:
        try:
            for k, v in json.loads(a.cfg).items():
                if k in CFG:
                    CFG[k] = type(CFG[k])(v) if not isinstance(CFG[k], bool) else bool(v)
        except Exception:
            pass
    threading.Thread(target=loop, args=(a,), daemon=True).start()
    srv = Srv(('127.0.0.1', a.port), H)
    print('faceswap worker on 127.0.0.1:%d' % a.port, flush=True)
    srv.serve_forever()


if __name__ == '__main__':
    main()
