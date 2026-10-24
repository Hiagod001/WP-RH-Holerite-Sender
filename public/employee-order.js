const nameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

export function sortEmployees(employees) {
  return [...employees].sort((left, right) =>
    nameCollator.compare(String(left.name || '').trim(), String(right.name || '').trim())
    || nameCollator.compare(String(left.id || ''), String(right.id || ''))
  );
}
