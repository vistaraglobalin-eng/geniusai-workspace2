declare const qrcodegen: {
  QrCode: {
    encodeText(text: string, ecl: unknown): { size: number; getModule(x: number, y: number): boolean };
    Ecc: { LOW: unknown; MEDIUM: unknown; QUARTILE: unknown; HIGH: unknown };
  };
};
export default qrcodegen;
