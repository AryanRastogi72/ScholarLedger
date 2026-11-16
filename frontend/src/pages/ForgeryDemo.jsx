import { useContext, useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { getSigner, getReadProvider, getRegistryContract, getCredentialManagerContract } from '../utils/contracts';
import { WalletContext } from '../utils/wallet';
import { useTx } from '../utils/useTx';
import PageHeader from '../components/PageHeader';
import TxStatus from '../components/TxStatus';
import HashText from '../components/HashText';

function ForgeryDemo() {
  const { account } = useContext(WalletContext);
  const [registered, setRegistered] = useState(null);
  const [fake, setFake] = useState([]);
  const { tx, run } = useTx();

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

  // Simulation: a hash-only system has no issuer check, so any wallet can anchor any hash.
  const simulate = () => {
    const wallet = ethers.Wallet.createRandom().address;
    const hash = ethers.hexlify(ethers.randomBytes(32));
    setFake((f) => [{ hash, wallet }, ...f]);
  };

  const tryForgery = () => run(async () => {
    const manager = await getCredentialManagerContract(await getSigner());
    return manager.issueCredential(ethers.hexlify(ethers.randomBytes(32)));
  });

  return (
    <div className="fade-in">
      <PageHeader title="Forgery demo">
        The Block.co attack, side by side. The same forged commitment, once against a hash-only system and once against ScholarLedger.
      </PageHeader>
      <div className="split">
        <section className="panel stack" aria-labelledby="legacy">
          <h2 id="legacy">Hash-only system <span className="badge neutral">Simulated</span></h2>
          <p>Anchoring a hash needs no proof of who you are. Any wallet can publish a hash for a degree it never issued, and a later check will say the hash exists.</p>
          <button type="button" className="secondary" onClick={simulate}>Anchor a forged hash from a random wallet</button>
          <ul className="stack" aria-live="polite">
            {fake.map((f) => (
              <li key={f.hash}>
                <span className="badge valid">Accepted</span> <HashText value={f.hash} /> from <code title={f.wallet}>{f.wallet.slice(0, 8)}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel stack" aria-labelledby="real">
          <h2 id="real">ScholarLedger <span className="badge neutral">Real transaction</span></h2>
          <ol>
            <li>Switch MetaMask to an account that is not a registered institution.</li>
            <li>Press the button below.</li>
            <li>The contract rejects the transaction.</li>
          </ol>
          {registered === true && (
            <p className="tx-status" role="status">The connected wallet is a registered institution, so this would succeed. Switch to an unregistered account first.</p>
          )}
          {!account && <p className="muted">Connect a wallet from the top bar to try it.</p>}
          <button type="button" onClick={tryForgery} disabled={!account || registered === true || tx.phase === 'wallet' || tx.phase === 'submitted'}>
            Try forgery
          </button>
          <TxStatus tx={tx} />
        </section>
      </div>
    </div>
  );
}

export default ForgeryDemo;
