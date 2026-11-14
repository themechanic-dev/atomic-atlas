// QR codes drawn in the page (qrcode-generator, MIT): no outside service sees the link.

import qrcode from 'qrcode-generator';

/** The modules of a QR code for a text: true where a module is dark. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, row) => Array.from({ length: n }, (_, col) => qr.isDark(row, col)));
}

/** An SVG path of the dark modules, one unit per module, with the size of the square. */
export function qrPath(text: string): { size: number; path: string } {
  const m = qrMatrix(text);
  let path = '';
  m.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return { size: m.length, path };
}
