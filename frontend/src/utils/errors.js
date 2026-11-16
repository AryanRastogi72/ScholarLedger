const MAP = [
  [/Issuer not registered/i, 'This wallet is not a registered institution. Ask the admin to register it on the Register page.'],
  [/Only issuer can revoke/i, 'Only the institution that issued this credential can revoke it. Switch to the issuing wallet.'],
  [/Already revoked/i, 'This credential is already revoked.'],
  [/Credential already exists/i, 'This commitment is already on the ledger.'],
  [/Credential does not exist/i, 'No credential with this commitment exists on the ledger.'],
  [/Only admin/i, 'Only the admin wallet can do this. Switch to the admin account in your wallet.'],
  [/Already registered/i, 'This address is already a registered institution.'],
  [/Name required/i, 'Enter an institution name.'],
  [/user rejected|ACTION_REJECTED|denied transaction/i, 'You rejected the signature request in your wallet. Nothing was sent.'],
  [/MetaMask not found/i, 'No wallet found. Install MetaMask to send transactions.'],
  [/could not detect network|ECONNREFUSED|Failed to fetch|NETWORK_ERROR/i, 'Cannot reach the blockchain node. Start it with "npx hardhat node".']
];

export function friendlyError(err) {
  const raw = [err?.reason, err?.shortMessage, err?.info?.error?.message, err?.message].filter(Boolean).join(' | ');
  for (const [re, text] of MAP) if (re.test(raw)) return text;
  return err?.reason || err?.shortMessage || err?.message || 'Something went wrong.';
}
