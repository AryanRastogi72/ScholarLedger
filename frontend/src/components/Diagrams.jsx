// Small explanatory diagrams. Plain SVG, colors from tokens.
const box = { fill: 'var(--surface)', stroke: 'var(--rule)', strokeWidth: 1.5 };
const label = { fill: 'var(--ink)', fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600 };
const sub = { fill: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 10.5 };
const arrow = { stroke: 'var(--ink-2)', strokeWidth: 1.5, fill: 'none', markerEnd: 'url(#arr)' };

function Defs() {
  return (
    <defs>
      <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M0 0 L8 4 L0 8z" fill="var(--ink-2)" />
      </marker>
    </defs>
  );
}

export function IdentityDiagram() {
  return (
    <svg viewBox="0 0 520 170" role="img" aria-label="A wallet sends a commitment. The registry check passes a registered issuer to the contract and rejects an unknown wallet." className="diagram">
      <Defs />
      <rect x="4" y="20" width="120" height="56" rx="6" {...box} />
      <text x="64" y="44" textAnchor="middle" {...label}>Wallet</text>
      <text x="64" y="62" textAnchor="middle" {...sub}>msg.sender</text>
      <line x1="124" y1="48" x2="196" y2="48" {...arrow} />
      <rect x="198" y="14" width="130" height="68" rx="6" fill="var(--accent-wash)" stroke="var(--accent)" strokeWidth="2" />
      <text x="263" y="42" textAnchor="middle" {...label}>Registry check</text>
      <text x="263" y="60" textAnchor="middle" {...sub}>isRegistered?</text>
      <line x1="328" y1="48" x2="396" y2="48" {...arrow} />
      <text x="362" y="40" textAnchor="middle" {...sub} fill="var(--accent)">yes</text>
      <rect x="398" y="20" width="118" height="56" rx="6" {...box} />
      <text x="457" y="44" textAnchor="middle" {...label}>Contract</text>
      <text x="457" y="62" textAnchor="middle" {...sub}>stores commitment</text>
      <path d="M263 82 L263 128" {...arrow} />
      <text x="272" y="108" {...sub} fill="var(--danger)">no</text>
      <rect x="168" y="130" width="190" height="30" rx="6" fill="var(--danger-wash)" stroke="var(--danger)" strokeWidth="1.5" />
      <text x="263" y="149" textAnchor="middle" {...sub} fill="var(--danger)">revert: Issuer not registered</text>
    </svg>
  );
}

export function OccDiagram() {
  const rows = [0, 1, 2, 3, 4, 5];
  return (
    <svg viewBox="0 0 520 170" role="img" aria-label="Rows are split into conflict-free groups, submitted back to back, anchored on the chain, then summarised by one Merkle root." className="diagram">
      <Defs />
      {rows.map((r) => (
        <rect key={r} x="8" y={10 + r * 25} width="52" height="18" rx="3" fill={r === 3 ? 'var(--warn-wash)' : 'var(--surface)'} stroke={r === 3 ? 'var(--warn)' : 'var(--rule)'} strokeWidth="1.5" />
      ))}
      <text x="34" y="165" textAnchor="middle" {...sub}>rows</text>
      <line x1="68" y1="80" x2="116" y2="80" {...arrow} />
      <rect x="120" y="10" width="86" height="92" rx="5" {...box} />
      <rect x="120" y="108" width="86" height="40" rx="5" fill="var(--warn-wash)" stroke="var(--warn)" strokeWidth="1.5" />
      <text x="163" y="30" textAnchor="middle" {...sub}>group 1</text>
      <text x="163" y="126" textAnchor="middle" {...sub}>group 2</text>
      <text x="163" y="140" textAnchor="middle" {...sub} fill="var(--warn)">waits</text>
      <line x1="212" y1="80" x2="268" y2="80" {...arrow} />
      {[0, 1, 2, 3].map((b) => (
        <rect key={b} x={274 + b * 30} y="62" width="24" height="36" rx="3" fill="var(--accent-wash)" stroke="var(--accent)" strokeWidth="1.5" />
      ))}
      <text x="334" y="120" textAnchor="middle" {...sub}>chain</text>
      <line x1="398" y1="80" x2="440" y2="80" {...arrow} />
      <path d="M476 52 L504 80 L476 108 L448 80 Z" fill="var(--accent)" />
      <text x="476" y="84" textAnchor="middle" fill="var(--on-accent)" fontFamily="var(--font-ui)" fontSize="11" fontWeight="700">root</text>
    </svg>
  );
}
