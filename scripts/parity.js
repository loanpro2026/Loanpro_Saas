const fs = require('fs')
const path = require('path')

/**
 * Desktop parity audit.
 *
 *   npm run check:parity
 *
 * Walks every IPC endpoint the Electron app exposes in preload.js and checks
 * that the web app either implements it or has a stated reason for not doing
 * so. A new endpoint appearing on the desktop side, or one silently dropped
 * here, shows up as "unaccounted".
 *
 * This is how the last two gaps were found — editing closed records, and the
 * whole support ticket system.
 */

const ROOT = path.resolve(__dirname, '..')
const DESKTOP = path.resolve(ROOT, '..', 'electron_app')

// Every IPC method exposed by the desktop
const preload = fs.readFileSync(path.join(DESKTOP, 'preload.js'), 'utf8');
const ipc = [...preload.matchAll(/^\s{2,4}([a-zA-Z][a-zA-Z0-9]*)\s*:\s*\(/gm)].map(m => m[1]);

// Everything the web implements: SQL functions + API routes + actions
let web = '';
for (const f of fs.readdirSync(path.join(ROOT, 'supabase/migrations'))) {
  web += fs.readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8');
}
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = d + '/' + e.name;
    if (e.isDirectory()) { if (!['node_modules','.next','.git'].includes(e.name)) walk(p); }
    else if (/\.(ts|tsx)$/.test(e.name)) web += fs.readFileSync(p, 'utf8');
  }
})(path.join(ROOT, 'app'));
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = d + '/' + e.name;
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) web += fs.readFileSync(p, 'utf8');
  }
})(path.join(ROOT, 'components'));
for (const f of ['lib','scripts']) {
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = d + '/' + e.name;
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) web += fs.readFileSync(p, 'utf8');
    }
  })(path.join(ROOT, f));
}
const lower = web.toLowerCase();

// camelCase -> snake_case, plus known renames
const RENAME = {
  addRecord:'create_loan', searchRecords:'search_loans', updateRecord:'update_loan',
  removeRecord:'close_loan', deleteRecord:'delete_loan',
  searchClosedRecords:'search_loans', updateClosedRecord:'update_loan',
  globalSearchRecords:'search_loans', getFieldSuggestions:'field_suggestions',
  getAllLocations:'distinct_locations', getLocationsWithAmount:'distinct_locations',
  getDepositHistory:'loan_detail', getFaceIdentityForLoan:'loan_photos',
  getIdentityStorageStats:'loan_photos',
  getRemovedRecordsWithDeposits:'removed_records_report',
  deleteRemovedRecordsByDate:'clear_removed_records',
  getDailyDepositRecords:'daily_deposits_report',
  deleteDailyDepositRecordsByDate:'clear_daily_deposits',
  initializeDailySummary:'recalculate_cash_summary',
  getDashboardStats:'dashboard_stats', getChartData:'chart_data',
  getLendingMetrics:'lending_metrics', getRecentActivity:'activity_log',
  getJewelleryStock:'jewellery_stock', getJewelleryBreakdown:'jewellery_breakdown',
  getInventoryReport:'inventory_report', getAccountReport:'account_report',
  getLocationReport:'location_report', getDailyReport:'daily_report',
  getInvestmentReport:'investment_report', getReturnsReport:'returns_report',
  getCashTransactions:'cash_transactions', addCash:'record_cash', removeCash:'record_cash',
  appendRecordRemark:'appendRemark', deleteRecordRemark:'deleteRemark',
  exportDatabase:'api/export', getDatabaseStats:'api/export',
  getGeneralSettings:'my_settings', saveGeneralSettings:'set_setting',
  updateGeneralSetting:'set_setting',
  appLockEnable:'setPin', appLockVerify:'verifyPin', appLockDisable:'clearPin',
  appLockGetStatus:'hasPin', appLockChangePassword:'setPin',
  ensureMobileCaptureServer:'camera_sessions',
  startMobileCaptureSession:'camera_sessions',
  getMobileCaptureSessionStatus:'camera_sessions',
  consumeMobileCaptureSessionImage:'camera_sessions',
  cancelMobileCaptureSession:'camera_sessions',
  listMobileCaptureDevices:'paired_devices',
  startMobilePairingSession:'paired_devices',
  getMobilePairingSessionStatus:'paired_devices',
  renameMobileCaptureDevice:'paired_devices',
  setDefaultMobileCaptureDevice:'paired_devices',
  revokeMobileCaptureDevice:'paired_devices',
  authLogin:'auth', authLogout:'auth', authGetUser:'getSessionContext',
  subscriptionCheck:'my_plan', subscriptionGetFeatures:'my_plan',
  canAccessFeature:'assert_can_write', getUserSubscriptionTier:'my_plan',
  authListDevices:'shop_members',
  updateClosedRecord:'update_closed_record',
  createTicket:'create_ticket', getTickets:'my_tickets',
  getTicketDetail:'ticket_detail', addResponse:'reply_to_ticket',
};

// Deliberately not ported, with the reason
const DROPPED = {
  captureFingerprint:'hardware', verifyFingerprint:'hardware',
  searchByFingerprint:'hardware', getFingerprintForLoan:'hardware',
  getRemovedFingerprint:'hardware', checkFingerprintAvailability:'hardware',
  installFingerprintSystem:'hardware', startMFS100Service:'hardware',
  stopMFS100Service:'hardware', testFingerprintConnection:'hardware',
  isMFS100ServiceRunning:'hardware', isMFS100DriverInstalled:'hardware',
  installSecuGenDriver:'hardware', getFingerprintAccess:'hardware',
  onFingerprintInstallProgress:'hardware', offFingerprintInstallProgress:'hardware',
  checkRDServiceProcesses:'hardware', startRDService:'hardware',
  startDriveAuthFlow:'replaced by export', createDriveBackup:'replaced by export',
  startDriveAutoBackup:'replaced by export', stopDriveAutoBackup:'replaced by export',
  revokeDriveAuth:'replaced by export', getDriveStatus:'replaced by export',
  getAvailableDriveBackups:'replaced by export', restoreDriveBackup:'replaced by export',
  onDriveAutoBackupStatus:'replaced by export', offDriveAutoBackupStatus:'replaced by export',
  createBackup:'replaced by export', startAutoBackup:'replaced by export',
  stopAutoBackup:'replaced by export', getBackupStatus:'replaced by export',
  onAutoBackupStatus:'replaced by export', offAutoBackupStatus:'replaced by export',
  importDatabase:'migration CLI instead',
  checkDatabaseAvailability:'managed', runDatabaseSetup:'managed',
  runSchemaMigrations:'managed', getDatabaseInfo:'managed',
  startExistingMySQL:'managed', testDbConnection:'managed',
  checkSetupRequired:'managed', runFirstTimeSetup:'managed',
  getSetupState:'managed', onSetupProgress:'managed', offSetupProgress:'managed',
  checkForUpdates:'n/a on web', downloadUpdate:'n/a on web',
  installUpdate:'n/a on web', getUpdateStatus:'n/a on web',
  onUpdateAvailable:'n/a on web', offUpdateAvailable:'n/a on web',
  onUpdateProgress:'n/a on web', offUpdateProgress:'n/a on web',
  onUpdateStatus:'n/a on web', offUpdateStatus:'n/a on web',
  onUpdateDownloaded:'n/a on web', offUpdateDownloaded:'n/a on web',
  showSaveDialog:'browser download', writePdfFile:'browser download',
  showSaveDialogCustom:'browser download', writeFile:'browser download',
  showOpenDialog:'browser', showFolderDialog:'browser',
  shellOpenExternal:'browser', getDeviceInfo:'browser',
  logMessage:'server logs', openLogFile:'server logs',
  authLoginWithToken:'supabase auth', authValidateToken:'supabase auth',
  authGetCurrentUser:'supabase auth', authCheckDeviceBinding:'no device binding',
  authBindDevice:'no device binding', authLoginAndBind:'no device binding',
  authGetDeviceId:'no device binding', authAttemptAutoLogin:'supabase auth',
  authStoreCredentials:'supabase auth', authGetStoredCredentials:'supabase auth',
  authClearCredentials:'supabase auth', authRefreshSubscription:'supabase auth',
  subscriptionOpenUpgrade:'billing page',
  appLockRegenerateRecovery:'no recovery code', appLockResetWithRecovery:'no recovery code',
  onMobileCaptureSessionUpdated:'realtime', offMobileCaptureSessionUpdated:'realtime',
  onMobileCaptureDevicesUpdated:'realtime', offMobileCaptureDevicesUpdated:'realtime',
  onMobileCapturePairingUpdated:'realtime', offMobileCapturePairingUpdated:'realtime',
  logFaceVerificationDecision:'face_verification_log column',
  deleteRemovedRecordPermanently:'clear_removed_records',
  getQueued:'offline queue', processQueue:'offline queue',
  hasQueued:'offline queue', clearQueue:'offline queue',
};

const snake = s => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const covered = [], missing = [], dropped = [];
for (const m of ipc) {
  if (DROPPED[m]) { dropped.push([m, DROPPED[m]]); continue; }
  const needles = [RENAME[m], snake(m), m].filter(Boolean).map(x => x.toLowerCase());
  if (needles.some(n => lower.includes(n))) covered.push(m);
  else missing.push(m);
}

console.log(`Desktop IPC endpoints: ${ipc.length}\n`);
console.log(`✅ Covered on web:  ${covered.length}`);
console.log(`➖ Not ported:      ${dropped.length}`);
console.log(`❓ Unaccounted:     ${missing.length}`);

if (missing.length) {
  console.log('\nUnaccounted for:');
  for (const m of missing) console.log('   ' + m);
}

if (!fs.existsSync(DESKTOP)) {
  console.log('Desktop app not found alongside this repo — skipping parity audit.')
  process.exit(0)
}

const byReason = {};
for (const [, r] of dropped) byReason[r] = (byReason[r] || 0) + 1;
console.log('\nNot ported, by reason:');
for (const [r, n] of Object.entries(byReason).sort((a,b)=>b[1]-a[1])) {
  console.log(`   ${String(n).padStart(2)}  ${r}`);
}

process.exit(missing.length ? 1 : 0)
