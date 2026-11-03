export function isIpoGuruSource(sourceName: string | null | undefined): boolean {
  return sourceName?.toLowerCase().includes("ipo guru") ?? false;
}
