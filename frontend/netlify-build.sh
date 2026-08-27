#!/usr/bin/env sh
set -eu
API_BASE=${STOREOPS_API_BASE:-}
if [ -n "$API_BASE" ]; then MODE="api"; else MODE="showcase"; fi
cat > runtime-config.js <<CFG
window.STOREOPS_CONFIG = { apiBase: '${API_BASE}', mode: '${MODE}' };
CFG
