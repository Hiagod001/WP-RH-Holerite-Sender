import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMonth, formatPayslipMonth, buildPayslipCaption } from '../public/payslip-month.js';

test('caption always formats the selected competence, not the date of payment', () => {
  const employee = { name: 'Maria', phone: '5511999990000' };
  assert.match(buildPayslipCaption('', employee, '2026-10'), /referente a outubro de 2026/);
  assert.match(buildPayslipCaption('', employee, '2026-11'), /referente a novembro de 2026/);
  assert.equal(formatPayslipMonth('2025-12'), 'dezembro de 2025');
  assert.equal(buildPayslipCaption('{nome} | {mes} | {ano}', { name: '$& {mes}' }, '2026-10'), '$& {mes} | outubro de 2026 | 2026');
});

test('month is mandatory and a hardcoded message cannot silently bypass competence', () => {
  for (const value of [undefined, '', '2026-00', '2026-13', 'outubro', '2026-1', ['2026-10']]) {
    assert.throws(() => validateMonth(value), /competência/);
  }
  assert.throws(() => buildPayslipCaption('Segue o holerite de novembro.', {}, '2026-10'), /\{mes\}/);
  assert.equal(buildPayslipCaption('Competência: {competencia}', {}, '2026-10'), 'Competência: outubro de 2026');
});
