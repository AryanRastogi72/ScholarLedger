import { SealCheck, ProhibitInset, SealWarning, MagnifyingGlass, FileX } from '@phosphor-icons/react';

const KINDS = {
  VALID: { cls: 'valid', Icon: SealCheck, title: 'Valid', note: 'This credential was issued by a registered institution and has not been revoked.' },
  REVOKED: { cls: 'revoked', Icon: ProhibitInset, title: 'Revoked', note: 'The issuing institution has revoked this credential.' },
  'ISSUER DEREGISTERED': { cls: 'warn', Icon: SealWarning, title: 'Issuer deregistered', note: 'The credential exists, but its issuer is no longer a registered institution.' },
  'NOT FOUND': { cls: 'neutral', Icon: MagnifyingGlass, title: 'Not found', note: 'No credential with this commitment is on the ledger.' },
  ALTERED: { cls: 'altered', Icon: FileX, title: 'Altered file', note: 'This file has been altered: its details do not match its commitment.' }
};

// Large, unambiguous result panel: icon + color + text, never color alone.
function StatusPanel({ kind, children }) {
  const { cls, Icon, title, note } = KINDS[kind];
  return (
    <section className={`status-panel ${cls} fade-in`} aria-live="polite">
      <Icon className="icon" weight="fill" aria-hidden="true" />
      <div className="body">
        <h2>{title}</h2>
        <p>{note}</p>
        {children}
      </div>
    </section>
  );
}

export default StatusPanel;
