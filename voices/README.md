# voices/

Сюда кладутся файлы голосов Piper — каждый голос состоит из ДВУХ файлов
с одинаковым именем:

```
ru_RU-irina-medium.onnx
ru_RU-irina-medium.onnx.json
ru_RU-dmitri-medium.onnx
ru_RU-dmitri-medium.onnx.json
```

Скачать (прямые ссылки на Hugging Face, репозиторий `rhasspy/piper-voices`):

- Ирина (женский):
  https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx
  https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx.json

- Дмитрий (мужской):
  https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx
  https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium.onnx.json

Оба файла каждого голоса кладутся прямо в эту папку (без подпапок).
Подробная инструкция по установке самого Piper — в README.md в корне проекта.

## Новые голоса
Больше ничего скачивать вручную не нужно: в админке на вкладке «Озвучка чата» есть «Каталог голосов» — кнопка «Скачать» кладёт оба файла голоса сюда сама. Свои голоса Piper (`.onnx` + `.onnx.json`) можно класть в эту папку, они появятся в списках после обновления страницы.
