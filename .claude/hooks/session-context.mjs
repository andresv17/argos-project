#!/usr/bin/env node
/**
 * Hook ligero de memoria para Claude Code (SessionStart / PreCompact).
 * Lee el estado real en disco y lo inyecta por stdout sin modificar archivos ni consumir MCP externos.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const safeRun = (cmd) => {
  try {
    return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '(no disponible)';
  }
};

const readTail = (relPath, maxLines) => {
  const full = join(root, relPath);
  if (!existsSync(full)) return '';
  const lines = readFileSync(full, 'utf8').trim().split('\n');
  return lines.slice(-maxLines).join('\n');
};

let hookEvent = 'SessionStart';
try {
  if (!process.stdin.isTTY) {
    const raw = readFileSync(0, 'utf8').trim();
    if (raw) hookEvent = JSON.parse(raw).hook_event_name ?? hookEvent;
  }
} catch {
  // Ignorar stdin vacío o no-JSON al ejecutar manualmente
}

if (hookEvent === 'PreCompact') {
  console.log('[ARGOS PreCompact] Contexto a punto de compactarse. Asegúrate de haber persistido el checkpoint actual en claude/log-<personaje>.md y claude/registro-proceso-argos.md.');
  process.exit(0);
}

const branchStatus = safeRun('git status --short --branch');
const recentCommits = safeRun('git log -3 --oneline');
const envLessons = readTail('claude/entorno-y-lecciones.md', 40);
const busTail = readTail('claude/registro-proceso-argos.md', 12);

console.log('=== [ARGOS Memoria Viva — SessionStart] ===');
console.log('--- Git ---\n' + branchStatus + '\nÚltimos commits:\n' + recentCommits);
if (envLessons) console.log('\n--- claude/entorno-y-lecciones.md ---\n' + envLessons);
if (busTail) console.log('\n--- Últimas 12 entradas de claude/registro-proceso-argos.md ---\n' + busTail);
console.log('===========================================');
