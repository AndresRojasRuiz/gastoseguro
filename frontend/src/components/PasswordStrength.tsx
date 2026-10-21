/**
 * Indicador orientativo de robustez. La política real (longitud, listas de contraseñas
 * comunes, datos del usuario) se valida siempre en el servidor.
 */
export function estimateStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  const length = [...password].length;
  if (length === 0) return { score: 0, label: '' };
  if (length < 15) return { score: 1, label: 'Demasiado corta (mínimo 15 caracteres)' };
  const variety = [/[a-záéíóúñü]/, /[A-ZÁÉÍÓÚÑÜ]/, /\d/, /[^\p{L}\p{N}]/u].filter((pattern) => pattern.test(password)).length;
  const unique = new Set(password).size;
  let score = 2;
  if (length >= 18 || (length >= 15 && variety >= 3)) score = 3;
  if ((length >= 22 && unique >= 10) || (length >= 18 && variety >= 3)) score = 4;
  if (unique < 6) score = 1;
  const labels = ['', 'Débil', 'Aceptable', 'Buena', 'Excelente'] as const;
  return { score: score as 1 | 2 | 3 | 4, label: labels[score] ?? '' };
}

export function PasswordStrength({ password }: { password: string }) {
  const { score, label } = estimateStrength(password);
  if (!password) {
    return <p className="hint">Usa al menos 15 caracteres. Una frase de varias palabras es fácil de recordar y difícil de adivinar.</p>;
  }
  return (
    <div className="strength" aria-live="polite">
      <div className="strength-bar">
        {[1, 2, 3, 4].map((level) => (
          <span key={level} className={`strength-segment${score >= level ? ` level-${score}` : ''}`} />
        ))}
      </div>
      <span className="hint">{label}</span>
    </div>
  );
}
