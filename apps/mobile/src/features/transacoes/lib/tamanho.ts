/** "230 KB", "1,2 MB": o tamanho do anexo na lista. */
export function tamanhoParaTexto(bytes: number): string {
  if (bytes < 1024 * 1024) return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
