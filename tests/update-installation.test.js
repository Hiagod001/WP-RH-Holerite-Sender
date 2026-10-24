import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { updateInstallation, allowed } = require('../scripts/atualizar.cjs');
const { createUpdateFolder } = require('../scripts/gerar-atualizacao.cjs');
const project = fileURLToPath(new URL('..', import.meta.url));

async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rh-update-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'pacote com espacos');
  const target = path.join(root, 'RH instalado');
  await fs.mkdir(source);
  await fs.mkdir(target);
  const protectedFiles = {
    'Planilha/colaboradores.csv': 'id,nome,numero,arquivo\n1,Álvaro Antigo,5511999990000,alvaro.pdf\n',
    'Holerites/2026-10/alvaro.pdf': '%PDF-1.4 arquivo existente',
    'Planilha/relatorios-holerites/antigo.csv': 'nome,status\nÁlvaro,enviado\n',
    'auth_info/creds.json': '{"fakeSession":"do-not-overwrite"}',
    'database.sqlite': 'existing-database-bytes',
    '.env': 'PORT=3100\n',
    'iniciar.bat': '@echo off\nnode server.js\n',
    'package.json': '{"type":"module","private":true}',
    'package-lock.json': '{"lockfileVersion":3}',
    'node_modules/installed.txt': 'existing dependencies'
  };
  for (const [relative, content] of Object.entries({ ...protectedFiles, 'server.js': '// old server', 'public/index.html': '<h1>Old UI</h1>' })) {
    const destination = path.join(target, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content);
  }
  const manifest = await createUpdateFolder(project, source);
  return { root, source, target, protectedFiles, manifest };
}

test('update changes code, backs up existing CSV and preserves every data file byte for byte', async (t) => {
  const { source, target, protectedFiles, manifest } = await setup(t);
  assert.ok(manifest.files.every((file) => file.path === 'server.js' || file.path.startsWith('public/')));
  assert.equal(manifest.files.some((file) => /\.pdf$|colaboradores|\.sqlite|auth_info/.test(file.path)), false);
  const result = await updateInstallation(source, target);
  assert.equal(result.databasePreserved, true);
  for (const [relative, content] of Object.entries(protectedFiles)) {
    assert.deepEqual(await fs.readFile(path.join(target, relative)), Buffer.from(content), `Changed protected file: ${relative}`);
  }
  assert.equal(await fs.readFile(path.join(result.backup, 'server.js'), 'utf8'), '// old server');
  assert.equal(await fs.readFile(path.join(result.backup, 'public/index.html'), 'utf8'), '<h1>Old UI</h1>');
  assert.equal(await fs.readFile(path.join(result.backup, 'Planilha/colaboradores.csv'), 'utf8'), protectedFiles['Planilha/colaboradores.csv']);
  assert.deepEqual(await fs.readFile(path.join(target, 'server.js')), await fs.readFile(path.join(source, 'server.js')));
  assert.deepEqual(await fs.readFile(path.join(target, 'public/app.js')), await fs.readFile(path.join(source, 'public/app.js')));
  await assert.rejects(fs.access(path.join(target, '.rh-update.lock')));
});

test('rejects corrupt payload before replacing any existing code or creating a backup', async (t) => {
  const { source, target } = await setup(t);
  await fs.appendFile(path.join(source, 'public/app.js'), '\n// corrupted');
  await assert.rejects(updateInstallation(source, target), /incompleto ou alterado/);
  assert.equal(await fs.readFile(path.join(target, 'server.js'), 'utf8'), '// old server');
  await assert.rejects(fs.access(path.join(target, '.backups')));
});

test('restores previous code if a later replacement fails and never restores over the live CSV', async (t) => {
  const { source, target, protectedFiles, manifest } = await setup(t);
  manifest.files.sort((left, right) => (left.path === 'server.js' ? -1 : right.path === 'server.js' ? 1 : 0));
  await fs.writeFile(path.join(source, 'update-manifest.json'), JSON.stringify(manifest));
  const originalRename = fs.rename;
  fs.rename = async (from, to) => {
    if (path.basename(to) === 'app.js') throw new Error('Falha de disco simulada');
    return originalRename(from, to);
  };
  try { await assert.rejects(updateInstallation(source, target), /Falha de disco simulada/); }
  finally { fs.rename = originalRename; }
  assert.equal(await fs.readFile(path.join(target, 'server.js'), 'utf8'), '// old server');
  assert.equal(await fs.readFile(path.join(target, 'public/index.html'), 'utf8'), '<h1>Old UI</h1>');
  assert.equal(await fs.readFile(path.join(target, 'Planilha/colaboradores.csv'), 'utf8'), protectedFiles['Planilha/colaboradores.csv']);
  await assert.rejects(fs.access(path.join(target, '.rh-update.lock')));
});

test('rejects attempts to update the employee database and rejects the wrong installation folder', async (t) => {
  const { root, source, target, manifest } = await setup(t);
  await fs.writeFile(path.join(source, 'update-manifest.json'), JSON.stringify({ ...manifest, files: [{ path: 'Planilha/colaboradores.csv', sha256: '' }] }));
  await assert.rejects(updateInstallation(source, target), /nao permitido/);
  await fs.writeFile(path.join(source, 'update-manifest.json'), JSON.stringify(manifest));
  await assert.rejects(updateInstallation(source, root), /Instalacao nao encontrada/);
  await assert.rejects(updateInstallation(source, source), /pasta separada/);
  for (const relative of ['public/../Planilha/colaboradores.csv', 'auth_info/creds.json', 'public/private.pdf', 'package.json', '/server.js']) {
    assert.equal(allowed(relative), false, relative);
  }
});
