import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Register from './pages/Register';
import Issue from './pages/Issue';
import BatchIssue from './pages/BatchIssue';
import Verify from './pages/Verify';
import Revoke from './pages/Revoke';
import Explorer from './pages/Explorer';
import ForgeryDemo from './pages/ForgeryDemo';
import { WalletContext } from './utils/wallet';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/public-sans';
import '@fontsource/ibm-plex-mono/400.css';

function App() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return undefined;
    const onAccounts = (a) => setAccount(a[0] ?? null);
    const onChain = (id) => setChainId(parseInt(id, 16));
    eth.request({ method: 'eth_accounts' }).then(onAccounts).catch(() => {});
    eth.request({ method: 'eth_chainId' }).then(onChain).catch(() => {});
    eth.on('accountsChanged', onAccounts);
    eth.on('chainChanged', onChain);
    return () => {
      eth.removeListener('accountsChanged', onAccounts);
      eth.removeListener('chainChanged', onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    setError('');
    if (!window.ethereum) { setError('No wallet found. Install MetaMask.'); return; }
    try {
      setAccount((await window.ethereum.request({ method: 'eth_requestAccounts' }))[0] ?? null);
    } catch {
      setError('Connection was declined.');
    }
  }, []);

  return (
    <WalletContext.Provider value={{ account, chainId, connect, error }}>
      <BrowserRouter>
        <a href="#main" className="skip-link">Skip to content</a>
        <Navbar />
        <main id="main" className="main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/register" element={<Register />} />
            <Route path="/issue" element={<Issue />} />
            <Route path="/batch" element={<BatchIssue />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/revoke" element={<Revoke />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/demo" element={<ForgeryDemo />} />
          </Routes>
        </main>
      </BrowserRouter>
    </WalletContext.Provider>
  );
}

export default App;
