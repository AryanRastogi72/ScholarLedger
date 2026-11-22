const MAP = [
  [/Issuer not registered/i, 'This wallet is not a registered institution. Ask the admin to register it on the Register page.'],
  [/Only issuer can revoke/i, 'Only the institution that issued this credential can revoke it. Switch to the issuing wallet.'],
  [/Already revoked/i, 'This credential is already revoked.'],
  [/Credential already exists/i, 'This commitment is already on the ledger.'],
  [/Credential does not exist/i, 'No credential with this commitment exists on the ledger.'],
  [/Not an admin/i, 'Only an admin wallet can do this. Switch to an admin account in your wallet.'],
  [/Already approved/i, 'This wallet has already approved this proposal.'],
  [/Already executed/i, 'This proposal has already been carried out.'],
  [/No such proposal/i, 'There is no proposal with that number.'],
  [/Name required/i, 'Enter an institution name.'],
  [/Domain required/i, 'Enter the institution domain, for example university.edu.'],
  [/Zero address/i, 'The zero address cannot be an institution.'],
  [/Address was registered before/i, 'This address was registered before and then deregistered. Register a new address instead.'],
  [/validUntil in the future/i, 'The "valid until" time cannot be in the future.'],
  [/Not registered/i, 'This address is not an active institution.'],
  [/user rejected|ACTION_REJECTED|denied transaction/i, 'You rejected the signature request in your wallet. Nothing was sent.'],
  [/MetaMask not found/i, 'No wallet found. Install MetaMask to send transactions.'],
  [/could not detect network|ECONNREFUSED|Failed to fetch|NETWORK_ERROR/i, 'Cannot reach the blockchain node. Start it with "npx hardhat node".']
];

// Coarse category, so pages can word the outcome: the user cancelled, the node is down, or the contract refused.
export function errorKind(err) {
  const raw = [err?.reason, err?.shortMessage, err?.info?.error?.message, err?.message].filter(Boolean).join(' | ');
  if (/user rejected|ACTION_REJECTED|denied transaction/i.test(raw)) return 'rejected';
  if (/could not detect network|ECONNREFUSED|Failed to fetch|NETWORK_ERROR|MetaMask not found/i.test(raw)) return 'offline';
  return 'revert';
}

export function friendlyError(err) {
  const raw = [err?.reason, err?.shortMessage, err?.info?.error?.message, err?.message].filter(Boolean).join(' | ');
  for (const [re, text] of MAP) if (re.test(raw)) return text;
  return err?.reason || err?.shortMessage || err?.message || 'Something went wrong.';
}
