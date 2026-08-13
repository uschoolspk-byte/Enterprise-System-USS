const B = 'http://localhost:3000';
const id = `cf-quick-${Date.now()}`;
const p = await fetch(`${B}/api/custom-fields`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id, target: 'student', fieldName: 'Quick Test', fieldType: 'text' })
}).then(r => r.json());
console.log('POST', p.success ? 'PASS' : 'FAIL', p.error || '');
const u = await fetch(`${B}/api/custom-fields/${id}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fieldName: 'Updated Quick Test' })
}).then(r => r.json());
console.log('PUT', u.success ? 'PASS' : 'FAIL', u.error || '');
const d = await fetch(`${B}/api/custom-fields/${id}`, { method: 'DELETE' }).then(r => r.json());
console.log('DELETE', d.success ? 'PASS' : 'FAIL', d.error || '');
process.exit(p.success && u.success && d.success ? 0 : 1);
