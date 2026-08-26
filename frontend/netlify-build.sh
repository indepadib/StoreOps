#!/usr/bin/env sh
set -eu
API_BASE=${STOREOPS_API_BASE:-}
cat > runtime-config.js <<CFG
window.STOREOPS_CONFIG = { apiBase: '${API_BASE}' };
CFG
