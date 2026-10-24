const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline/promises');

const digest = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const inside = (root, relative) => {
  const result = path.resolve(root, relative);
  if (!result.startsWith(root + path.sep)) throw new Error('Caminho de atualizacao invalido.');
  return result;
};
const allowed = (file) => typeof file === 'string'
  && (file === 'server.js' || (/^public\/[a-zA-Z0-9_./-]+$/.test(file)
    && /\.(js|css|html|svg|png|jpe?g|webp|ico|woff2?|LICENSE)$/i.test(file)))
  && !file.split('/').some((part) => !part || part === '.' || part === '..');

async function exists(file) {
  try { await fs.access(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function updateInstallation(packageDirectory, targetDirectory) {
  const source = await fs.realpath(packageDirectory);
  const target = await fs.realpath(targetDirectory);
  if (source.toLowerCase() === target.toLowerCase()) {
    throw new Error('Extraia a atualizacao em uma pasta separada da instalacao e execute ATUALIZAR.bat nessa pasta.');
  }
  const manifestPath = path.join(source, 'update-manifest.json');
  if (!(await exists(manifestPath))) throw new Error('Use o pacote WP-RH-Holerite-Sender-ATUALIZACAO.zip, extraido em uma pasta separada.');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('Pacote de atualizacao invalido.');
  }
  const seen = new Set();
  const payload = [];
  for (const file of manifest.files) {
    if (!allowed(file.path) || seen.has(file.path.toLowerCase())) throw new Error('O pacote contem um arquivo nao permitido.');
    seen.add(file.path.toLowerCase());
    const content = await fs.readFile(inside(source, file.path));
    if (digest(content) !== file.sha256) throw new Error(`Arquivo incompleto ou alterado: ${file.path}. Extraia novamente o ZIP.`);
    payload.push({ path: file.path, content });
  }
  const database = inside(target, 'Planilha/colaboradores.csv');
  if (!(await exists(inside(target, 'server.js'))) || !(await exists(inside(target, 'package.json'))) || !(await exists(database))) {
    throw new Error('Instalacao nao encontrada. Escolha a pasta que contem server.js, package.json e Planilha/colaboradores.csv. Nenhum arquivo foi alterado.');
  }
  const originalDatabase = await fs.readFile(database);
  const databaseHash = digest(originalDatabase);
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;
  const backup = inside(target, `.backups/atualizacao-${id}`);
  const lock = inside(target, '.rh-update.lock');
  const lockHandle = await fs.open(lock, 'wx').catch((error) => {
    if (error.code === 'EEXIST') throw new Error('Ja existe uma atualizacao em andamento. Confira antes de executar novamente.');
    throw error;
  });
  const records = [];
  const temporaryFiles = [];
  const changed = [];
  try {
    await fs.mkdir(path.join(backup, 'Planilha'), { recursive: true });
    await fs.writeFile(path.join(backup, 'Planilha', 'colaboradores.csv'), originalDatabase);
    // Finish every backup before replacing the first application file.
    for (const file of payload) {
      const destination = inside(target, file.path);
      let parent = path.dirname(destination);
      while (parent !== target) {
        if (await exists(parent)) {
          if ((await fs.lstat(parent)).isSymbolicLink()) throw new Error('A pasta de destino possui um atalho. Use uma instalacao em pasta local.');
        }
        parent = path.dirname(parent);
      }
      const originalExists = await exists(destination);
      if (originalExists) {
        const stat = await fs.lstat(destination);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Destino invalido: ${file.path}`);
        const backupFile = inside(backup, file.path);
        await fs.mkdir(path.dirname(backupFile), { recursive: true });
        await fs.copyFile(destination, backupFile);
      }
      records.push({ path: file.path, existed: originalExists });
    }
    await fs.writeFile(path.join(backup, 'backup-manifest.json'), JSON.stringify({ databaseHash, files: records }, null, 2));
    for (const file of payload) {
      const destination = inside(target, file.path);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      const temporary = `${destination}.rh-update-${id}`;
      temporaryFiles.push(temporary);
      await fs.writeFile(temporary, file.content);
      await fs.rename(temporary, destination);
      changed.push(file.path);
    }
    if (digest(await fs.readFile(database)) !== databaseHash) {
      throw new Error('O cadastro mudou durante a atualizacao. Feche o sistema antes de tentar novamente.');
    }
    return { backup, filesUpdated: payload.length, databasePreserved: true };
  } catch (error) {
    const rollbackErrors = [];
    for (const relative of changed.reverse()) {
      try {
        const record = records.find((item) => item.path === relative);
        const destination = inside(target, relative);
        if (record.existed) await fs.copyFile(inside(backup, relative), destination);
        else await fs.unlink(destination);
      } catch (rollbackError) { rollbackErrors.push(rollbackError.message); }
    }
    throw new Error(`${error.message}\nBackup: ${backup}${rollbackErrors.length ? '\nFalha ao restaurar alguns arquivos: ' + rollbackErrors.join('; ') : ''}`);
  } finally {
    for (const temporary of temporaryFiles) await fs.unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') console.error(error.message); });
    await lockHandle.close();
    await fs.unlink(lock);
  }
}

async function main() {
  console.log('\nUAI TELECOM - ATUALIZACAO DO PAINEL RH\n');
  console.log('Feche o sistema e a janela do servidor antes de continuar.');
  console.log('Cadastros, holerites, relatorios e sessao do WhatsApp serao preservados.\n');
  const args = process.argv.slice(2);
  const index = args.indexOf('--target');
  let target = index >= 0 ? args[index + 1] : '';
  if (!target) {
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    try { target = await prompt.question('Cole o caminho da pasta do sistema ja instalado: '); }
    finally { prompt.close(); }
  }
  target = String(target).trim().replace(/^"(.*)"$/, '$1');
  if (!target) throw new Error('Informe a pasta da instalacao existente.');
  const result = await updateInstallation(path.resolve(__dirname, '..'), path.resolve(target));
  console.log(`\nAtualizacao concluida. ${result.filesUpdated} arquivos de codigo atualizados.`);
  console.log('Cadastro de colaboradores conferido: arquivo preservado sem alteracoes.');
  console.log(`Backup automatico: ${result.backup}`);
  console.log('Abra o sistema como de costume e atualize o navegador com Ctrl+F5.\n');
}

module.exports = { updateInstallation, allowed };
if (require.main === module) main().catch((error) => { console.error(`\nNAO FOI POSSIVEL ATUALIZAR\n${error.message}`); process.exitCode = 1; });
