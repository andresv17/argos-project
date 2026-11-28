#!/usr/bin/env node
/**
 * Deterministic GitHub Projects v2 <-> Spec Kit (tasks.md) sync for Proyecto ARGOS.
 * Zero LLM tokens: pulls phase requirements into claude/inbox-*.md and syncs
 * [GH:#N] task groups to Todo / In Progress / Done + brief issue comments.
 *
 * Usage:
 *   node scripts/gh-project-sync.mjs pull --fase "Feature 007"
 *   node scripts/gh-project-sync.mjs sync --tasks specs/007-.../tasks.md [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const DEFAULT_OWNER = process.env.GH_PROJECT_OWNER || 'andresv17';
const DEFAULT_PROJECT_NUM = Number(process.env.GH_PROJECT_NUMBER || 5);
const DEFAULT_REPO = process.env.GH_REPO || 'andresv17/argos-project';

function ghJson(args) {
  const out = execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

function ghRun(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (!next || next.startsWith('--')) {
        opts[key] = true;
      } else {
        opts[key] = next;
        i++;
      }
    }
  }
  return { cmd, opts };
}

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function matchFase(itemFase, query) {
  if (!itemFase) return false;
  const f = itemFase.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (f === q || f.startsWith(q)) return true;
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(f);
}

function priorityRank(p) {
  const idx = ['P0', 'P1', 'P2', 'P3'].indexOf(String(p || '').toUpperCase());
  return idx === -1 ? 99 : idx;
}

function cmdPull(opts) {
  const faseQuery = opts.fase;
  if (!faseQuery) {
    console.error('Error: --fase is required (e.g. --fase "Feature 007")');
    process.exit(1);
  }
  const owner = opts.owner || DEFAULT_OWNER;
  const projectNum = Number(opts.project || DEFAULT_PROJECT_NUM);
  const includeDone = Boolean(opts['include-done']);

  const data = ghJson(['project', 'item-list', String(projectNum), '--owner', owner, '--limit', '500', '--format', 'json']);
  const matched = (data.items || []).filter((it) => matchFase(it.fase, faseQuery));

  const distinctFases = [...new Set(matched.map((it) => it.fase).filter(Boolean))];
  if (distinctFases.length > 1) {
    console.error(`Ambiguous --fase "${faseQuery}". Matched multiple phases:\n- ${distinctFases.join('\n- ')}`);
    process.exit(1);
  }

  const filtered = matched
    .filter((it) => includeDone || String(it.status || '').toLowerCase() !== 'done')
    .sort((a, b) => {
      const pr = priorityRank(a.prioridad) - priorityRank(b.prioridad);
      if (pr !== 0) return pr;
      return (a.content?.number || 999999) - (b.content?.number || 999999);
    });

  const resolvedFase = distinctFases[0] || faseQuery;
  const outPath = resolve(opts.out || `claude/inbox-${slugify(faseQuery)}.md`);
  mkdirSync(dirname(outPath), { recursive: true });

  const lines = [
    `# Inbox de Requerimientos — ${resolvedFase}`,
    '',
    `> **Origen:** GitHub Project #${projectNum} (\`${owner}\`) | **Total ítems:** ${filtered.length} | **Generado:** ${new Date().toISOString()}`,
    `> **Instrucción para Architect / Morpheus:** Lee cada requerimiento de este archivo como entrada funcional equivalente al prompt de Neo. Al redactar \`tasks.md\`, conserva la etiqueta \`[GH:#N]\` en el encabezado de cada bloque o User Story (o en las tareas \`Txxx\`) para habilitar la sincronización automática con GitHub Projects.`,
    '',
    '## Resumen',
    '',
    '| ID | Prioridad | Área | Estado | Título |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const it of filtered) {
    const num = it.content?.number ? `[GH:#${it.content.number}]` : `[GH:${it.id}]`;
    const area = it['área'] || it.area || '-';
    const prio = it.prioridad || '-';
    const status = it.status || 'Todo';
    const title = (it.title || it.content?.title || '').replace(/\|/g, '\\|');
    lines.push(`| ${num} | ${prio} | ${area} | ${status} | ${title} |`);
  }

  lines.push('', '---', '', '## Detalle de Requerimientos', '');

  for (const it of filtered) {
    const num = it.content?.number;
    const tag = num ? `[GH:#${num}]` : `[GH:${it.id}]`;
    const title = it.title || it.content?.title || '(Sin título)';
    const area = it['área'] || it.area || '-';
    const prio = it.prioridad || '-';
    const labels = (it.labels || []).join(', ') || '-';
    const url = it.content?.url || '-';
    const body = (it.content?.body || '_Sin descripción adicional._').trim();

    lines.push(`### ${tag} ${title}`);
    lines.push(`- **Prioridad:** ${prio} | **Área:** ${area} | **Estado:** ${it.status || 'Todo'} | **Labels:** ${labels}`);
    lines.push(`- **URL:** ${url}`);
    lines.push('', body, '', '---', '');
  }

  writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`[gh-project-sync] Wrote ${filtered.length} item(s) for "${resolvedFase}" -> ${outPath}`);
}

function parseTasksByIssue(tasksPath) {
  const raw = readFileSync(resolve(tasksPath), 'utf8');
  const lines = raw.split(/\r?\n/);
  const byIssue = new Map();

  let currentHeadingLevel = 0;
  let currentHeadingIssues = [];

  const ensureIssue = (num) => {
    if (!byIssue.has(num)) {
      byIssue.set(num, { total: 0, done: 0, open: 0, taskIds: [] });
    }
    return byIssue.get(num);
  };

  const extractIssueRefs = (text) => {
    const refs = new Set();
    const re = /\[GH:#(\d+(?:\s*,\s*#?\d+)*)\]/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      for (const part of m[1].split(',')) {
        const n = Number(part.replace(/[^0-9]/g, ''));
        if (n > 0) refs.add(n);
      }
    }
    return [...refs];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const refs = extractIssueRefs(headingMatch[2]);
      if (refs.length > 0 || level <= currentHeadingLevel) {
        currentHeadingLevel = level;
        currentHeadingIssues = refs;
      }
      continue;
    }

    const taskMatch = line.match(/^\s*-\s*\[([ xX])\]\s*(?:\*\*)?(T\d+[a-zA-Z0-9-]*)/);
    if (taskMatch) {
      const isDone = taskMatch[1].toLowerCase() === 'x';
      const taskId = taskMatch[2];
      const lineRefs = extractIssueRefs(line);
      const targets = [...new Set([...currentHeadingIssues, ...lineRefs])];
      for (const num of targets) {
        const entry = ensureIssue(num);
        entry.total += 1;
        if (isDone) entry.done += 1;
        else entry.open += 1;
        entry.taskIds.push(taskId);
      }
    }
  }

  return byIssue;
}

function cmdSync(opts) {
  const tasksPath = opts.tasks;
  if (!tasksPath) {
    console.error('Error: --tasks <path-to-tasks.md> is required');
    process.exit(1);
  }
  const owner = opts.owner || DEFAULT_OWNER;
  const projectNum = Number(opts.project || DEFAULT_PROJECT_NUM);
  const repo = opts.repo || DEFAULT_REPO;
  const dryRun = Boolean(opts['dry-run']);

  const byIssue = parseTasksByIssue(tasksPath);
  if (byIssue.size === 0) {
    console.log(`[gh-project-sync] No [GH:#N] tags found in ${tasksPath}. Nothing to sync.`);
    return;
  }

  const projectInfo = ghJson(['project', 'view', String(projectNum), '--owner', owner, '--format', 'json']);
  const fieldsData = ghJson(['project', 'field-list', String(projectNum), '--owner', owner, '--format', 'json']);
  const itemsData = ghJson(['project', 'item-list', String(projectNum), '--owner', owner, '--limit', '500', '--format', 'json']);

  const statusField = (fieldsData.fields || []).find((f) => f.name === 'Status');
  if (!statusField) {
    console.error('Error: Status field not found in project');
    process.exit(1);
  }
  const optionByName = Object.fromEntries((statusField.options || []).map((o) => [o.name, o.id]));

  const itemByIssue = new Map();
  for (const it of itemsData.items || []) {
    if (it.content?.number) {
      itemByIssue.set(Number(it.content.number), it);
    }
  }

  let shortHash = opts.commit || '';
  if (!shortHash) {
    try {
      shortHash = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
      shortHash = 'local';
    }
  }

  for (const [issueNum, stats] of byIssue.entries()) {
    const item = itemByIssue.get(issueNum);
    if (!item) {
      console.warn(`[gh-project-sync] Issue #${issueNum} not found in Project #${projectNum}, skipping.`);
      continue;
    }
    const targetStatus = stats.total > 0 && stats.done === stats.total ? 'Done' : 'In Progress';
    const targetOptId = optionByName[targetStatus];
    if (!targetOptId) {
      console.warn(`[gh-project-sync] Status option "${targetStatus}" not found, skipping #${issueNum}.`);
      continue;
    }

    if (item.status === targetStatus) {
      console.log(`[gh-project-sync] #${issueNum} already "${targetStatus}" (${stats.done}/${stats.total} tasks).`);
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] #${issueNum}: ${item.status} -> ${targetStatus} (${stats.done}/${stats.total})`);
      continue;
    }

    ghRun([
      'project', 'item-edit',
      '--project-id', projectInfo.id,
      '--id', item.id,
      '--field-id', statusField.id,
      '--single-select-option-id', targetOptId,
    ]);
    console.log(`[gh-project-sync] #${issueNum}: ${item.status} -> ${targetStatus} (${stats.done}/${stats.total})`);

    if (targetStatus === 'Done') {
      const taskSummary = stats.taskIds.length <= 6
        ? stats.taskIds.join(', ')
        : `${stats.taskIds[0]}..${stats.taskIds[stats.taskIds.length - 1]} (${stats.total} tareas)`;
      const comment = `✅ Completado en commit \`${shortHash}\` (${taskSummary} marcadas \`[x]\` en \`${tasksPath}\`).`;
      ghRun(['issue', 'comment', String(issueNum), '--repo', repo, '--body', comment]);
      console.log(`[gh-project-sync] Commented on #${issueNum}`);
    }
  }
}

const { cmd, opts } = parseArgs(process.argv.slice(2));
if (cmd === 'pull') {
  cmdPull(opts);
} else if (cmd === 'sync') {
  cmdSync(opts);
} else {
  console.log('Usage:\n  node scripts/gh-project-sync.mjs pull --fase "Feature 007"\n  node scripts/gh-project-sync.mjs sync --tasks specs/007-.../tasks.md [--dry-run]');
  process.exit(cmd ? 1 : 0);
}
