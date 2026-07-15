export const DRIVE_THUMBNAIL_PREFIX = "gdrive-pdf:";

export type ThumbnailFileCandidate = {
  file_name?: string | null;
  file_type?: string | null;
  file_category?: string | null;
  notes?: string | null;
  drive_file_id?: string | null;
};

function normalizeThumbnailText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function driveThumbnailFileId(path: string | null | undefined) {
  const value = path?.trim() || "";
  return value.startsWith(DRIVE_THUMBNAIL_PREFIX)
    ? value.slice(DRIVE_THUMBNAIL_PREFIX.length).trim()
    : "";
}

export function buildDriveThumbnailPath(fileId: string) {
  const normalizedFileId = fileId.trim();
  if (!normalizedFileId) throw new Error("ID do arquivo do Drive não informado.");
  return `${DRIVE_THUMBNAIL_PREFIX}${normalizedFileId}`;
}

export function isDriveThumbnailPath(path: string | null | undefined) {
  return Boolean(driveThumbnailFileId(path));
}

export function isPngThumbnailCandidate(file: ThumbnailFileCandidate) {
  const fileName = normalizeThumbnailText(file.file_name);
  const fileType = normalizeThumbnailText(file.file_type);
  return fileType === "image/png" || fileName.endsWith(".png");
}

/**
 * Identifica o PNG gerado a partir de uma página da OS durante a importação
 * do PDF. Esse arquivo é a fonte oficial da miniatura do pedido/subpedido.
 *
 * A identificação usa tanto a observação gravada pelo importador quanto o
 * padrão histórico de nomes (ex.: 776_pagina_02.png ou 776-pagina-02.png),
 * preservando compatibilidade com registros migrados.
 */
export function isPdfImportedPageThumbnail(file: ThumbnailFileCandidate) {
  if (!file.drive_file_id?.trim() || !isPngThumbnailCandidate(file)) return false;

  const fileName = normalizeThumbnailText(file.file_name);
  const notes = normalizeThumbnailText(file.notes);
  const category = normalizeThumbnailText(file.file_category);

  const importerNote = notes.includes("importada em pdf")
    && notes.includes("usada como miniatura");
  const importedPageName = /(?:^|[-_ ])pagina[-_ ]?\d+\.png$/.test(fileName);

  return importerNote || (category === "document" && importedPageName);
}
