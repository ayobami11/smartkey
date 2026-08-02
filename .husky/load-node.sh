if ! command -v npx >/dev/null 2>&1; then
  export PATH="$HOME/.local/share/fnm:$PATH"
  if command -v fnm >/dev/null 2>&1; then
    eval "$(fnm env --shell bash 2>/dev/null)" 2>/dev/null || true
  fi
fi
