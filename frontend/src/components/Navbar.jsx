import { useContext, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { List, X, Wallet, CaretDown } from '@phosphor-icons/react';
import { WalletContext } from '../utils/wallet';
import { shorten } from './HashText';

const NETWORKS = { 31337: 'Hardhat local', 1: 'Ethereum', 11155111: 'Sepolia' };

const GROUPS = [
  { label: 'Institution', items: [['/issue', 'Issue'], ['/batch', 'Batch issue'], ['/revoke', 'Revoke']] },
  { label: 'Admin', items: [['/register', 'Register institution']] },
  { label: 'Explore', items: [['/explorer', 'Ledger'], ['/demo', 'Forgery demo']] }
];

// Disclosure menu: Enter/Space opens, arrows move, Esc closes and returns focus, outside click closes.
// Below 768px CSS shows the heading and the links inline instead (the full-screen list).
function Dropdown({ label, items, onNavigate }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  const focusFirst = useRef(false);
  const { pathname } = useLocation();
  const active = items.some(([to]) => to === pathname);

  useEffect(() => {
    if (!open) return undefined;
    if (focusFirst.current) { root.current.querySelector('a')?.focus(); focusFirst.current = false; }
    const away = (e) => { if (!root.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  const onKeyDown = (e) => {
    const links = [...root.current.querySelectorAll('a')];
    const i = links.indexOf(document.activeElement);
    if (e.key === 'Escape') { setOpen(false); trigger.current.focus(); }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { focusFirst.current = true; setOpen(true); } else links[(i + 1) % links.length]?.focus();
    } else if (e.key === 'ArrowUp' && open) { e.preventDefault(); links[(i - 1 + links.length) % links.length]?.focus(); }
    else if (e.key === 'Tab' && open && !e.shiftKey && i === links.length - 1) setOpen(false);
  };

  return (
    <div className={`dd${open ? ' open' : ''}`} ref={root} onKeyDown={onKeyDown}>
      <span className="dd-heading">{label}</span>
      <button type="button" ref={trigger} className={`dd-trigger${active ? ' active' : ''}`} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
        {label} <CaretDown size={14} aria-hidden="true" />
      </button>
      <ul className="dd-panel">
        {items.map(([to, text]) => (
          <li key={to}>
            <NavLink to={to} end onClick={() => { setOpen(false); onNavigate(); }}>{text}</NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Navbar() {
  const { account, chainId, connect, error } = useContext(WalletContext);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <NavLink to="/" className="brand" onClick={close}>
          <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M16 7l2.6 5.6 6.1.7-4.5 4.2 1.2 6L16 20.5 10.6 23.5l1.2-6-4.5-4.2 6.1-.7z" fill="currentColor" /></svg>
          ScholarLedger
        </NavLink>
        <button type="button" className="secondary menu-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen(!open)}>
          {open ? <X size={20} aria-hidden="true" /> : <List size={20} aria-hidden="true" />} Menu
        </button>
        <nav id="site-nav" aria-label="Main" className={`nav-groups${open ? ' open' : ''}`}>
          <NavLink to="/verify" end className="nav-link primary" onClick={close}>Verify</NavLink>
          {GROUPS.map((g) => <Dropdown key={g.label} {...g} onNavigate={close} />)}
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
