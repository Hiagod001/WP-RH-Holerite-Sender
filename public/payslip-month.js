const monthNames = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const defaultPayslipMessage = 'Olá {nome}, tudo bem?\n\nSegue em anexo o seu holerite referente a {mes}.\n\nAtenciosamente,\nRH Uai Telecom';

export function validateMonth(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.trim())) {
    throw new Error('Selecione a competência do holerite no formato AAAA-MM. Exemplo: 2026-10.');
  }
  return value.trim();
}

export function formatPayslipMonth(value) {
  const month = validateMonth(value);
  return `${monthNames[Number(month.slice(5)) - 1]} de ${month.slice(0, 4)}`;
}

export function validatePayslipMessage(template) {
  const message = String(template || '').trim() || defaultPayslipMessage;
  if (!/\{(?:mes|competencia)\}/.test(message)) {
    throw new Error('Inclua {mes} na mensagem para preencher a competência escolhida no calendário.');
  }
  return message;
}

export function buildPayslipCaption(template, employee, value) {
  const month = validateMonth(value);
  const message = validatePayslipMessage(template);
  const variables = {
    nome: employee.name || 'colaborador', numero: employee.phone || '',
    mes: formatPayslipMonth(month), competencia: formatPayslipMonth(month), ano: month.slice(0, 4)
  };
  return message.replace(/\{(nome|numero|mes|competencia|ano)\}/g, (_, key) => variables[key]);
}
