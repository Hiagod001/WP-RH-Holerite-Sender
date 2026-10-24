import { sortEmployees } from './employee-order.js';

const $ = (id) => document.getElementById(id);
const state = {
  view: 'payslips', filter: 'all', rows: [], connected: false,
  loading: false, validList: false, sending: false, remoteSending: false,
  mutation: false, polling: false, requestId: 0, editingId: '',
  upload: null, deleting: null, lastQr: '', qr: null
};
const defaultMessage = 'Olá {nome}, tudo bem?\n\nSegue em anexo o seu holerite referente a {mes}.\n\nAtenciosamente,\nRH Uai Telecom';
const titles = { payslips: 'Holerites', employees: 'Cadastros', settings: 'Configurações' };
let toastTimer;
let viewAnimations = [];
let initialView = true;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function animateView() {
  viewAnimations.forEach((animation) => animation.cancel());
  viewAnimations = [];
  if (reducedMotion.matches) return;
  const targets = state.view === 'settings'
    ? ['.page-heading', ...document.querySelectorAll('.settings-section')]
    : ['.page-heading', ...document.querySelectorAll('#metrics:not([hidden]) .metric'), '.records-heading', '.table-toolbar', '#table-scroll', '#send-bar:not([hidden])'];
  targets.forEach((target, index) => {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) return;
    viewAnimations.push(element.animate([
      { opacity: 0, transform: 'translateY(22px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 520, delay: Math.min(index * 55, 330), easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }));
  });
}

function openDialog(id) {
  const dialog = $(id);
  dialog.showModal();
  if (!reducedMotion.matches) dialog.animate([
    { opacity: 0, transform: 'translateY(24px) scale(.95)' },
    { opacity: 1, transform: 'translateY(0) scale(1)' }
  ], { duration: 340, easing: 'cubic-bezier(.16,1,.3,1)' });
}

async function closeDialog(id) {
  const dialog = $(id);
  if (!dialog.open || dialog.dataset.closing) return;
  dialog.dataset.closing = 'true';
  try {
    if (!reducedMotion.matches) await dialog.animate([
      { opacity: 1, transform: 'translateY(0) scale(1)' },
      { opacity: 0, transform: 'translateY(12px) scale(.98)' }
    ], { duration: 160, easing: 'ease-in', fill: 'forwards' }).finished;
    dialog.close();
  } finally {
    dialog.getAnimations().forEach((animation) => animation.cancel());
    delete dialog.dataset.closing;
  }
}

function icons() { window.lucide?.createIcons(); }
function icon(name) {
  const element = document.createElement('i');
  element.dataset.lucide = name;
  element.setAttribute('aria-hidden', 'true');
  return element;
}
function textElement(tag, text, className = '') {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
}
function notice(id, message = '', type = 'error') {
  const element = $(id);
  element.textContent = message;
  element.className = `notice ${type}`;
  element.hidden = !message;
}
function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500);
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    cache: 'no-store', ...options,
    headers: { Accept: 'application/json', ...options.headers }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.status !== 'success') {
    throw new Error(data?.message || 'Não foi possível concluir a operação. Tente novamente.');
  }
  return data;
}
function jsonRequest(method, data) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}
function monthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function monthLabel(month = $('payslip-month').value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return 'Competência inválida';
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1));
}
function isReady(employee) { return /^\d{12,15}$/.test(employee.phone) && Boolean(employee.payslip_file); }
function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts.at(-1)[0] : '')).toLocaleUpperCase('pt-BR');
}
function phoneLabel(phone) {
  const match = /^(55)(\d{2})(\d{4,5})(\d{4})$/.exec(phone);
  return match ? `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}` : `+${phone}`;
}
function busy() { return state.sending || state.remoteSending; }
function syncControls() {
  const locked = busy() || state.mutation;
  $('send-payslips').disabled = !state.connected || !state.validList || state.loading || locked || !state.rows.some(isReady);
  $('send-payslips').querySelector('span').textContent = busy() ? 'Envio em andamento' : 'Revisar envio';
  $('payslip-month').disabled = locked;
  $('new-employee').disabled = locked;
  $('reset-connection').disabled = locked;
  $('confirm-send').disabled = !state.connected || locked || state.loading || !state.validList;
  document.querySelectorAll('[data-row-action]').forEach((button) => { button.disabled = locked; });
  $('employee-save').disabled = state.mutation;
  $('upload-save').disabled = state.mutation;
  $('confirm-delete').disabled = state.mutation;
  document.querySelectorAll('dialog [data-close]').forEach((button) => { button.disabled = state.mutation; });
}
function changeView(view) {
  if (!Object.hasOwn(titles, view)) view = 'payslips';
  const changed = state.view !== view || initialView;
  state.view = view;
  document.body.dataset.view = view;
  $('page-title').textContent = titles[view];
  $('breadcrumb-current').textContent = titles[view];
  $('records-view').hidden = view === 'settings';
  $('settings-view').hidden = view !== 'settings';
  $('month-field').hidden = view !== 'payslips';
  $('new-employee').hidden = view === 'settings';
  $('metrics').hidden = view === 'employees';
  $('send-bar').hidden = view === 'employees';
  $('send-feedback').hidden = view === 'employees' || !$('send-feedback').textContent;
  $('status-filters').hidden = view === 'employees';
  $('table-title').textContent = view === 'employees' ? 'Colaboradores cadastrados' : 'Holerites da competência';
  $('month-label').textContent = view === 'employees' ? 'Equipe Uai Telecom' : monthLabel();
  document.querySelectorAll('[data-view]').forEach((button) => {
    if (button.tagName !== 'BUTTON') return;
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  renderRows();
  if (changed) animateView();
  initialView = false;
}

function navigate(view) {
  if (window.location.hash !== `#${view}`) window.location.hash = view;
  else changeView(view);
}
function rowAction(employee, action, glyph, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.rowAction = action;
  button.setAttribute('aria-label', `${label}: ${employee.name}`);
  button.title = label;
  button.append(icon(glyph));
  button.addEventListener('click', () => {
    if (busy() || state.mutation) return;
    if (action === 'edit') openEmployee(employee);
    if (action === 'upload') openUpload(employee);
    if (action === 'delete') openDelete(employee);
  });
  return button;
}
function renderRows() {
  const query = normalized($('employee-search').value.trim());
  const queryDigits = query.replace(/\D/g, '');
  const rows = sortEmployees(state.rows).filter((employee) => {
    const match = normalized(`${employee.name} ${employee.phone} ${employee.payslip_file}`).includes(query)
      || (queryDigits.length > 2 && /^[+\d\s()-]+$/.test(query) && employee.phone.includes(queryDigits));
    return match && (state.view === 'employees' || state.filter === 'all'
      || (state.filter === 'ready' ? isReady(employee) : !isReady(employee)));
  });
  const body = $('employee-rows');
  body.replaceChildren();
  if (!rows.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = state.view === 'employees' ? 3 : 5;
    cell.className = 'empty-state';
    cell.append(icon('folder-open'), textElement('strong', state.rows.length ? 'Nenhum resultado encontrado' : 'Nenhum colaborador cadastrado'),
      textElement('span', state.rows.length ? 'Ajuste a busca ou o filtro selecionado.' : 'Adicione o primeiro colaborador da equipe.'));
  }
  for (const employee of rows) {
    const row = body.insertRow();
    const nameCell = row.insertCell();
    const name = textElement('div', '', 'employee-cell');
    const avatar = textElement('span', initials(employee.name), 'employee-avatar');
    avatar.setAttribute('aria-hidden', 'true');
    name.append(avatar, textElement('span', employee.name, 'employee-name'));
    nameCell.append(name);
    const phone = row.insertCell();
    phone.className = 'phone-cell';
    phone.textContent = phoneLabel(employee.phone);
    if (state.view !== 'employees') {
      const pdfCell = row.insertCell();
      const pdf = textElement('div', '', `pdf-cell ${employee.payslip_file ? '' : 'missing'}`);
      const filename = employee.payslip_file || 'Sem holerite';
      pdf.title = filename;
      pdf.append(icon(employee.payslip_file ? 'file-text' : 'file-plus-2'), textElement('span', filename));
      pdfCell.append(pdf);
      const status = row.insertCell();
      status.append(textElement('span', isReady(employee) ? 'Pronto' : 'Pendente', `badge ${isReady(employee) ? 'ready' : 'pending'}`));
    }
    const actions = textElement('div', '', 'row-actions');
    if (state.view !== 'employees') actions.append(rowAction(employee, 'upload', 'upload', employee.payslip_file ? 'Trocar PDF' : 'Anexar PDF'));
    actions.append(rowAction(employee, 'edit', 'pencil', 'Editar colaborador'), rowAction(employee, 'delete', 'trash-2', 'Excluir colaborador'));
    row.insertCell().append(actions);
  }
  const ready = state.rows.filter(isReady).length;
  $('payslip-total').textContent = state.rows.length;
  $('payslip-ready').textContent = ready;
  $('payslip-missing').textContent = state.rows.length - ready;
  $('nav-count').textContent = state.rows.length;
  $('record-count').textContent = `${rows.length} de ${state.rows.length} colaborador${state.rows.length === 1 ? '' : 'es'}`;
  $('send-summary').textContent = busy() ? 'Envio de holerites em andamento' : `${ready} holerite${ready === 1 ? '' : 's'} pronto${ready === 1 ? '' : 's'} para envio`;
  const prefs = readPreferences();
  $('send-detail').textContent = state.connected
    ? `${monthLabel()} · intervalo de ${prefs.min} a ${prefs.max} segundos`
    : 'Conecte o WhatsApp nas configurações para enviar.';
  $('footer-month').textContent = monthLabel();
  icons();
  syncControls();
}
async function loadPreview() {
  const month = $('payslip-month').value;
  if (!$('payslip-month').validity.valid || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    state.validList = false;
    notice('list-alert', 'Selecione uma competência válida.');
    syncControls();
    return false;
  }
  const requestId = ++state.requestId;
  state.loading = true;
  state.validList = false;
  $('refresh').setAttribute('aria-busy', 'true');
  $('refresh').firstElementChild?.classList.add('spinning');
  syncControls();
  try {
    const data = await api(`/api/payslips-preview?month=${encodeURIComponent(month)}`);
    if (requestId !== state.requestId) return false;
    state.rows = sortEmployees(data.results || []);
    state.validList = true;
    notice('list-alert');
    $('last-updated').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    $('month-label').textContent = state.view === 'employees' ? 'Equipe Uai Telecom' : monthLabel();
    renderRows();
    return true;
  } catch (error) {
    if (requestId !== state.requestId) return false;
    notice('list-alert', `Falha ao atualizar a lista. ${error.message}`);
    return false;
  } finally {
    if (requestId === state.requestId) {
      state.loading = false;
      $('refresh').removeAttribute('aria-busy');
      $('refresh').firstElementChild?.classList.remove('spinning');
      syncControls();
    }
  }
}
function openEmployee(employee) {
  state.editingId = employee?.id || '';
  $('employee-form').reset();
  $('employee-dialog-title').textContent = employee ? 'Editar colaborador' : 'Novo colaborador';
  $('employee-save').querySelector('span').textContent = employee ? 'Salvar alterações' : 'Salvar colaborador';
  $('employee-name').value = employee?.name || '';
  $('employee-phone').value = employee?.phone || '';
  notice('employee-feedback');
  openDialog('employee-dialog');
  $('employee-name').focus();
}
async function saveEmployee(event) {
  event.preventDefault();
  if (state.mutation || busy()) return;
  const name = $('employee-name').value.trim();
  const phone = $('employee-phone').value.replace(/\D/g, '');
  if (!name || !/^\d{12,15}$/.test(phone)) {
    notice('employee-feedback', 'Preencha o nome e o WhatsApp com DDI, DDD e número (12 a 15 dígitos).');
    return;
  }
  state.mutation = true;
  syncControls();
  notice('employee-feedback');
  try {
    await api(state.editingId ? `/api/hr/employees/${encodeURIComponent(state.editingId)}` : '/api/hr/employees', jsonRequest(state.editingId ? 'PUT' : 'POST', { name, phone }));
    await closeDialog('employee-dialog');
    toast(state.editingId ? 'Cadastro atualizado.' : 'Colaborador cadastrado.');
    await loadPreview();
  } catch (error) { notice('employee-feedback', error.message); }
  finally { state.mutation = false; syncControls(); }
}
function openUpload(employee) {
  state.upload = { id: employee.id, month: $('payslip-month').value };
  $('upload-form').reset();
  $('upload-name').textContent = employee.name;
  $('upload-month').textContent = monthLabel(state.upload.month);
  $('file-name').textContent = 'Nenhum arquivo selecionado';
  notice('upload-feedback');
  openDialog('upload-dialog');
}
async function uploadPdf(event) {
  event.preventDefault();
  if (state.mutation || busy() || !state.upload) return;
  const file = $('payslip-file').files[0];
  if (!file || !file.name.toLowerCase().endsWith('.pdf')) { notice('upload-feedback', 'Selecione um arquivo PDF.'); return; }
  if (file.size > 20 * 1024 * 1024) { notice('upload-feedback', 'O PDF deve ter no máximo 20 MB.'); return; }
  const context = { ...state.upload };
  const form = new FormData();
  form.append('month', context.month);
  form.append('file', file);
  state.mutation = true;
  syncControls();
  notice('upload-feedback', 'Anexando PDF…', 'info');
  try {
    await api(`/api/hr/employees/${encodeURIComponent(context.id)}/payslip`, { method: 'POST', body: form });
    await closeDialog('upload-dialog');
    toast('Holerite anexado.');
    await loadPreview();
  } catch (error) { notice('upload-feedback', error.message); }
  finally { state.mutation = false; syncControls(); }
}
function openDelete(employee) {
  state.deleting = employee.id;
  $('delete-description').textContent = `Excluir o cadastro de ${employee.name}? Ele deixará de aparecer na lista de colaboradores.`;
  notice('delete-feedback');
  openDialog('delete-dialog');
}
async function deleteEmployee() {
  if (state.mutation || busy() || !state.deleting) return;
  state.mutation = true;
  syncControls();
  try {
    await api(`/api/hr/employees/${encodeURIComponent(state.deleting)}`, { method: 'DELETE' });
    await closeDialog('delete-dialog');
    toast('Cadastro excluído.');
    await loadPreview();
  } catch (error) { notice('delete-feedback', error.message); }
  finally { state.mutation = false; syncControls(); }
}
function readPreferences() {
  return { min: Number($('delay-min').value), max: Number($('delay-max').value), message: $('payslip-message').value.trim() };
}
function validPreferences(prefs) {
  return Number.isInteger(prefs.min) && Number.isInteger(prefs.max) && prefs.min >= 5 && prefs.max >= prefs.min && prefs.max <= 3600 && Boolean(prefs.message);
}
function restorePreferences() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem('uai-rh-preferences')); } catch { /* Defaults also work when browser storage is unavailable. */ }
  const prefs = saved && validPreferences(saved) ? saved : { min: 45, max: 90, message: defaultMessage };
  $('delay-min').value = prefs.min;
  $('delay-max').value = prefs.max;
  $('payslip-message').value = prefs.message;
}
function savePreferences(event) {
  event.preventDefault();
  const prefs = readPreferences();
  if (!validPreferences(prefs)) { notice('settings-feedback', 'Use intervalos inteiros de 5 a 3600 segundos. O máximo deve ser maior ou igual ao mínimo.'); return; }
  try {
    localStorage.setItem('uai-rh-preferences', JSON.stringify(prefs));
    notice('settings-feedback', 'Preferências salvas neste navegador.', 'success');
  } catch { notice('settings-feedback', 'Preferências aplicadas nesta sessão. O navegador não permitiu salvá-las.', 'info'); }
  renderRows();
}
async function reviewSend() {
  if (busy() || state.mutation) return;
  if (!validPreferences(readPreferences())) {
    navigate('settings');
    notice('settings-feedback', 'Confira os intervalos e a mensagem antes de enviar.');
    return;
  }
  if (!(await loadPreview()) || !state.connected || busy() || !state.rows.some(isReady)) return;
  const prefs = readPreferences();
  $('review-month').textContent = monthLabel();
  $('review-count').textContent = state.rows.filter(isReady).length;
  $('review-pending').textContent = state.rows.filter((employee) => !isReady(employee)).length;
  $('review-delay').textContent = `${prefs.min} a ${prefs.max} segundos`;
  notice('review-feedback');
  openDialog('send-dialog');
}
async function sendPayslips() {
  if (busy() || state.mutation || !state.connected || !state.validList || !state.rows.some(isReady)) return;
  const prefs = readPreferences();
  if (!validPreferences(prefs)) return;
  state.sending = true;
  await closeDialog('send-dialog');
  notice('send-feedback', 'Enviando holerites. Aguarde a conclusão para iniciar outro envio.', 'info');
  renderRows();
  try {
    const data = await api('/api/send-payslips', jsonRequest('POST', {
      month: $('payslip-month').value, min_delay_seconds: prefs.min, max_delay_seconds: prefs.max, message: prefs.message
    }));
    let result = data.message || 'Envio finalizado.';
    if (data.report_path) result += ` Relatório: ${data.report_path}`;
    notice('send-feedback', result, data.error_count ? 'error' : 'success');
    await loadPreview();
  } catch (error) {
    notice('send-feedback', `${error.message} Confira o resultado antes de repetir o envio.`);
  } finally {
    state.sending = false;
    await checkConnection();
    renderRows();
  }
}
async function checkConnection() {
  if (state.polling) return;
  state.polling = true;
  try {
    const response = await fetch('/api/whatsapp-status', { cache: 'no-store', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Conexão indisponível');
    const data = await response.json();
    state.connected = data.status === 'connected';
    state.remoteSending = Boolean(data.sending);
    $('connection-shortcut').dataset.state = state.connected ? 'connected' : ['error', 'logged_out'].includes(data.status) ? 'error' : 'waiting';
    $('connection-text').textContent = state.connected ? 'WhatsApp conectado' : data.status === 'waiting_qr' ? 'Conectar WhatsApp' : 'WhatsApp desconectado';
    $('status-detail').textContent = data.message || 'Aguardando conexão.';
    $('qr-wrapper').hidden = state.connected || !data.qr_string;
    if (data.qr_string && data.qr_string !== state.lastQr) {
      if (window.QRCode) {
        state.qr ||= new window.QRCode($('qrcode'), { width: 240, height: 240, colorDark: '#25272e', colorLight: '#ffffff' });
        state.qr.makeCode(data.qr_string);
        state.lastQr = data.qr_string;
        $('qr-caption').textContent = 'QR Code atualizado';
      } else {
        $('qr-caption').textContent = 'Falha ao carregar o QR Code. Atualize a página.';
      }
    }
  } catch {
    state.connected = false;
    $('connection-shortcut').dataset.state = 'error';
    $('connection-text').textContent = 'Sem conexão';
    $('status-detail').textContent = 'Não foi possível consultar o WhatsApp. Tentando reconectar…';
  } finally {
    state.polling = false;
    syncControls();
    const prefs = readPreferences();
    $('send-detail').textContent = state.connected
      ? `${monthLabel()} · intervalo de ${prefs.min} a ${prefs.max} segundos`
      : 'Conecte o WhatsApp nas configurações para enviar.';
  }
}
async function resetConnection() {
  if (busy() || state.mutation) return;
  state.mutation = true;
  syncControls();
  notice('connection-feedback', 'Preparando novo QR Code…', 'info');
  try {
    await api('/api/reset-connection', { method: 'POST' });
    state.lastQr = '';
    notice('connection-feedback', 'Sessão reiniciada. Aguarde o novo QR Code.', 'success');
    await checkConnection();
  } catch (error) { notice('connection-feedback', error.message); }
  finally { state.mutation = false; syncControls(); }
}

$('payslip-month').value = monthValue();
restorePreferences();
document.querySelectorAll('nav [data-view]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.view)));
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => { if (!state.mutation) closeDialog(button.dataset.close); }));
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  if (!state.mutation) closeDialog(dialog.id);
}));
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((item) => {
    const selected = item === button;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  renderRows();
}));
$('new-employee').addEventListener('click', () => openEmployee());
$('employee-form').addEventListener('submit', saveEmployee);
$('upload-form').addEventListener('submit', uploadPdf);
$('payslip-file').addEventListener('change', () => { $('file-name').textContent = $('payslip-file').files[0]?.name || 'Nenhum arquivo selecionado'; });
$('confirm-delete').addEventListener('click', deleteEmployee);
$('employee-search').addEventListener('input', renderRows);
$('refresh').addEventListener('click', loadPreview);
$('payslip-month').addEventListener('change', () => { notice('send-feedback'); loadPreview(); });
$('settings-form').addEventListener('submit', savePreferences);
$('edit-settings').addEventListener('click', () => navigate('settings'));
$('connection-shortcut').addEventListener('click', () => navigate('settings'));
$('reset-connection').addEventListener('click', resetConnection);
$('send-payslips').addEventListener('click', reviewSend);
$('confirm-send').addEventListener('click', sendPayslips);
window.addEventListener('hashchange', () => changeView(window.location.hash.slice(1)));
changeView(window.location.hash.slice(1) || 'payslips');
loadPreview();
checkConnection();
setInterval(() => { if (!document.hidden) checkConnection(); }, 2500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkConnection(); });
