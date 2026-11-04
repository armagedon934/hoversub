#!/bin/sh
# Starts Material Foundry / Understand Code on macOS. Stop with Ctrl+C or close the Terminal window.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 portable/serve.py "$@"; fi
if command -v node >/dev/null 2>&1; then exec node portable/serve.mjs "$@"; fi
echo "Python 3 or Node.js is needed to start the program locally."
echo "Для запуска нужен Python 3 (https://www.python.org) или Node.js (https://nodejs.org)."
read -r _
