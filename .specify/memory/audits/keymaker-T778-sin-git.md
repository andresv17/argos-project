# Keymaker T778: aserción de package.json sin git (2026-11-18)

Commit: 771b240 `test(005): T778 compara package.json con hash fijado, sin depender de git (CI superficial)`.
Rojo y verde son el mismo commit: no hay código de producción que cambiar; el hash fijado coincide con el estado actual, así que la prueba nueva es verde de inmediato. La validez de la aserción se demostró con la comprobación negativa.

## Hashes fijados (estado de 44c83e0)
- package.json: ca9158d562ad27f30a7423c8776c55433400cea022ed8c16fca9743236baa88f
- package-lock.json: cb1c84443f10107c56e0486b3084aba191a0d95fcbe490a95779c1232038ef25
Ambos coinciden con los archivos actuales. Se conserva la regex anti-proveedores de IA sobre package.json.

## Comprobación negativa
Con un espacio añadido a package.json el test falló (sha256 f6a00826...ef27 distinto del fijado). Se restauró desde copia; sha256 vuelve a ca9158d5... y git no muestra cambios en package.json.

## Otros usos de git en tiempo de ejecución
grep de execFileSync / git diff / git log en tests/unit/summary, tests/integration/api/t776-t779* y tests/e2e/enlace: ninguno restante (solo el eliminado).

## Verificación
- tsc --noEmit = 0.
- vitest tests/unit/summary + t776-t779 (SQLite): 4 archivos, 23 pasan.
- Suite completa con Postgres 17 (docker-compose.test.yml): 256 archivos, 4049 pasan, 1 omitida. Postgres bajado con down -v.
- verify-oracles --feature 005 y sin flag: CUMPLE (300 archivos, 0 débiles).
- verify-traceability --feature 001: 113/113 CUMPLE; --feature 005 --task T778: CUMPLE; sin flag: CUMPLE. (La sintaxis `001` posicional no existe; es `--feature 001`.)
- Clon superficial (`git clone --depth 1 file://`, 1 commit, node_modules por symlink): t778 5/5 verde. Directorio temporal y symlinks retirados.
- tasks.md sin tocar (sigue con las marcas de Neo sin commitear).
