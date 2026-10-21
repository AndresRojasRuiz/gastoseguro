/**
 * Subida segura de ficheros y exportación CSV (A01, A05 y A08:2025).
 */
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app, auditEntries, auth, createExpense, createUser } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

describe('Justificantes', () => {
  it('acepta una imagen válida y la descarga como adjunto aislado', async () => {
    const user = await createUser();
    const expense = await createExpense(user);
    const upload = await request(app)
      .post(`/api/expenses/${expense.id}/receipt`)
      .set(auth(user))
      .attach('receipt', PNG, { filename: '../../ticket super.png', contentType: 'image/png' });
    expect(upload.status).toBe(201);
    expect(upload.body.receipt.originalName).toBe('ticket super.png');

    const download = await request(app).get(`/api/expenses/${expense.id}/receipt`).set(auth(user));
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');
    expect(download.headers['content-disposition']).toMatch(/^attachment;/);
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.compare(download.body as Buffer, PNG)).toBe(0);
  });

  it('rechaza un ejecutable o HTML disfrazado de PDF (validación por firma)', async () => {
    const user = await createUser();
    const expense = await createExpense(user);
    for (const content of [Buffer.from('MZ\x90\x00\x03'), Buffer.from('<html><script>alert(1)</script></html>')]) {
      const response = await request(app)
        .post(`/api/expenses/${expense.id}/receipt`)
        .set(auth(user))
        .attach('receipt', content, { filename: 'factura.pdf', contentType: 'application/pdf' });
      expect(response.status).toBe(400);
    }
    expect((await auditEntries('RECEIPT_REJECTED', user.id)).length).toBe(2);
  });

  it('rechaza ficheros que superan el tamaño máximo', async () => {
    const user = await createUser();
    const expense = await createExpense(user);
    const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(1024 * 1024 + 10, 0x20)]);
    const response = await request(app)
      .post(`/api/expenses/${expense.id}/receipt`)
      .set(auth(user))
      .attach('receipt', big, { filename: 'grande.pdf', contentType: 'application/pdf' });
    expect(response.status).toBe(413);
  });
});

describe('Exportación CSV', () => {
  it('neutraliza fórmulas para evitar la inyección en hojas de cálculo', async () => {
    const user = await createUser();
    await createExpense(user, { description: '=HYPERLINK("https://evil.example","Pulsa aquí")', merchant: '@SUM(1+1)' });
    const response = await request(app).get('/api/reports/export.csv').set(auth(user));
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toMatch(/^attachment; filename="gastos_/);
    expect(response.text).toContain(`"'=HYPERLINK(""https://evil.example"",""Pulsa aquí"")"`);
    expect(response.text).toContain(`"'@SUM(1+1)"`);
    expect(response.text).not.toMatch(/;"=HYPERLINK/);
  });
});
