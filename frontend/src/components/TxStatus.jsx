import { CircleNotch, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { shorten } from './HashText';

// Renders the progress line for a useTx() state. Reserves space only when active.
function TxStatus({ tx }) {
  if (tx.phase === 'idle') return null;
  let icon = <CircleNotch size={20} className="spin" aria-hidden="true" />;
  let cls = 'tx-status';
  let text;
  if (tx.phase === 'wallet') text = 'Waiting for your wallet to confirm the transaction.';
  else if (tx.phase === 'submitted') text = <>Submitted. Transaction <code title={tx.hash}>{shorten(tx.hash, 10, 6)}</code>. Waiting for a block.</>;
  else if (tx.phase === 'confirmed') {
    icon = <CheckCircle size={20} weight="fill" aria-hidden="true" />;
    cls += ' done';
    text = <>Confirmed in block {tx.block}. Gas used: {Number(tx.gas).toLocaleString()}.</>;
  } else {
    icon = <WarningCircle size={20} weight="fill" aria-hidden="true" />;
    cls += ' error';
    text = tx.message;
  }
  return (
    <div className={cls} role={tx.phase === 'error' ? 'alert' : 'status'}>
      {icon}
      <div>{text}</div>
    </div>
  );
}

export default TxStatus;
