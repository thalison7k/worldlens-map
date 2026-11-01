// Close-zoom entry with a wider exit boundary avoids reopening on camera jitter.
export function shouldEnterImmersive(zoom: number, globe: boolean, dismissed: boolean) {
  return Number.isFinite(zoom) && zoom >= 16 && !globe && !dismissed;
}
export function shouldExitImmersive(zoom: number) {
  return zoom < 14;
}