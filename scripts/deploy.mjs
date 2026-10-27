#!/usr/bin/env node
/**
 * Publish static frontend to Cloudflare Pages and an rsync mirror.
 * All deployment-specific targets are read from process.env (.env in deploy.sh).
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const KEYS = [
  'DTP_CF_PAGES_PROJECT',
  'DTP_CF_PAGES_URL',
  'DTP_MIRROR_TARGET',
  'DTP_MIRROR_URL',
];

export function deploySettings(env) {
  const cfg = {};
  for (const key of KEYS) {
    const value = String(env[key] ?? '').trim();
    if (!value) {
      throw new Error(`Missing ${key} in .env (see .env.example)`);
    }
    cfg[key] = value;
  }
  for (const key of ['DTP_CF_PAGES_URL', 'DTP_MIRROR_URL']) {
    const url = new URL(cfg[key]);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname
      || url.username || url.password) {
      throw new Error(`Invalid public URL in ${key}`);
    }
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(cfg.DTP_CF_PAGES_PROJECT)) {
    throw new Error('Invalid DTP_CF_PAGES_PROJECT');
  }
  // rsync destination must be remote host:path, not an arbitrary flag or local path.
  if (!/^[a-zA-Z0-9_.@-]+:[^\s]+$/.test(cfg.DTP_MIRROR_TARGET)
    || cfg.DTP_MIRROR_TARGET.startsWith('-')) {
    throw new Error('DTP_MIRROR_TARGET must be an SSH destination host:path');
  }
  return cfg;
}

function command(binary, args) {
  const result = spawnSync(binary, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${binary} exited with ${result.status ?? result.signal}`);
  }
}

export function deploy(env = process.env) {
  // Fail on absent/malformed settings BEFORE build/upload/rsync.
  const cfg = deploySettings(env);
  command('npm', ['run', 'build']);
  command('npx', ['wrangler', 'pages', 'deploy', 'dist',
    '--project-name', cfg.DTP_CF_PAGES_PROJECT]);
  command('rsync', ['-az', '--delete', '--exclude=maps-config.js',
    '-e', 'ssh -o BatchMode=yes', 'dist/', cfg.DTP_MIRROR_TARGET]);
  console.log(`Published: ${cfg.DTP_CF_PAGES_URL} and ${cfg.DTP_MIRROR_URL}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    deploy();
  } catch (error) {
    console.error(`Deploy failed: ${error.message}`);
    process.exitCode = 1;
  }
}
