# Silero TTS worker: читает JSON-строки со stdin, отвечает JSON-строками со stdout.
# Запрос: {"id":1,"text":"...","speaker":"aidar","rate":1.0,"volume":1.0}
# Ответ:  {"id":1,"wav":"<base64>"}  или {"id":1,"error":"..."}
import sys, os, json, base64, io, re, wave, array, urllib.request

try:
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(os.path.dirname(HERE), 'voices', 'silero')
MODEL = os.path.join(MODEL_DIR, 'v4_ru.pt')
URL = 'https://models.silero.ai/models/tts/ru/v4_ru.pt'
SR = 48000

def out(o):
    sys.stdout.write(json.dumps(o) + '\n'); sys.stdout.flush()

def ensure_model():
    if os.path.exists(MODEL) and os.path.getsize(MODEL) > 1_000_000:
        return
    os.makedirs(MODEL_DIR, exist_ok=True)
    tmp = MODEL + '.part'
    urllib.request.urlretrieve(URL, tmp)
    os.replace(tmp, MODEL)

def clean(t):
    t = re.sub(r'https?://\S+', ' ссылка ', t)
    t = re.sub(r'[^0-9A-Za-zА-Яа-яЁё.,!?:;\-\s]', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()

def main():
    import torch
    torch.set_num_threads(max(1, (os.cpu_count() or 2) // 2))
    ensure_model()
    model = torch.package.PackageImporter(MODEL).load_pickle('tts_models', 'model')
    model.to('cpu')
    out({'ready': True})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:
            continue
        rid = req.get('id')
        try:
            text = clean(str(req.get('text', '')))[:600]
            if not text:
                raise ValueError('пустой текст')
            spk = req.get('speaker', 'aidar')
            if spk not in model.speakers:
                spk = 'aidar'
            rate = float(req.get('rate', 1.0))
            r = 'x-fast' if rate < 0.7 else 'fast' if rate < 0.9 else 'slow' if rate > 1.25 else 'medium'
            ssml = '<speak><prosody rate="%s">%s</prosody></speak>' % (r, text.replace('&', ' ').replace('<', ' '))
            audio = model.apply_tts(ssml_text=ssml, speaker=spk, sample_rate=SR, put_accent=True, put_yo=True)
            vol = max(0.0, min(2.0, float(req.get('volume', 1.0))))
            pcm = array.array('h', (audio.clamp(-1, 1) * 32767 * min(vol, 1.0)).short().tolist()).tobytes()
            buf = io.BytesIO()
            with wave.open(buf, 'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm)
            out({'id': rid, 'wav': base64.b64encode(buf.getvalue()).decode()})
        except Exception as e:
            out({'id': rid, 'error': str(e)[:200]})

if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        out({'fatal': str(e)[:300]})
        sys.exit(1)
