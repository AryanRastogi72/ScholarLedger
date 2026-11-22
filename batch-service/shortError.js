// Errors we threw ourselves keep their message; ethers errors (they carry a `code`) are shortened and the raw one is logged.
function shortError(e) {
  if (!e.code) return e.message;
  console.error('Batch error:', e);
  return e.shortMessage ?? e.reason ?? (e.code === 'TIMEOUT' ? 'Timed out waiting for confirmation' : 'Transaction failed');
}

module.exports = { shortError };
