import { useContext, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { List, X, Wallet } from '@phosphor-icons/react';
import { WalletContext } from '../utils/wallet';
import { shorten } from './HashText';

const NETWORKS = { 31337: 'Hardhat local', 1: 'Ethereum', 11155111: 'Sepolia' };

function Navbar() {
  const { account, chainId, connect, error } = useContext(WalletContext);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const link = (to, label, cls = '') => (
    <NavLink to={to} end className={`nav-link ${cls}`} onClick={close}>{label}</NavLink>
  );

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="brand" onClick={close}>ScholarLedger</NavLink>
        <button type="button" className="secondary menu-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>
          {open ? <X size={20} aria-hidden="true" /> : <List size={20} aria-hidden="true" />} Menu
        </button>
        <nav id="site-nav" aria-label="Main" className={`nav-groups${open ? ' open' : ''}`}>
          <div className="nav-group">{link('/verify', 'Verify', 'primary')}</div>
          <div className="nav-group" role="group" aria-label="Institution">
            <span className="nav-group-label">Institution</span>
            {link('/issue', 'Issue')}{link('/batch', 'Batch issue')}{link('/revoke', 'Revoke')}
          </div>
          <div className="nav-group" role="group" aria-label="Admin">
            <span className="nav-group-label">Admin</span>
            {link('/register', 'Register institution')}
          </div>
          <div className="nav-group" role="group" aria-label="Explore">
            <span className="nav-group-label">Explore</span>
            {link('/explorer', 'Ledger')}{link('/demo', 'Forgery demo')}
          </div>
          <div className="wallet">
            {account ? (
              <>
                <span className="chip"><Wallet size={14} aria-hidden="true" /><code title={account}>{shorten(account)}</code></span>
                <span className={`chip${chainId && chainId !== 31337 ? ' warn' : ''}`}>
                  {chainId ? (NETWORKS[chainId] ?? `Chain ${chainId}`) : 'Unknown network'}
                  {chainId && chainId !== 31337 ? ' (expected 31337)' : ''}
                </span>
              </>
            ) : (
              <button type="button" className="secondary small" onClick={connect}>Connect wallet</button>
            )}
            {error && <span className="field-error" role="alert">{error}</span>}
          </div>
        </nav>
      </div>
    </header>
  );
}

export default Navbar;
