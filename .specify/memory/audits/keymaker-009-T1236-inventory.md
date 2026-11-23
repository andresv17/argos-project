# keymaker 009 T1236 inventario antes/despues (2026-11-23)

Antes = commit 897091c (previo a la fase 3 /admin). Despues = arbol de trabajo actual.

## 897091c
$ git grep -liE "/admin|admin\.html|presentation/admin" 897091c -- src/presentation/web
(exit 1; vacio = cero)
$ git grep -l Administrador 897091c -- src/presentation/web
897091c:src/presentation/web/pages/HouseholdsPage.tsx
897091c:src/presentation/web/role-help.ts
897091c:src/presentation/web/view-model.ts

## WORKTREE
$ grep -rliE "/admin|admin\.html|presentation/admin" src/presentation/web
(exit 1; vacio = cero)
$ grep -rl Administrador src/presentation/web
src/presentation/web/pages/HouseholdsPage.tsx
src/presentation/web/role-help.ts
src/presentation/web/view-model.ts
$ git diff --stat HEAD -- src/presentation/web
(vacio = sin cambio de codigo 008)
$ git status --short src/presentation/web

$ git log --oneline 897091c..HEAD -- src/presentation/web
(vacio = ningun commit de fase 3 toco src/presentation/web)

## Prueba
Rojo: T1236_WEB_ROOT=<copia con leak.ts '/admin' y extra.ts 'Administrador'> -> 2 failed | 1 passed. Verde: arbol real -> 3 passed.
