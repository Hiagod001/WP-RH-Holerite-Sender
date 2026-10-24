import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';

test('API keeps new and edited registrations alphabetical without changing IDs or PDFs', async (t) => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'uai-rh-api-'));
  await fs.mkdir(path.join(fixture, 'public'));
  await fs.mkdir(path.join(fixture, 'Planilha'));
  await fs.copyFile(path.join(root, 'server.js'), path.join(fixture, 'server.js'));
  await fs.copyFile(path.join(root, 'public', 'employee-order.js'), path.join(fixture, 'public', 'employee-order.js'));
  await fs.writeFile(path.join(fixture, 'package.json'), JSON.stringify({ type: 'module' }));
  await fs.symlink(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'junction');
  await fs.writeFile(path.join(fixture, 'Planilha', 'colaboradores.csv'),
    'id,nome,numero,arquivo\nz,Zuleica,5511999990001,zuleica.pdf\na,Álvaro,5511999990002,alvaro.pdf\nm,Maria,5511999990003,\n');
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, ['server.js'], { cwd: fixture, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await once(child, 'exit'); }
    await fs.rm(fixture, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timed out')), 15000);
    child.once('error', reject);
    child.stdout.on('data', (data) => { if (String(data).includes('Servidor Node')) { clearTimeout(timeout); resolve(); } });
  });
  async function request(url, method = 'GET', body) {
    const response = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(5000) });
    assert.ok(response.ok, `Unexpected HTTP ${response.status}`);
    return response.json();
  }
  const names = async () => (await request('/api/hr/employees')).employees.map((item) => item.name);
  assert.deepEqual(await names(), ['Álvaro', 'Maria', 'Zuleica']);
  const created = await request('/api/hr/employees', 'POST', { name: 'Aarão', phone: '5511999990004' });
  assert.deepEqual(await names(), ['Aarão', 'Álvaro', 'Maria', 'Zuleica']);
  const renamed = await request('/api/hr/employees/z', 'PUT', { name: 'Aline', phone: '5511999990001' });
  assert.equal(renamed.employee.file, 'zuleica.pdf');
  assert.equal(renamed.employee.id, 'z');
  assert.deepEqual(await names(), ['Aarão', 'Aline', 'Álvaro', 'Maria']);
  const preview = await request('/api/payslips-preview?month=2026-10');
  assert.deepEqual(preview.results.map((item) => item.name), ['Aarão', 'Aline', 'Álvaro', 'Maria']);
  await request(`/api/hr/employees/${created.employee.id}`, 'DELETE');
  assert.deepEqual(await names(), ['Aline', 'Álvaro', 'Maria']);
});
