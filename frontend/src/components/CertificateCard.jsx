import { useId } from 'react';

const STAMPS = {
  VALID: { cls: 'valid', text: 'Valid' },
  REVOKED: { cls: 'revoked', text: 'Revoked' },
  ALTERED: { cls: 'altered', text: 'Altered' },
  'ISSUER DEREGISTERED': { cls: 'warn', text: 'Issuer deregistered' },
  REJECTED: { cls: 'revoked', text: 'Rejected' }
};

function Seal({ address }) {
  const id = useId();
  const ring = `${address} · REGISTERED ISSUER · `;
  return (
    <svg className="cert-seal" viewBox="0 0 120 120" role="img" aria-label="Issuer seal">
      <defs>
        <path id={id} d="M60,60 m-47,0 a47,47 0 1,1 94,0 a47,47 0 1,1 -94,0" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="60" cy="60" r="38" fill="none" stroke="currentColor" strokeWidth="1" />
      <text fontSize="6.4" fontFamily="var(--font-mono)" fill="currentColor" letterSpacing="0.4">
        <textPath href={`#${id}`} textLength="292" lengthAdjust="spacing">{ring}</textPath>
      </text>
      <path d="M60 36 l6 13 14 2 -10 10 3 14 -13 -7 -13 7 3 -14 -10 -10 14 -2z" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

// A credential drawn like a printed registrar's certificate.
// `status` draws the stamp; `claimed` shows file contents that failed the commitment check (struck through).
function CertificateCard({ institution, issuer, studentId, programName, metadata, commitment, issuedAt, status, specimen = false, claimed = false }) {
  const stamp = status ? STAMPS[status] : null;
  const date = issuedAt ? new Date(issuedAt * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null;
  return (
    <figure className={`cert${stamp ? ` is-${stamp.cls}` : ''}${claimed ? ' is-claimed' : ''}`} aria-label={`Credential certificate${stamp ? `, ${stamp.text}` : ''}`}>
      <div className="cert-inner">
        <p className="cert-institution">{institution || 'Unknown institution'}</p>
        <div className="cert-body">
          {studentId ? (
            <>
              <p className="cert-label">Awarded to</p>
              <p className="cert-student">{studentId}</p>
              <p className="cert-program">{programName}</p>
              {metadata && <p className="cert-meta">{metadata}</p>}
            </>
          ) : (
            <p className="cert-meta">Student details are held by the student. Upload the credential file to show them.</p>
          )}
        </div>
        <div className="cert-foot">
          <div>
            {date && <p className="cert-date">{date}</p>}
            <p className="cert-serial" title={commitment}><span>No.</span> {commitment}</p>
          </div>
          {issuer && <Seal address={issuer} />}
        </div>
        {specimen && <p className="cert-watermark" aria-hidden="true">Specimen</p>}
        {stamp && <p className={`cert-stamp ${stamp.cls}`}>{stamp.text}</p>}
      </div>
    </figure>
  );
}

export default CertificateCard;
