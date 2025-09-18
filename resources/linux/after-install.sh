#!/bin/bash
set -euo pipefail

CACHE_DIR="${HOME}/.cache/openwhispr"
MODELS_DIR="${CACHE_DIR}/models"

if [[ "${1-}" == "--remove" ]]; then
  if [[ -d "${MODELS_DIR}" ]]; then
    rm -rf "${MODELS_DIR}"
    echo "Removed OpenWhispr cached models"
  fi
  # Attempt to remove parent cache directory if empty
  if [[ -d "${CACHE_DIR}" ]]; then
    rmdir "${CACHE_DIR}" 2>/dev/null || true
  fi
fi
