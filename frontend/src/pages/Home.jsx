import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from '@phosphor-icons/react';
import { getReadProvider, getRegistryContract, getCredentialManagerContract } from '../utils/contracts';

function useChainStats() {
  const [stats, setStats] = useState(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        const provider = getReadProvider();
        const registry = await getRegistryContract(provider);
        const manager = await getCredentialManagerContract(provider);
        const [inst, creds, batches, revoked] = await Promise.all([
          registry.queryFilter(registry.filters.InstitutionRegistered()),
          manager.getCredentialCount(),
          manager.getBatchCount(),
          manager.queryFilter(manager.filters.CredentialRevoked())
        ]);
        setStats({ institutions: inst.length, credentials: Number(creds), batches: Number(batches), revoked: revoked.length });
      } catch {
        setOffline(true);
      }
    })();
  }, []);
  return { stats, offline };
}

const PAPERS = [
  'Zonneveld, Rafaiani, Baldi. A Forgery Attack on the Block.co Blockchain-Based Digital Credential Certification System (2026). The attack this project closes.',
  'Saramago, Meling, Jehl. A Privacy-Preserving and Transparent Certification System for Digital Credentials (OPODIS 2022). Source of the commitment idea.',
  'Gelashvili et al. Block-STM: Scaling Blockchain Execution by Turning Ordering Curse to a Performance Blessing (PPoPP 2023). Model for the batch engine.',
  'Fernandez-Blanco et al. A Blockchain Based System for Preventing Academic Forgery: Design and Practical Evaluation for CPU-Based and Low-Power Computers (IEEE BCCA 2024). Template for the evaluation.'
];

function Home() {
  const { stats, offline } = useChainStats();
  const cells = [
    ['Institutions', stats?.institutions],
    ['Credentials', stats?.credentials],
    ['Batches', stats?.batches],
    ['Revoked', stats?.revoked]
  ];

  return (
    <div className="fade-in">
      <section className="hero">
        <h1>Academic credentials you can check, and nobody can forge.</h1>
        <p className="lede">
          Systems like Block.co anchor a document hash on a blockchain. That proves the document was not changed, but not
          who published it. Anyone with a wallet can anchor a forged degree and the check still says valid. ScholarLedger
          makes the chain itself refuse hashes from anyone who is not a registered institution.
        </p>
        <Link to="/verify" className="nav-link primary cta">
          Verify a credential <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </section>

      <section aria-labelledby="live">
        <h2 id="live">The ledger right now</h2>
        {offline ? (
          <p className="tx-status error" role="alert">
            <span>Node offline. Start the local chain with <code>npx hardhat node</code> and deploy the contracts to see live numbers.</span>
          </p>
        ) : (
          <dl className="stats">
            {cells.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value ?? '–'}</dd></div>
            ))}
          </dl>
        )}
      </section>

      <section aria-labelledby="how">
        <h2 id="how">How it works</h2>
        <ol className="steps">
          <li><div><strong>Register the issuer.</strong>The admin adds a university wallet to the on-chain registry, with its name and domain.</div></li>
          <li><div><strong>Issue a commitment.</strong>The university hashes the student details with a random salt and sends only that commitment. The student gets a credential file with the details.</div></li>
          <li><div><strong>Verify the file.</strong>Anyone uploads the file. The page recomputes the commitment, checks it on the chain, and shows who issued it. No wallet needed.</div></li>
        </ol>
      </section>

      <section className="novelty" aria-labelledby="identity">
        <div>
          <h2 id="identity">Identity-bound issuance</h2>
          <p>
            The contract checks who is calling before it stores anything. A forged degree from an unknown wallet is rejected
            by the network itself, so a valid result always means a registered institution signed it.
          </p>
          <p>Try it on the <Link to="/demo">forgery demo</Link>.</p>
        </div>
        <pre className="code" aria-label="Enforced rule">{`function issueCredential(bytes32 commitment) external {
  require(
    registry.isRegistered(msg.sender),
    "Issuer not registered"
  );
  ...
}`}</pre>
      </section>

      <section className="novelty" aria-labelledby="occ">
        <div>
          <h2 id="occ">Batch issuance with conflict detection</h2>
          <p>
            A graduation day means thousands of credentials. The batch service finds rows that clash, such as the same student
            and program twice, places them in different groups, and submits the rows of a group back to back without waiting for each other. Conflicting rows wait for the next group and are re-checked first. Then it anchors one Merkle root for
            everything that succeeded. This follows the optimistic concurrency idea from Block-STM.
          </p>
          <p><Link to="/batch">Open batch issue</Link></p>
        </div>
        <ol className="pipeline" aria-label="Batch pipeline">
          <li>Conflict graph</li><li>Groups</li><li>Back-to-back send</li><li>Merkle root</li>
        </ol>
      </section>

      <section aria-labelledby="privacy">
        <h2 id="privacy">What stays private</h2>
        <div className="two-col">
          <div>
            <h3>On the chain</h3>
            <ul>
              <li>A salted SHA-256 commitment</li>
              <li>The issuing wallet and the date</li>
              <li>Whether it was revoked</li>
              <li>Batch Merkle roots and counts</li>
            </ul>
          </div>
          <div>
            <h3>Held by the student</h3>
            <ul>
              <li>Student ID and program</li>
              <li>Any extra details</li>
              <li>The salt that unlocks the commitment</li>
              <li>The Merkle proof for batch credentials</li>
            </ul>
          </div>
        </div>
      </section>

      <section aria-labelledby="refs">
        <h2 id="refs">References</h2>
        <ol className="refs">{PAPERS.map((p) => <li key={p}>{p}</li>)}</ol>
      </section>
    </div>
  );
}

export default Home;
