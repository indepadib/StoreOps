#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "StoreOps: fichier .env introuvable à la racine du projet."
  echo "Copie .env.example vers .env, renseigne les variables locales, puis relance."
  exit 1
fi

exec node --env-file=.env backend/server.mjs
