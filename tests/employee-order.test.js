import test from 'node:test';
import assert from 'node:assert/strict';
import { sortEmployees } from '../public/employee-order.js';

test('orders Portuguese names independently of accents, case and insertion order', () => {
  const employees = ['Zuleica', 'maria', 'Ângela', 'Álvaro', 'ana'].map((name, id) => ({ id: String(id), name }));
  const original = [...employees];
  assert.deepEqual(sortEmployees(employees).map((item) => item.name), ['Álvaro', 'ana', 'Ângela', 'maria', 'Zuleica']);
  assert.deepEqual(employees, original);
});

test('repositions new employees and renamed employees', () => {
  let employees = [{ id: '1', name: 'Bruna' }, { id: '2', name: 'Zuleica' }];
  employees.push({ id: '3', name: 'Ana' });
  assert.deepEqual(sortEmployees(employees).map((item) => item.id), ['3', '1', '2']);
  employees[1].name = 'Aline';
  assert.deepEqual(sortEmployees(employees).map((item) => item.id), ['2', '3', '1']);
});
