// File type from a file name, for files brought in from cloud drives.
export const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet", odp: "application/vnd.oasis.opendocument.presentation",
  rtf: "application/rtf", csv: "text/csv", txt: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", heic: "image/heic"
};
export const mimeFromName = (name: string) => EXT_MIME[(name.split(".").pop() ?? "").toLowerCase()] ?? null;
export const PICKER_EXTENSIONS = Object.keys(EXT_MIME).map((e) => `.${e}`);
