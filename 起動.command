#!/bin/zsh
cd "${0:A:h}"
if ! command -v npm >/dev/null 2>&1; then
  echo 'Node.js 22.13以上をインストールしてください。'
  read -k 1
  exit 1
fi
if [ ! -d node_modules ]; then
  npm ci || exit 1
fi
npm run dev -- --open
