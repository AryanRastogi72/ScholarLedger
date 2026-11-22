import { useContext, useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { CircleNotch, CheckCircle, XCircle } from '@phosphor-icons/react';
import { getSigner, getReadProvider, getRegistryContract, getCredentialManagerContract } from '../utils/contracts';
import { WalletContext } from '../utils/wallet';
import { useTx } from '../utils/useTx';
import PageHeader from '../components/PageHeader';
import CertificateCard from '../components/CertificateCard';
import HashText from '../components/HashText';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STEP_MS = 350; // pacing only; the right-hand outcome waits for the real transaction

// The outcome depends on why the call failed: the contract refused it, the user cancelled, or the node is down.
const OUTCOME = {
  revert: (m) => <><strong>Refused by the contract:</strong> {m}</>,
  rejected: () => <strong>You cancelled in the wallet.</strong>,
  offline: () => <strong>Cannot reach the node.</strong>,
  network: (m) => <><strong>Wrong network.</strong> {m}</>
};

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Steps({ step, outcome }) {
  return (
    <ol className="seq" aria-live="polite">
      <li className={step >= 1 ? 'on' : ''}><span className="seq-n">1</span> Forged credential</li>
      <li className={step >= 2 ? 'on' : ''}><span className="seq-n">2</span> Sending to chain {step === 2 && <CircleNotch size={16} className="spin" aria-hidden="true" />}</li>
      <li className={step >= 3 ? 'on' : ''}><span className="seq-n">3</span> Outcome {step >= 3 && outcome}</li>
    </ol>
  );
}

function ForgeryDemo() {
  const { account } = useContext(WalletContext);
  const [registered, setRegistered] = useState(null);
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(0);
  const { tx, run } = useTx();

  // One forged commitment shared by both sides ("same forged hash")
  const forged = useMemo(() => ethers.hexlify(ethers.randomBytes(32)), []);
  const fakeIssuer = useMemo(() => ethers.Wallet.createRandom().address, []);
  const card = {
    institution: 'Prestige University', issuer: account ?? fakeIssuer, studentId: 'S0000', programName: 'Ph.D. in Anything',
    metadata: 'Never issued', commitment: forged, issuedAt: Math.floor(Date.now() / 1000)
  };

  useEffect(() => {
    if (!account) { setRegistered(null); return; }
    (async () => {
      try {
        setRegistered(await (await getRegistryContract(getReadProvider())).isRegistered(account));
      } catch {
        setRegistered(null);
      }
    })();
  }, [account]);

  const startLeft = async () => {
    const wait = reduced() ? 0 : STEP_MS;
    setLeft(1); await sleep(wait); setLeft(2); await sleep(wait); setLeft(3);
  };

  const startRight = async () => {
    const wait = reduced() ? 0 : STEP_MS;
    setRight(1); await sleep(wait); setRight(2);
    await run(async () => (await getCredentialManagerContract(await getSigner())).issueCredential(forged));
    await sleep(wait); setRight(3);
  };

  const accepted = tx.phase === 'confirmed';

  return (
    <div className="fade-in">
      <PageHeader title="Forgery demo">
        The Block.co attack, side by side. The same forged hash goes to a hash-only system and to ScholarLedger.
      </PageHeader>
      <p className="mono muted">Forged hash: <HashText value={forged} /></p>

      <div className="demo-grid">
        <section className="demo-col" aria-labelledby="legacy">
          <h2 id="legacy">Hash-only system <span className="badge neutral">Simulated</span></h2>
          <p>Anchoring a hash needs no proof of who you are. Any wallet can publish a hash for a degree it never issued.</p>
          <button type="button" className="secondary" onClick={startLeft} disabled={left > 0 && left < 3}>
            {left === 3 ? 'Run again' : 'Anchor the forged hash'}
          </button>
          <Steps step={left} outcome={
            <div className="outcome ok"><CheckCircle size={22} weight="fill" aria-hidden="true" /> <span><strong>Accepted. Verifier says valid.</strong> The forgery now looks genuine.</span></div>
          } />
          {left >= 1 && (
            <div className="demo-card fade-in"><CertificateCard {...card} status={left === 3 ? 'VALID' : undefined} /></div>
          )}
        </section>

        <div className="demo-divider" aria-hidden="true"><span>same forged hash</span></div>

        <section className="demo-col" aria-labelledby="real">
          <h2 id="real">ScholarLedger <span className="badge neutral">Real contract check</span></h2>
          <p>Switch MetaMask to an account that is not a registered institution, then try the same hash. Your wallet first simulates the call on the contract. The contract refuses it, so nothing is broadcast.</p>
          {registered === true && <p className="tx-status" role="status"><span>The connected wallet is a registered institution, so this would succeed. Switch to an unregistered account first.</span></p>}
          {!account && <p className="muted">Connect a wallet from the top bar to try it.</p>}
          <button type="button" onClick={startRight} disabled={!account || registered === true || (right > 0 && right < 3)}>
            {right === 3 ? 'Run again' : 'Try the forgery'}
          </button>
          <Steps step={right} outcome={accepted ? (
            <div className="outcome ok"><CheckCircle size={22} weight="fill" aria-hidden="true" /> <span><strong>Accepted.</strong> This wallet is a registered institution.</span></div>
          ) : (
            <div className="outcome bad"><XCircle size={22} weight="fill" aria-hidden="true" /> <span>{OUTCOME[tx.kind ?? 'revert'](tx.message)}</span></div>
          )} />
          {right >= 1 && (
            <div className="demo-card fade-in"><CertificateCard {...card} status={right === 3 ? (accepted ? 'VALID' : tx.kind === 'revert' ? 'REJECTED' : undefined) : undefined} /></div>
          )}
        </section>
      </div>
    </div>
  );
}

export default ForgeryDemo;
