#!/usr/bin/env python3
"""Builds release/MaterialFoundry-portable.zip from dist/ plus the launchers in portable/.

Run with `npm run package` (which builds first). The ZIP needs no installation: unpack it and
double-click Start-Windows.bat (Windows), Start-Mac.command (macOS) or Start-Linux.sh (Linux).
"""
import os
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
PORTABLE = os.path.join(ROOT, "portable")
OUT_DIR = os.path.join(ROOT, "release")
OUT = os.path.join(OUT_DIR, "MaterialFoundry-portable.zip")
TOP = "MaterialFoundry"

README_RU = """МАТЕРИАЛ ФАУНДРИ + «ПОНЯТЬ КОД» — переносная версия
=====================================================

Программа работает на вашем компьютере, без интернета и без установки.
Ничего никуда не отправляется. Код, который вы открываете, НИКОГДА не запускается.

КАК ЗАПУСТИТЬ
1. Распакуйте весь архив в любую папку (например, на Рабочий стол).
2. Дважды щёлкните:
   • Windows:  Start-Windows.bat
   • macOS:    Start-Mac.command   (в первый раз: правый щелчок → «Открыть» → «Открыть»)
   • Linux:    Start-Linux.sh
3. Откроется браузер с программой. Не закрывайте чёрное окно, пока пользуетесь программой.
   Чтобы выйти — закройте браузер и чёрное окно.

ЕСЛИ НЕ ЗАПУСКАЕТСЯ
• Windows: если появилось синее окно «Windows защитила ваш компьютер» — нажмите
  «Подробнее» → «Выполнить в любом случае». Нужен обычный Windows 10 или 11.
• macOS и Linux: нужен Python 3 (python.org) или Node.js (nodejs.org).
• Лучше всего работает в Chrome или Edge (там можно сохранять изменения прямо в папку).

ЧТО ВНУТРИ
• app/       — сама программа (веб-страница).
• portable/  — маленький локальный сервер, который показывает программу браузеру.
  Он доступен только с этого компьютера (адрес 127.0.0.1).
"""

README_EN = """MATERIAL FOUNDRY + UNDERSTAND CODE - portable version
=====================================================

Runs on your own computer, offline, with no installation. Nothing is sent anywhere.
Code you open is NEVER executed.

HOW TO START
1. Unpack the whole ZIP into any folder.
2. Double-click:
   - Windows: Start-Windows.bat
   - macOS:   Start-Mac.command   (first time: right-click -> Open -> Open)
   - Linux:   Start-Linux.sh
3. Your browser opens the program. Keep the small black window open while you use it;
   close it to stop.

IF IT DOES NOT START
- Windows: if "Windows protected your PC" appears, click "More info" -> "Run anyway".
- macOS and Linux need Python 3 (python.org) or Node.js (nodejs.org).
- Chrome or Edge work best (they can save changes straight into your folder).

WHAT IS INSIDE
- app/       the program (a web page)
- portable/  a tiny local web server that only this computer can reach (127.0.0.1)
"""


def add_file(z, src, arc, executable=False):
    info = zipfile.ZipInfo.from_file(src, arc)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = ((0o755 if executable else 0o644) | 0o100000) << 16
    with open(src, "rb") as f:
        z.writestr(info, f.read(), compresslevel=9)


def add_text(z, text, arc):
    info = zipfile.ZipInfo(arc, date_time=(2026, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = (0o644 | 0o100000) << 16
    z.writestr(info, text.replace("\n", "\r\n").encode("utf-8-sig"))


def main():
    if not os.path.isfile(os.path.join(DIST, "index.html")):
        sys.exit("dist/ is missing - run `npm run build` first.")
    os.makedirs(OUT_DIR, exist_ok=True)
    count = 0
    with zipfile.ZipFile(OUT, "w") as z:
        for name, exe in [("Start-Windows.bat", False), ("Start-Mac.command", True), ("Start-Linux.sh", True)]:
            add_file(z, os.path.join(PORTABLE, name), f"{TOP}/{name}", exe)
        for name in ("serve.py", "serve.mjs", "start-windows.ps1"):
            add_file(z, os.path.join(PORTABLE, name), f"{TOP}/portable/{name}", name.endswith(".py"))
        add_text(z, README_RU, f"{TOP}/ПРОЧТИ_МЕНЯ.txt")
        add_text(z, README_EN, f"{TOP}/README.txt")
        for base, _dirs, files in os.walk(DIST):
            for fn in sorted(files):
                src = os.path.join(base, fn)
                rel = os.path.relpath(src, DIST).replace(os.sep, "/")
                add_file(z, src, f"{TOP}/app/{rel}")
                count += 1
    print(f"Wrote {os.path.relpath(OUT, ROOT)}: {count} app files, {os.path.getsize(OUT) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
