/**
 * Pruebas unitarias de los componentes criptográficos y de saneamiento.
 */
import { describe, expect, it } from 'vitest';
import { escapeCsvField } from '../src/lib/csv.js';
import { constantTimeEqual, decryptSecret, encryptSecret } from '../src/lib/crypto.js';
import { detectFileType, resolveStoredPath, sanitizeFileName } from '../src/lib/files.js';
import { formatAmount, parseAmount } from '../src/lib/money.js';
import { checkPasswordPolicy, hashPassword, needsRehash, verifyPassword } from '../src/lib/password.js';
import { base32Decode, base32Encode, hotp, verifyTotp } from '../src/lib/totp.js';

describe('TOTP (RFC 6238, apéndice B)', () => {
  const key = Buffer.from('12345678901234567890', 'ascii');
  const vectors: Array<[number, string]> = [
    [59, '94287082'],
    [1_111_111_109, '07081804'],
    [1_111_111_111, '14050471'],
    [1_234_567_890, '89005924'],
    [2_000_000_000, '69279037'],
    [20_000_000_000, '65353130'],
  ];

  it.each(vectors)('T=%i produce el código %s', (time, expected) => {
    expect(hotp(key, Math.floor(time / 30), 8)).toBe(expected);
  });

  it('codifica y decodifica base32 sin pérdida', () => {
    expect(base32Decode(base32Encode(key)).equals(key)).toBe(true);
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('acepta el código actual y rechaza su reutilización', () => {
    const secret = base32Encode(key);
    const now = Date.now();
    const code = hotp(key, Math.floor(now / 30_000));
    const step = verifyTotp(secret, code, { now });
    expect(step).not.toBeNull();
    expect(verifyTotp(secret, code, { now, lastUsedStep: step })).toBeNull();
    expect(verifyTotp(secret, '000000x', { now })).toBeNull();
  });
});

describe('Cifrado AES-256-GCM', () => {
  it('descifra correctamente con los mismos datos asociados', () => {
    const encrypted = encryptSecret('secreto-totp', 'mfa:usuario-1');
    expect(encrypted.startsWith('v1.')).toBe(true);
    expect(decryptSecret(encrypted, 'mfa:usuario-1')).toBe('secreto-totp');
  });

  it('produce textos cifrados distintos para el mismo mensaje (IV aleatorio)', () => {
    expect(encryptSecret('x', 'a')).not.toBe(encryptSecret('x', 'a'));
  });

  it('detecta la manipulación del texto cifrado', () => {
    const [version, iv, data, tag] = encryptSecret('secreto', 'mfa:1').split('.');
    const tampered = Buffer.from(data!, 'base64url');
    tampered[0] = tampered[0]! ^ 0xff;
    expect(() => decryptSecret([version, iv, tampered.toString('base64url'), tag].join('.'), 'mfa:1')).toThrow();
  });

  it('impide reutilizar el secreto de un usuario en otro (AAD)', () => {
    expect(() => decryptSecret(encryptSecret('secreto', 'mfa:usuario-1'), 'mfa:usuario-2')).toThrow();
  });

  it('compara en tiempo constante', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('Contraseñas', () => {
  it('genera hashes Argon2id con sal y los verifica', async () => {
    const hash = await hashPassword('Una frase de paso larga 2026');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await hashPassword('Una frase de paso larga 2026')).not.toBe(hash);
    expect(await verifyPassword(hash, 'Una frase de paso larga 2026')).toBe(true);
    expect(await verifyPassword(hash, 'Una frase de paso larga 2025')).toBe(false);
    expect(needsRehash(hash)).toBe(false);
    expect(needsRehash('$argon2id$v=19$m=4096,t=3,p=1$abc$def')).toBe(true);
  });

  it('un hash corrupto nunca valida (fallo seguro)', async () => {
    expect(await verifyPassword('no-es-un-hash', 'cualquiera')).toBe(false);
  });

  it('aplica la política NIST/ASVS', async () => {
    expect(await checkPasswordPolicy('corta')).toContain('Debe tener al menos 15 caracteres.');
    expect(await checkPasswordPolicy('Password1234567')).toContain('Es una contraseña demasiado común.');
    expect(await checkPasswordPolicy('aaaaaaaaaaaaaaaa')).toContain('Contiene muy pocos caracteres distintos.');
    expect((await checkPasswordPolicy('maria.lopez-2026-casa', { email: 'maria.lopez@x.com' })).length).toBeGreaterThan(0);
    expect(await checkPasswordPolicy('x'.repeat(129))).toContain('No puede superar 128 caracteres.');
    expect(await checkPasswordPolicy('Correcto Caballo Batería Grapa')).toEqual([]);
  });
});

describe('Importes', () => {
  it('convierte a unidades menores sin coma flotante', () => {
    expect(parseAmount('0.10', 'EUR')).toBe(10);
    expect(parseAmount('1234,56', 'EUR')).toBe(123_456);
    expect(parseAmount('15000', 'CLP')).toBe(15_000);
    expect(formatAmount(123_456, 'EUR')).toBe('1234.56');
  });

  it.each(['-5', '0', '1e3', '12.345', 'abc', '99999999999', ' ', '1.5.2'])('rechaza el importe "%s"', (value) => {
    expect(parseAmount(value, 'EUR')).toBeNull();
  });

  it('rechaza decimales en monedas sin decimales', () => {
    expect(parseAmount('100.50', 'CLP')).toBeNull();
  });
});

describe('Saneamiento de salidas y ficheros', () => {
  it.each(['=HYPERLINK("http://x")', '+1+1', '-2+3', '@SUM(A1)', '\t=1', '\r=1'])('neutraliza la fórmula %j en CSV', (value) => {
    expect(escapeCsvField(value).startsWith(`"'`)).toBe(true);
  });

  it('duplica las comillas internas en CSV', () => {
    expect(escapeCsvField('dice "hola"')).toBe('"dice ""hola"""');
  });

  it('identifica el tipo real por la firma del fichero', () => {
    expect(detectFileType(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
    expect(detectFileType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(detectFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectFileType(Buffer.from('MZ\x90\x00 ejecutable'))).toBeNull();
    expect(detectFileType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(detectFileType(Buffer.from('<html><script>'))).toBeNull();
  });

  it('elimina rutas y caracteres peligrosos del nombre original', () => {
    expect(sanitizeFileName('../../etc/passwd', 'application/pdf')).toBe('passwd.pdf');
    expect(sanitizeFileName('..\\..\\windows\\win.ini', 'image/png')).toBe('win.png');
    expect(sanitizeFileName('factura<script>.exe.pdf', 'application/pdf')).toBe('factura_script_.exe.pdf');
    expect(sanitizeFileName('', 'image/jpeg')).toBe('justificante.jpg');
  });

  it('impide resolver rutas fuera del directorio de almacenamiento', () => {
    expect(() => resolveStoredPath('../../secreto')).toThrow();
    expect(() => resolveStoredPath('00000000-0000-4000-8000-000000000000')).not.toThrow();
  });
});
