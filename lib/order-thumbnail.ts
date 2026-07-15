export const DRIVE_THUMBNAIL_PREFIX = "gdrive-pdf:";

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
