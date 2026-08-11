#!/usr/bin/env node
// Parses a raw factoid dump (the `* `cmd [aliases] (embed) - desc`` format
// exported from the TuringBot Discord bot) and merges it into
// src/components/FactoidReference.astro, preserving categories already
// assigned to known commands and flagging new/removed ones for review.
//
// Usage: node scripts/sync-factoids.mjs <path-to-raw-dump.txt>

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPONENT_PATH = path.join(__dirname, '..', 'src', 'components', 'FactoidReference.astro');

const dumpPath = process.argv[2];
if (!dumpPath) {
  console.error('Usage: node scripts/sync-factoids.mjs <path-to-raw-dump.txt>');
  process.exit(1);
}

// Known non-informational entries (memes, internal templates, test factoids)
// that don't belong in a troubleshooting quick-reference. Edit this list to
// taste -- anything removed from it will show up in the reference again on
// the next run.
const EXCLUDE = new Set([
  'broken', 'calloutstyletest', 'can', 'cw', 'dnsmeme', 'dpp', 'embed',
  'gamethreads', 'ibmmeme', 'jimss', 'jumpstartvid', 'kali', 'musketmeme',
  'mwanalogy', 'name with space', 'nsfw', 'paste', 'pastespread', 'pat',
  'ramvendor', 'read', 'reboot', 'rgbconnectors', 'sleep', 'sports',
  'templateall', 'templatedesc', 'templatefields', 'templateimage',
  'templatewiki', 'test', 'tldr', 'tuesday', 'usbc', 'ventoykey', 'virus',
  'xp', 'notq', 'drivesize', 'dnsflush' /* keep real ones, remove test flags below */
]);
// dnsflush is real -- remove the accidental include above
EXCLUDE.delete('dnsflush');

function parseDump(text) {
  const entries = [];
  const lineRe = /^\*\s*`(.+)`\s*$/;
  for (const rawLine of text.split('\n')) {
    const m = rawLine.match(lineRe);
    if (!m) continue;
    const body = m[1];
    // cmd [aliases] (embed) - desc   OR   cmd (embed) - desc   OR   cmd - desc
    const entryRe = /^(.+?)(?:\s*\[(.*?)\])?\s*(?:\(embed\))?\s+-\s+(.*)$/;
    const em = body.match(entryRe);
    if (!em) continue;
    const cmd = em[1].trim();
    const aliases = em[2] ? em[2].split(',').map(a => a.trim()).filter(Boolean) : [];
    const desc = em[3].trim();
    entries.push({ cmd, aliases, desc });
  }
  return entries;
}

function loadExistingFactoids(componentSrc) {
  const m = componentSrc.match(/const FACTOIDS = (\[[\s\S]*?\]);/);
  if (!m) throw new Error('Could not find FACTOIDS array in component');
  const data = JSON.parse(m[1]);
  const byCmd = new Map();
  for (const f of data) byCmd.set(f.cmd, f);
  return { raw: m[0], array: m[1], byCmd };
}

const dumpText = readFileSync(dumpPath, 'utf8');
const componentSrc = readFileSync(COMPONENT_PATH, 'utf8');

const parsed = parseDump(dumpText);
const { raw: oldRaw, byCmd: oldByCmd } = loadExistingFactoids(componentSrc);

const added = [];
const changed = [];
const excluded = [];
const merged = [];

for (const entry of parsed) {
  if (EXCLUDE.has(entry.cmd)) {
    excluded.push(entry.cmd);
    continue;
  }
  const existing = oldByCmd.get(entry.cmd);
  const cat = existing ? existing.cat : 'Other';
  if (!existing) {
    added.push(entry.cmd);
  } else if (existing.desc !== entry.desc || JSON.stringify(existing.aliases) !== JSON.stringify(entry.aliases)) {
    changed.push(entry.cmd);
  }
  merged.push({ cmd: entry.cmd, aliases: entry.aliases, desc: entry.desc, cat });
}

const newCmds = new Set(parsed.map(e => e.cmd));
const removed = [...oldByCmd.keys()].filter(c => !newCmds.has(c));

merged.sort((a, b) => a.cmd.localeCompare(b.cmd));

const newArrayJson = JSON.stringify(merged);
const newRaw = `const FACTOIDS = ${newArrayJson};`;
const newComponentSrc = componentSrc.replace(oldRaw, newRaw);
writeFileSync(COMPONENT_PATH, newComponentSrc, 'utf8');

console.log(`Total parsed: ${parsed.length}`);
console.log(`Excluded (meme/template/test): ${excluded.length}`);
console.log(`  ${excluded.join(', ')}`);
console.log(`Added (new, defaulted to "Other" category -- review these): ${added.length}`);
console.log(`  ${added.join(', ') || '(none)'}`);
console.log(`Changed description/aliases: ${changed.length}`);
console.log(`  ${changed.join(', ') || '(none)'}`);
console.log(`Removed (no longer in source, dropped from file): ${removed.length}`);
console.log(`  ${removed.join(', ') || '(none)'}`);
console.log(`\nFactoidReference.astro updated with ${merged.length} entries.`);
