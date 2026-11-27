// Last-resort process nets. Routes (via asyncHandler) and the pool handle their
// own errors; these catch anything that still slips through, so a stray rejection
// is logged instead of dying silently, and an uncaught exception exits cleanly
// (the process is in an undefined state) for a supervisor to restart.
export function installProcessSafetyNets(label: string): void {
  process.on('unhandledRejection', (reason) => {
    console.error(`[${label}] unhandledRejection:`, reason);
  });
  process.on('uncaughtException', (err) => {
    console.error(`[${label}] uncaughtException:`, err);
    process.exit(1);
  });
}
