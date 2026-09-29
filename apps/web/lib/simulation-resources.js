// Each policy Worker loads its own full rule catalog. Touch devices and
// low-resource desktops run the same policy inside the simulation Worker.
export function usePolicyWorker(device = globalThis.navigator) {
  if (!device) return false;
  if (device.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(device.userAgent || '')) return false;
  if (!(device.hardwareConcurrency >= 8)) return false;
  if (device.deviceMemory !== undefined && device.deviceMemory < 8) return false;
  return true;
}

// Cold boot includes downloading/parsing the catalog. It is not a running
// engine's 15-second response deadline, especially on a mobile connection.
export const SIMULATION_STARTUP_TIMEOUT_MS = 120_000;
