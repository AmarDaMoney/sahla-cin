#!/bin/bash
# Installe les dépendances au démarrage d'une session Claude Code dans le cloud,
# pour que les tests, le linter et la compilation fonctionnent tout de suite.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  echo "export PATH=\"$HOME/.bun/bin:\$PATH\"" >> "${CLAUDE_ENV_FILE:-/dev/null}"
fi

# `bun install` (et non --frozen-lockfile) profite du cache du conteneur.
bun install
