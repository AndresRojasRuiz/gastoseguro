import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/**
 * Código QR renderizado como SVG por React (sin innerHTML ni data: URIs), compatible con la
 * CSP estricta y con Trusted Types.
 */
export function QrCode({ value, size = 196 }: { value: string; size?: number }) {
  const { count, cells } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const moduleCount = qr.getModuleCount();
    const dark: Array<[number, number]> = [];
    for (let row = 0; row < moduleCount; row += 1) {
      for (let col = 0; col < moduleCount; col += 1) if (qr.isDark(row, col)) dark.push([row, col]);
    }
    return { count: moduleCount, cells: dark };
  }, [value]);
  const margin = 2;
  const path = cells.map(([row, col]) => `M${col + margin} ${row + margin}h1v1h-1z`).join('');
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${count + margin * 2} ${count + margin * 2}`} role="img" aria-label="Código QR para la aplicación de autenticación" shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={path} fill="#0b1f33" />
    </svg>
  );
}
