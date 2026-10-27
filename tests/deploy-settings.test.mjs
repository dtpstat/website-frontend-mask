import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deploySettings } from '../scripts/deploy.mjs';

const valid = {
  DTP_CF_PAGES_PROJECT: 'frontend-project',
  DTP_CF_PAGES_URL: 'https://cloud.example.org/',
  DTP_MIRROR_TARGET: 'site@host.example.org:public/dist/',
  DTP_MIRROR_URL: 'https://mirror.example.org/map/',
};

test('deployment config accepts independent public and SSH destinations', () => {
  assert.deepEqual(deploySettings(valid), valid);
});

test('deployment config fails before any commands on missing value', () => {
  assert.throws(() => deploySettings({ ...valid, DTP_CF_PAGES_URL: '' }), /DTP_CF_PAGES_URL/);
});

test('deployment config rejects javascript and credentialed URLs', () => {
  assert.throws(() => deploySettings({ ...valid, DTP_CF_PAGES_URL: 'javascript:alert(1)' }), /Invalid public URL/);
  assert.throws(() => deploySettings({ ...valid, DTP_MIRROR_URL: 'https://user:pass@example.org' }), /Invalid public URL/);
});

test('deployment config rejects local paths and rsync flag injection', () => {
  assert.throws(() => deploySettings({ ...valid, DTP_MIRROR_TARGET: '/tmp/dist/' }), /SSH destination/);
  assert.throws(() => deploySettings({ ...valid, DTP_MIRROR_TARGET: '-e malicious:dist/' }), /SSH destination/);
});

test('deployment config checks Pages project slug', () => {
  assert.throws(() => deploySettings({ ...valid, DTP_CF_PAGES_PROJECT: '../other' }), /Invalid DTP_CF_PAGES_PROJECT/);
});
