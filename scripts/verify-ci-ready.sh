#!/usr/bin/env bash
# DEUDA-CI-VERIFY-PREPUSH: compuerta local previa a `git push` para no descubrir en CI lo que ya se puede saber en disco.
# Solo lectura: no modifica nada ni usa red. Salida: 0 = listo para CI; 1 = alguna comprobacion falla; 2 = uso invalido.
#
#   (i)   SAST: reglas Semgrep del repo (tests/security/sast-rules/) sobre src/. Con `semgrep` instalado se ejecuta el mismo
#         comando que test-gate.yml; sin el, comprobacion ESTATICA equivalente (aproximada: patrones por linea de las 4 reglas, con
#         respeto a `nosemgrep`). La aproximacion puede dar falsos positivos (cadenas, comentarios de una linea); CI manda.
#   (ii)  tests/ no puede leer `claude/` ni archivos sin seguimiento de git (en CI el arbol limpio no los tiene: ver t841).
#   (iii) sin archivos rastreados modificados fuera de commit (ni en el indice) en .env.example, src/, tests/, terraform/ y .github/.
#   (iv)  ninguna spec de Vitest (tests/{unit,integration,property,security}/) importa playwright sin guarda skipIf + executablePath.
#
# Uso: bash scripts/verify-ci-ready.sh [--root DIR]
# Entorno: ARGOS_CI_READY_FORCE_STATIC=1 fuerza la comprobacion estatica aunque semgrep exista (pruebas).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --root) ROOT="${2:-}"; shift 2 ;;
    *) echo "Uso: bash scripts/verify-ci-ready.sh [--root DIR]" >&2; exit 2 ;;
  esac
done
if [ -z "$ROOT" ]; then ROOT="$(git rev-parse --show-toplevel)"; fi
cd "$ROOT"

FAILS=0
pass() { printf 'PASA   %s\n' "$1"; }
fail() { printf 'FALLA  %s\n' "$1"; FAILS=$((FAILS + 1)); }

echo "== (i) SAST Semgrep de src/ =="
if [ -d src ]; then
  if command -v semgrep >/dev/null 2>&1 && [ "${ARGOS_CI_READY_FORCE_STATIC:-0}" != "1" ] && [ -d tests/security/sast-rules ]; then
    if semgrep scan --config tests/security/sast-rules --error --metrics=off src/ >/dev/null 2>&1; then
      pass "semgrep scan --config tests/security/sast-rules src/ (sin hallazgos)"
    else
      fail "semgrep reporta hallazgos: ejecuta 'semgrep scan --config tests/security/sast-rules --error --metrics=off src/'"
    fi
  else
    echo "AVISO  semgrep no instalado (o forzado): comprobacion estatica equivalente (aproximada); CI ejecuta semgrep real"
    STATIC_OUT="$(node "$SCRIPT_DIR/lib/ci-ready-sast-static.mjs")"
    if [ -z "$STATIC_OUT" ]; then
      pass "comprobacion estatica de las 4 reglas SAST (dynamic-code, html, entropia, process.env) sin hallazgos"
    else
      fail "comprobacion estatica SAST con hallazgos (justifica con // nosemgrep: <regla> — motivo si es legitimo):"
      printf '%s\n' "$STATIC_OUT" | sed 's/^/         /'
    fi
  fi
else
  pass "sin src/: nada que analizar"
fi

echo "== (ii) tests/ sin lecturas de claude/ ni de archivos sin seguimiento =="
if [ -d tests ]; then
  READS_OUT="$(node "$SCRIPT_DIR/lib/ci-ready-test-reads.mjs")"
  if [ -z "$READS_OUT" ]; then
    pass "tests/ no referencia rutas de claude/ ni archivos sin seguimiento"
  else
    fail "tests/ lee archivos que el arbol limpio de CI no tiene:"
    printf '%s\n' "$READS_OUT" | sed 's/^/         /'
  fi
else
  pass "sin tests/: nada que analizar"
fi

echo "== (iii) sin archivos rastreados modificados fuera de commit =="
PATHS=()
for p in .env.example src tests terraform .github; do
  if [ -e "$p" ]; then PATHS+=("$p"); fi
done
if [ "${#PATHS[@]}" -eq 0 ]; then
  pass "sin rutas vigiladas"
else
  DIRTY="$(git status --porcelain --untracked-files=no -- "${PATHS[@]}")"
  if [ -z "$DIRTY" ]; then
    pass "src/, tests/, terraform/, .github/ y .env.example sin cambios sin commit"
  else
    fail "archivos rastreados modificados sin commit (CI no los vera):"
    printf '%s\n' "$DIRTY" | sed 's/^/         /'
  fi
fi

echo "== (iv) tests Vitest sin dependencia no protegida de navegadores Playwright =="
if [ -d tests ]; then
  PW_OUT="$(node "$SCRIPT_DIR/lib/ci-ready-playwright-guard.mjs")"
  if [ -z "$PW_OUT" ]; then
    pass "tests Vitest no lanzan Playwright sin guarda skipIf + executablePath"
  else
    fail "tests Vitest importan playwright sin guarda (test-gate.yml no instala navegadores):"
    printf '%s\n' "$PW_OUT" | sed 's/^/         /'
  fi
else
  pass "sin tests/: nada que analizar"
fi

echo
if [ "$FAILS" -eq 0 ]; then echo "verify-ci-ready: LISTO PARA CI"; exit 0; fi
echo "verify-ci-ready: $FAILS comprobacion(es) fallan"; exit 1
