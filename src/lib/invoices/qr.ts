import qrcodegen from "@/lib/vendor/qrcodegen";

/** QR code as a grid of booleans (true = dark), medium error correction. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM);
  return Array.from({ length: qr.size }, (_, y) => Array.from({ length: qr.size }, (_, x) => qr.getModule(x, y)));
}
