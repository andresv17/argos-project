#!/usr/bin/env bash
# Auditor de fortaleza de oráculos de prueba (Prevención de Weak Oracles)
set -euo pipefail

echo "[SDD Oracle Gate] Analizando suites en tests/ contra Weak Oracles..."

# Prohibir toThrow() vacíos que no verifiquen el código ERR-* específico
if grep -rnE "\.toThrow\(\s*\)" tests/ 2>/dev/null; then
  echo "[ORACLE FAIL] Se detectó '.toThrow()' vacío sin verificar el código ERR-* exacto." >&2
  exit 1
fi

# Prohibir tests deshabilitados o saltados (Nivel 3)
if grep -rnE "\b(it|test|describe)\.(skip|todo|only)\b" tests/ 2>/dev/null; then
  echo "[ORACLE FAIL] Violación de Nivel 3: Se detectaron tests con .skip, .todo o .only." >&2
  exit 1
fi

echo "[SDD Oracle Gate] Aserciones verificadas exitosamente."
