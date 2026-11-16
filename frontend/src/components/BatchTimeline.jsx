import { useMemo } from 'react';
import HashText from './HashText';

const W = 760;
const LEFT = 104;
const RIGHT = 16;
const PLOT = W - LEFT - RIGHT;
const LANE_GAP = 14;

// Real timings only: every bar runs from the row's submit time to its confirm time,
// as reported by the batch service (ms from batch start). One lane per group.
function BatchTimeline({ results, conflicts, metrics, merkleRoot, maxTime = 0, mergeLanes = false, laneName = 'Group', showStats = true }) {
  const model = useMemo(() => {
    const rows = results.flat().map((r) => (mergeLanes ? { ...r, group: 0 } : r));
    // maxTime lets stacked timelines share one time axis
    const total = Math.max(1, maxTime, ...rows.map((r) => r.confirmedAt));
    const groups = [...new Set(rows.map((r) => r.group))].sort((a, b) => a - b);
    const pitch = (n) => Math.max(2.5, Math.min(8, 220 / n));
    let y = 24;
    const lanes = groups.map((g) => {
      const inLane = rows.filter((r) => r.group === g);
      const p = pitch(inLane.length);
      const bn = inLane.map((r) => r.blockNumber).filter((b) => b != null);
      const blocks = bn.length ? (Math.min(...bn) === Math.max(...bn) ? `block ${bn[0]}` : `blocks ${Math.min(...bn)}\u2013${Math.max(...bn)}`) : '';
      const lane = { g, top: y, p, blocks, height: inLane.length * p + 12 };
      y += lane.height + LANE_GAP;
      return lane;
    });
    const x = (t) => LEFT + (t / total) * PLOT;
    const pos = {};
    lanes.forEach((lane) => {
      rows.filter((r) => r.group === lane.g).forEach((r, i) => {
        pos[r.tx.idx] = { r, y: lane.top + 8 + i * lane.p, h: Math.max(1.5, lane.p - 1.5) };
      });
    });
    return { total, lanes, x, pos, height: y + 18 };
  }, [results, maxTime, mergeLanes]);

  const { total, lanes, x, pos, height } = model;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * total);
  const aborted = (r) => !r.success && /Duplicate/.test(r.error ?? '');

  return (
    <figure className="timeline">
      <div className="timeline-scroll">
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Timeline of ${results.flat().length} rows in ${lanes.length} groups over ${total} milliseconds`} className="timeline-svg">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1="14" y2={height - 18} stroke="var(--rule)" strokeWidth="1" strokeDasharray="2 4" />
              <text x={x(t)} y={height - 4} textAnchor={t === total ? 'end' : 'middle'} fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="10">{Math.round(t)} ms</text>
            </g>
          ))}
          {lanes.map((lane) => (
            <g key={lane.g}>
              <rect x={LEFT - 6} y={lane.top} width={PLOT + 12} height={lane.height} rx="4" fill="var(--surface)" stroke="var(--rule)" />
              <text x="8" y={lane.top + 18} fill="var(--ink)" fontFamily="var(--font-ui)" fontSize="12" fontWeight="600">{mergeLanes ? laneName : `${laneName} ${lane.g + 1}`}</text>
              {lane.blocks && <text x="8" y={lane.top + 32} fill="var(--muted)" fontFamily="var(--font-mono)" fontSize="10">{lane.blocks}</text>}
            </g>
          ))}
          {conflicts.map((c) => {
            const a = pos[c.txA];
            const b = pos[c.txB];
            if (!a || !b) return null;
            const x1 = x(a.r.confirmedAt);
            const x2 = x(b.r.submittedAt);
            return <path key={`${c.txA}-${c.txB}`} d={`M${x1} ${a.y + a.h / 2} H${Math.max(x1, x2) + 6} V${b.y + b.h / 2} H${x2}`} fill="none" stroke="var(--warn)" strokeWidth="1" />;
          })}
          {Object.values(pos).map(({ r, y, h }) => {
            const x1 = x(r.submittedAt);
            const x2 = Math.max(x(r.confirmedAt), x1 + 2);
            if (aborted(r)) {
              return (
                <g key={r.tx.idx}>
                  <rect x={x1 - 3} y={y} width="6" height={h} fill="var(--warn)" />
                  <line x1={x1 - 7} x2={x1 + 7} y1={y + h / 2} y2={y + h / 2} stroke="var(--danger)" strokeWidth="1.5" />
                  <title>{`Row ${r.tx.idx + 1}: ${r.tx.studentId}. Aborted, duplicate of an earlier row.`}</title>
                </g>
              );
            }
            return (
              <g key={r.tx.idx}>
                <rect x={x1} y={y} width={x2 - x1} height={h} rx="1.5" fill={r.success ? 'var(--accent)' : 'var(--danger)'} />
                <title>{`Row ${r.tx.idx + 1}: ${r.tx.studentId}. ${r.success ? 'Issued' : `Failed: ${r.error}`}. Submitted at ${r.submittedAt} ms, confirmed at ${r.confirmedAt} ms.`}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="timeline-legend">
        <span><i className="sw ok" /> Issued (submit to confirm)</span>
        <span><i className="sw warn" /> Aborted duplicate</span>
        <span><i className="sw line" /> Conflict: waited for the row it clashes with</span>
      </figcaption>
      {showStats && <dl className="stats mt">
        <div><dt>Total time</dt><dd>{(metrics.totalTimeMs / 1000).toFixed(2)} s</dd></div>
        <div><dt>Throughput</dt><dd>{metrics.throughputTxPerSec.toFixed(1)} tx/s</dd></div>
        <div><dt>Merkle root</dt><dd className="root-cell">{merkleRoot ? <HashText value={merkleRoot} /> : '–'}</dd></div>
      </dl>}
    </figure>
  );
}

export default BatchTimeline;
