import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

test('October and November PDFs remain independent; a payment on November 5 sends October correctly', async (t) => {
  const project = fileURLToPath(new URL('..', import.meta.url));
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'rh-competence-'));
  await fs.mkdir(path.join(fixture, 'public'));
  await fs.mkdir(path.join(fixture, 'Planilha'));
  await fs.copyFile(path.join(project, 'server.js'), path.join(fixture, 'server.js'));
  for (const module of ['employee-order.js', 'payslip-month.js']) {
    await fs.copyFile(path.join(project, 'public', module), path.join(fixture, 'public', module));
  }
  await fs.writeFile(path.join(fixture, 'package.json'), '{"type":"module"}');
  await fs.symlink(path.join(project, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
  const id = '12345678-1234-1234-1234-123456789012';
  const legacyOctober = `maria-${id.slice(0, 8)}-2026-10.pdf`;
  const legacyNovember = `maria-${id.slice(0, 8)}-2026-11.pdf`;
  const database = Buffer.from(`id,nome,numero,arquivo\n${id},Maria,5511999990000,${legacyNovember}\n`);
  await fs.writeFile(path.join(fixture, 'Planilha', 'colaboradores.csv'), database);
  for (const [month, file] of [['2026-10', legacyOctober], ['2026-11', legacyNovember]]) {
    await fs.mkdir(path.join(fixture, 'Holerites', month), { recursive: true });
    await fs.writeFile(path.join(fixture, 'Holerites', month, file), `%PDF-1.4 legacy ${month}`);
  }
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const capture = path.join(fixture, 'sent.jsonl');
  const child = spawn(process.execPath, ['--experimental-loader', new URL('./fixtures/fake-baileys-loader.mjs', import.meta.url).href, 'server.js'], {
    cwd: fixture, env: { ...process.env, PORT: String(port), RH_TEST_CAPTURE: capture }, stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    await fs.rm(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  await new Promise((resolve, reject) => {
    let diagnostics = '';
    child.stderr.on('data', (data) => { diagnostics += data; });
    const timeout = setTimeout(() => reject(new Error('Test server startup timed out')), 15000);
    child.once('error', reject);
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Test server exited with ${code}: ${diagnostics}`)); });
    child.stdout.on('data', (data) => { if (String(data).includes('Servidor Node')) { clearTimeout(timeout); resolve(); } });
  });
  const request = async (url, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${port}${url}`, { ...options, signal: AbortSignal.timeout(10000) });
    return { code: response.status, data: await response.json() };
  };
  const preview = async (month) => {
    const result = await request(`/api/payslips-preview?month=${month}`);
    assert.equal(result.code, 200);
    return result.data.results[0];
  };
  assert.equal((await preview('2026-10')).payslip_file, legacyOctober, 'Recover October even though the old CSV points to November');
  const upload = async (month, pdf) => {
    const form = new FormData();
    if (month !== undefined) form.append('month', month);
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'pagamento.pdf');
    return request(`/api/hr/employees/${id}/payslip`, { method: 'POST', body: form });
  };
  assert.equal((await upload(undefined, '%PDF-1.4 invalid')).code, 400);
  const october = await upload('2026-10', '%PDF-1.4 NEW OCTOBER');
  const november = await upload('2026-11', '%PDF-1.4 NEW NOVEMBER');
  assert.equal(october.code, 200);
  assert.equal(november.code, 200);
  assert.notEqual(october.data.file_name, november.data.file_name);
  assert.deepEqual(await fs.readFile(path.join(fixture, 'Planilha', 'colaboradores.csv')), database, 'Upload must not rewrite the employee database');
  assert.equal((await preview('2026-10')).payslip_file, october.data.file_name);
  assert.equal((await preview('2026-11')).payslip_file, november.data.file_name);
  assert.equal((await preview('2026-12')).payslip_file, '', 'An unregistered month must remain pending');
  const send = (body) => request('/api/send-payslips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await send({})).code, 400);
  assert.equal((await send({ month: '2026-10', message: 'Holerite de novembro.' })).code, 400);
  const octoberSend = await send({ month: '2026-10', message: 'Olá {nome}, holerite referente a {mes}.' });
  const novemberSend = await send({ month: '2026-11' });
  assert.equal(octoberSend.code, 200);
  assert.equal(novemberSend.code, 200);
  assert.equal(octoberSend.data.success_count, 1);
  const sent = (await fs.readFile(capture, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].pdf, '%PDF-1.4 NEW OCTOBER');
  assert.match(sent[0].message.caption, /outubro de 2026/);
  assert.doesNotMatch(sent[0].message.caption, /novembro/);
  assert.equal(sent[1].pdf, '%PDF-1.4 NEW NOVEMBER');
  assert.match(sent[1].message.caption, /novembro de 2026/);
  const rename = await request(`/api/hr/employees/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Maria Silva', phone: '5511999990000' }) });
  assert.equal(rename.code, 200);
  assert.equal((await preview('2026-10')).payslip_file, october.data.file_name, 'Renaming must not break monthly links');
  await upload('2026-10', '%PDF-1.4 REPLACED OCTOBER');
  assert.equal((await preview('2026-11')).payslip_file, november.data.file_name, 'Replacing October must preserve November');
  assert.equal(await fs.readFile(path.join(fixture, 'Holerites', '2026-10', legacyOctober), 'utf8'), '%PDF-1.4 legacy 2026-10');
});
