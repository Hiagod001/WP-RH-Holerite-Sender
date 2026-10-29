import express from 'express';
import fs from 'fs/promises';
import multer from 'multer';
import path from 'path';
import pino from 'pino';
import { createHash, randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { sortEmployees } from './public/employee-order.js';
import { validateMonth, formatPayslipMonth, buildPayslipCaption, validatePayslipMessage } from './public/payslip-month.js';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestWaWebVersion,
  useMultiFileAuthState
} from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const logger = pino({ level: 'silent' });

const state = {
  status: 'starting',
  qrString: '',
  updatedAt: new Date().toISOString(),
  message: 'Inicializando cliente do WhatsApp...'
};

let sock = null;
let saveCredsRef = null;
let reconnectTimer = null;
let connectInProgress = false;
let payslipBatchInProgress = false;
const authFolderPath = path.join(__dirname, 'auth_info');
const employeesFilePath = path.join(__dirname, 'Planilha', 'colaboradores.csv');
const payslipsFolderPath = path.join(__dirname, 'Holerites');
const payslipReportsFolderPath = path.join(__dirname, 'Planilha', 'relatorios-holerites');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      callback(null, true);
      return;
    }

    callback(new Error('Envie apenas arquivos PDF'));
  }
});

function updateState(status, qrString = '', message = '') {
  state.status = status;
  state.qrString = qrString;
  state.updatedAt = new Date().toISOString();
  state.message = message;
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTextKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value) {
  return normalizeTextKey(value).replace(/\s+/g, '-');
}

function sanitizeFileName(value) {
  const extension = path.extname(value || '').toLowerCase() || '.pdf';
  const baseName = path.basename(value || 'holerite', path.extname(value || ''));
  const safeBaseName = slugify(baseName) || 'holerite';
  const safeExtension = extension === '.pdf' ? extension : '.pdf';

  return `${safeBaseName}${safeExtension}`;
}

function escapeCsvValue(value) {
  const text = String(value ?? '');

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function detectCsvDelimiter(line) {
  const commaCount = (line.match(/,/g) || []).length;
  const semicolonCount = (line.match(/;/g) || []).length;

  return semicolonCount > commaCount ? ';' : ',';
}

function parseCsvLine(line, delimiter = ',') {
  const values = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && insideQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === delimiter && !insideQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function resolveColumnIndex(headers, names) {
  const normalizedNames = names.map(normalizeTextKey);

  return headers.findIndex((header) => normalizedNames.includes(normalizeTextKey(header)));
}

async function readEmployeeEntries() {
  let rawContent = '';

  try {
    rawContent = await fs.readFile(employeesFilePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const lines = rawContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  const idIndex = resolveColumnIndex(headers, ['id', 'codigo']);
  const nameIndex = resolveColumnIndex(headers, ['nome', 'colaborador', 'funcionario']);
  const phoneIndex = resolveColumnIndex(headers, ['numero', 'telefone', 'celular', 'whatsapp']);
  const fileIndex = resolveColumnIndex(headers, ['arquivo', 'holerite', 'pdf']);

  if (phoneIndex === -1) {
    throw new Error('A planilha Planilha/colaboradores.csv precisa ter uma coluna numero, telefone, celular ou whatsapp');
  }

  const employees = lines.slice(1).map((line, index) => {
    const row = parseCsvLine(line, delimiter);
    const id = idIndex >= 0 ? String(row[idIndex] || '').trim() : `legacy-${index + 2}`;
    const name = nameIndex >= 0 ? String(row[nameIndex] || '').trim() : '';
    const phone = normalizePhone(row[phoneIndex] || '');
    const file = fileIndex >= 0 ? String(row[fileIndex] || '').trim() : '';

    return {
      id: id || `legacy-${index + 2}`,
      row_number: index + 2,
      name,
      phone,
      file
    };
  }).filter((entry) => entry.phone || entry.name || entry.file);
  return sortEmployees(employees);
}

async function writeEmployeeEntries(employees) {
  await fs.mkdir(path.dirname(employeesFilePath), { recursive: true });

  const header = ['id', 'nome', 'numero', 'arquivo'];
  const rows = sortEmployees(employees).map((employee) => [
    employee.id,
    employee.name,
    employee.phone,
    employee.file || ''
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n');

  await fs.writeFile(employeesFilePath, csv, 'utf8');
}

function normalizeEmployeePayload(body, existingId = '') {
  const name = String(body.name ?? body.nome ?? '').trim();
  const phone = normalizePhone(body.phone ?? body.numero ?? body.telefone ?? '');
  const file = String(body.file ?? body.arquivo ?? '').trim();

  if (!name) {
    throw new Error('Informe o nome do colaborador');
  }

  if (!phone || phone.length < 12) {
    throw new Error('Informe o WhatsApp com DDI + DDD + numero');
  }

  return {
    id: existingId || randomUUID(),
    name,
    phone,
    file: file ? sanitizeFileName(file) : ''
  };
}

function uploadSinglePdf(req, res) {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function listPayslipFiles(month) {
  const monthFolder = path.join(payslipsFolderPath, month);
  let entries = [];

  try {
    entries = await fs.readdir(monthFolder, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.pdf'))
    .map((entry) => ({
      name: entry.name,
      path: path.join(monthFolder, entry.name),
      normalizedName: normalizeTextKey(path.basename(entry.name, path.extname(entry.name))),
      slug: slugify(path.basename(entry.name, path.extname(entry.name)))
    }));
}

function monthlyPayslipFileName(employee, month) {
  const identity = createHash('sha256').update(String(employee.id)).digest('hex').slice(0, 32);
  return `holerite-${identity}-${month}.pdf`;
}

function findPayslipForEmployee(employee, payslipFiles, month) {
  const monthFolder = path.resolve(payslipsFolderPath, month);
  const monthlyFile = payslipFiles.find((file) => file.name === monthlyPayslipFileName(employee, month));
  if (monthlyFile) return monthlyFile;

  if (employee.file) {
    const requestedFileName = employee.file.toLowerCase().endsWith('.pdf')
      ? employee.file
      : `${employee.file}.pdf`;
    const requestedPath = path.resolve(monthFolder, requestedFileName);

    if (!requestedPath.startsWith(`${monthFolder}${path.sep}`) && requestedPath !== monthFolder) {
      return null;
    }

    const explicitFile = payslipFiles.find((file) => path.resolve(file.path) === requestedPath);
    if (explicitFile) return explicitFile;
  }

  // Older uploads embedded the employee ID and month in the filename.
  const legacySuffix = `-${employee.id.slice(0, 8)}-${month}.pdf`.toLowerCase();
  const legacyFiles = payslipFiles.filter((file) => file.name.toLowerCase().endsWith(legacySuffix));
  if (legacyFiles.length) return legacyFiles.length === 1 ? legacyFiles[0] : null;

  const phone = employee.phone;
  const nameKey = normalizeTextKey(employee.name);
  const matchingFiles = payslipFiles.filter((file) =>
    (phone && file.normalizedName === phone) || (nameKey && file.normalizedName === nameKey));
  return matchingFiles.length === 1 ? matchingFiles[0] : null;
}

function normalizeDelayConfig(body) {
  const minSeconds = Number(body.min_delay_seconds ?? body.minDelaySeconds ?? 45);
  const maxSeconds = Number(body.max_delay_seconds ?? body.maxDelaySeconds ?? 90);
  const safeMin = Number.isFinite(minSeconds) ? Math.max(5, Math.floor(minSeconds)) : 45;
  const safeMax = Number.isFinite(maxSeconds) ? Math.max(safeMin, Math.floor(maxSeconds)) : 90;

  return {
    minMs: safeMin * 1000,
    maxMs: safeMax * 1000,
    minSeconds: safeMin,
    maxSeconds: safeMax
  };
}

function getRandomDelayMs(minMs, maxMs) {
  if (maxMs <= minMs) {
    return minMs;
  }

  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

async function buildPayslipPlan(month) {
  const employees = await readEmployeeEntries();
  const payslipFiles = await listPayslipFiles(month);

  return employees.map((employee) => {
    const payslip = findPayslipForEmployee(employee, payslipFiles, month);

    return {
      ...employee,
      month,
      payslip_file: payslip?.name || '',
      payslip_label: payslip ? `Holerite - ${formatPayslipMonth(month)}.pdf` : '',
      payslip_path: payslip?.path || ''
    };
  });
}

async function writePayslipReport(month, results) {
  await fs.mkdir(payslipReportsFolderPath, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(payslipReportsFolderPath, `envio-holerites-${month}-${timestamp}.csv`);
  const header = ['nome', 'numero', 'arquivo', 'status', 'mensagem', 'message_id', 'jid'];
  const rows = results.map((item) => [
    item.name,
    item.phone,
    item.payslip_file,
    item.status,
    item.message || '',
    item.message_id || '',
    item.jid || ''
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n');

  await fs.writeFile(reportPath, csv, 'utf8');
  return reportPath;
}

async function resolveWhatsAppJid(phone) {
  const phoneJid = `${phone}@s.whatsapp.net`;
  const [result] = await sock.onWhatsApp(phoneJid);

  if (!result?.exists || !result?.jid) {
    return null;
  }

  return result.jid;
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(message = 'Tentando reconectar o WhatsApp...') {
  if (reconnectTimer) {
    return;
  }

  updateState('reconnecting', '', message);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWhatsApp().catch((error) => {
      updateState('error', '', `Falha ao reconectar: ${error.message}`);
      scheduleReconnect('Nova tentativa de conexao em alguns segundos...');
    });
  }, 5000);
}

async function connectWhatsApp() {
  if (connectInProgress) {
    return;
  }

  connectInProgress = true;
  clearReconnectTimer();
  updateState('starting', '', 'Inicializando cliente do WhatsApp...');

  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(
      authFolderPath
    );
    const { version } = await fetchLatestWaWebVersion();

    saveCredsRef = saveCreds;

    sock = makeWASocket({
      auth: authState,
      logger,
      browser: Browsers.windows('Desktop'),
      version,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCredsRef);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        updateState('waiting_qr', qr, 'Aguardando leitura do QR code.');
      }

      if (connection === 'open') {
        updateState('connected', '', 'WhatsApp conectado com sucesso.');
        return;
      }

      if (connection === 'connecting') {
        updateState('starting', '', 'Conectando ao WhatsApp...');
        return;
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || 'motivo nao informado';
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          scheduleReconnect(`Conexao perdida. Codigo: ${statusCode || 'desconhecido'}. Detalhe: ${errorMessage}`);
        } else {
          updateState('logged_out', '', 'Sessao desconectada. Gere um novo QR code.');
        }
      }
    });
  } finally {
    connectInProgress = false;
  }
}

async function resetWhatsAppSession() {
  clearReconnectTimer();
  payslipBatchInProgress = false;

  if (sock) {
    try {
      await sock.logout();
    } catch (error) {
      try {
        await sock.end(new Error('Sessao reiniciada manualmente'));
      } catch {
        // Ignora erro de encerramento secundario.
      }
    }

    sock = null;
  }

  await fs.rm(authFolderPath, { recursive: true, force: true });
  updateState('starting', '', 'Sessao removida. Gerando um novo QR code...');
  await connectWhatsApp();
}

app.get('/api/whatsapp-status', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({
    status: state.status,
    qr_string: state.qrString,
    updated_at: state.updatedAt,
    message: state.message,
    sending: payslipBatchInProgress
  });
});

app.get('/api/hr/employees', async (req, res) => {
  try {
    const employees = await readEmployeeEntries();

    return res.json({
      status: 'success',
      employees
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: `Erro ao listar colaboradores: ${error.message}`
    });
  }
});

app.post('/api/hr/employees', async (req, res) => {
  try {
    const employees = await readEmployeeEntries();
    const employee = normalizeEmployeePayload(req.body);

    employees.push(employee);
    await writeEmployeeEntries(employees);

    return res.status(201).json({
      status: 'success',
      employee
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

app.put('/api/hr/employees/:id', async (req, res) => {
  try {
    const employees = await readEmployeeEntries();
    const index = employees.findIndex((employee) => employee.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({
        status: 'error',
        message: 'Colaborador nao encontrado'
      });
    }

    const updatedEmployee = normalizeEmployeePayload(req.body, employees[index].id);
    const shouldUpdateFile = Object.prototype.hasOwnProperty.call(req.body, 'file')
      || Object.prototype.hasOwnProperty.call(req.body, 'arquivo');

    if (!shouldUpdateFile) {
      updatedEmployee.file = employees[index].file || '';
    }
    employees[index] = updatedEmployee;
    await writeEmployeeEntries(employees);

    return res.json({
      status: 'success',
      employee: updatedEmployee
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

app.delete('/api/hr/employees/:id', async (req, res) => {
  try {
    const employees = await readEmployeeEntries();
    const filteredEmployees = employees.filter((employee) => employee.id !== req.params.id);

    if (filteredEmployees.length === employees.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Colaborador nao encontrado'
      });
    }

    await writeEmployeeEntries(filteredEmployees);

    return res.json({
      status: 'success',
      message: 'Colaborador removido'
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: `Erro ao remover colaborador: ${error.message}`
    });
  }
});

app.post('/api/hr/employees/:id/payslip', async (req, res) => {
  try {
    await uploadSinglePdf(req, res);

    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'Escolha um arquivo PDF'
      });
    }

    const month = validateMonth(req.body.month);
    const employees = await readEmployeeEntries();
    const index = employees.findIndex((employee) => employee.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({
        status: 'error',
        message: 'Colaborador nao encontrado'
      });
    }

    const employee = employees[index];
    const fileName = monthlyPayslipFileName(employee, month);
    const monthFolder = path.join(payslipsFolderPath, month);
    const filePath = path.join(monthFolder, fileName);

    await fs.mkdir(monthFolder, { recursive: true });
    await fs.writeFile(filePath, req.file.buffer);

    return res.json({
      status: 'success',
      message: 'Holerite anexado ao colaborador',
      employee,
      month,
      file_name: fileName
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

app.get('/api/hr/payslips', async (req, res) => {
  try {
    const month = validateMonth(req.query.month);
    const files = await listPayslipFiles(month);

    return res.json({
      status: 'success',
      month,
      files: files.map((file) => file.name)
    });
  } catch (error) {
    return res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
});

app.get('/api/payslips-preview', async (req, res) => {
  try {
    const month = validateMonth(req.query.month);

    const plan = await buildPayslipPlan(month);
    const readyCount = plan.filter((item) => item.phone && item.phone.length >= 12 && item.payslip_file).length;

    return res.json({
      status: 'success',
      month,
      total_employees: plan.length,
      ready_count: readyCount,
      missing_count: plan.length - readyCount,
      results: plan
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: `Erro ao preparar pre-visualizacao: ${error.message}`
    });
  }
});

app.post('/api/send-payslips', async (req, res) => {
  let acquired = false;
  try {
    let month;
    let messageTemplate;
    try {
      month = validateMonth(req.body.month);
      messageTemplate = validatePayslipMessage(req.body.message);
    } catch (error) {
      return res.status(400).json({ status: 'error', message: error.message });
    }
    if (!sock || state.status !== 'connected') {
      return res.status(503).json({
        status: 'error',
        message: 'WhatsApp nao esta conectado no momento'
      });
    }

    if (payslipBatchInProgress) {
      return res.status(409).json({
        status: 'error',
        message: 'Ja existe um envio de holerites em andamento'
      });
    }

    payslipBatchInProgress = true;
    acquired = true;

    const { minMs, maxMs, minSeconds, maxSeconds } = normalizeDelayConfig(req.body);
    const plan = await buildPayslipPlan(month);

    if (!plan.length) {
      return res.status(400).json({
        status: 'error',
        message: 'Nenhum colaborador foi encontrado em Planilha/colaboradores.csv'
      });
    }

    const results = [];

    for (const item of plan) {
      if (!item.phone || item.phone.length < 12) {
        results.push({
          ...item,
          status: 'error',
          message: 'Numero invalido. Use DDI + DDD + numero'
        });
        continue;
      }

      if (!item.payslip_file) {
        results.push({
          ...item,
          status: 'error',
          message: 'Holerite PDF nao encontrado para este colaborador'
        });
        continue;
      }

      try {
        const jid = await resolveWhatsAppJid(item.phone);

        if (!jid) {
          results.push({
            ...item,
            status: 'error',
            message: 'Numero nao encontrado no WhatsApp'
          });
          continue;
        }

        const response = await sock.sendMessage(jid, {
          document: { url: item.payslip_path },
          mimetype: 'application/pdf',
          fileName: `holerite-${slugify(item.name) || 'colaborador'}-${month}.pdf`,
          caption: buildPayslipCaption(messageTemplate, item, month)
        });

        results.push({
          ...item,
          status: 'success',
          message: 'Holerite enviado',
          jid,
          message_id: response?.key?.id || null
        });

        if (item !== plan.at(-1)) await delay(getRandomDelayMs(minMs, maxMs));
      } catch (error) {
        results.push({
          ...item,
          status: 'error',
          message: error.message
        });
      }
    }

    const reportPath = await writePayslipReport(month, results);
    const successCount = results.filter((item) => item.status === 'success').length;
    const errorCount = results.length - successCount;

    return res.json({
      status: 'success',
      message: `Envio de holerites finalizado. Sucessos: ${successCount}. Falhas: ${errorCount}.`,
      month,
      delay_seconds: {
        min: minSeconds,
        max: maxSeconds
      },
      total_employees: plan.length,
      success_count: successCount,
      error_count: errorCount,
      report_path: reportPath,
      results
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: `Erro no envio de holerites: ${error.message}`
    });
  } finally {
    if (acquired) payslipBatchInProgress = false;
  }
});

app.post('/api/reset-connection', async (req, res) => {
  try {
    if (payslipBatchInProgress) {
      return res.status(409).json({ status: 'error', message: 'Aguarde o envio de holerites terminar.' });
    }
    await resetWhatsAppSession();

    return res.json({
      status: 'success',
      message: 'Sessao desconectada com sucesso. Aguarde o novo QR code.'
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: `Erro ao reiniciar a conexao: ${error.message}`
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Servidor Node rodando em http://localhost:${port}`);
  connectWhatsApp().catch((error) => {
    updateState('error', '', `Erro ao iniciar cliente: ${error.message}`);
    scheduleReconnect('Nova tentativa de conexao em alguns segundos...');
  });
});
