const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { allowed } = require('./atualizar.cjs');

async function createUpdateFolder(project, destination) {
  const files = ['server.js'];
  async function walk(directory, prefix) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative);
      else if (entry.isFile()) { if (allowed(relative)) files.push(relative); }
      else throw new Error(`Tipo de arquivo nao permitido: ${relative}`);
    }
  }
  await walk(path.join(project, 'public'), 'public');
  const manifest = { version: 1, files: [] };
  for (const relative of files.sort()) {
    const content = await fs.readFile(path.join(project, relative));
    const target = path.join(destination, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
    manifest.files.push({ path: relative, sha256: crypto.createHash('sha256').update(content).digest('hex') });
  }
  for (const relative of ['ATUALIZAR.bat', 'ATUALIZACAO.md', 'scripts/atualizar.cjs']) {
    const target = path.join(destination, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(project, relative), target);
  }
  await fs.writeFile(path.join(destination, 'update-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

async function main() {
  const project = path.resolve(__dirname, '..');
  const output = path.resolve(process.argv[2] || path.join(project, 'WP-RH-Holerite-Sender-ATUALIZACAO.zip'));
  const stage = await fs.mkdtemp(path.join(os.tmpdir(), 'uai-rh-update-'));
  const archive = stage + '.zip';
  try {
    const manifest = await createUpdateFolder(project, stage);
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "$ErrorActionPreference = 'Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:RH_UPDATE_STAGE, $env:RH_UPDATE_ZIP)"
    ], { env: { ...process.env, RH_UPDATE_STAGE: stage, RH_UPDATE_ZIP: archive }, stdio: 'pipe' });
    await fs.copyFile(archive, output);
    console.log(`Pacote criado: ${output}\n${manifest.files.length} arquivos de codigo. Nenhum cadastro ou documento incluido.`);
  } finally {
    if (!stage.startsWith(path.join(os.tmpdir(), 'uai-rh-update-'))) throw new Error('Pasta temporaria invalida.');
    await fs.rm(stage, { recursive: true, force: true });
    await fs.unlink(archive).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

module.exports = { createUpdateFolder };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
