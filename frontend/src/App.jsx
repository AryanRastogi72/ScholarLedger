import React, { useState, createContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import Register from './pages/Register';
import Issue from './pages/Issue';

import Verify from './pages/Verify';
import Revoke from './pages/Revoke';
import Explorer from './pages/Explorer';
import ForgeryDemo from './pages/ForgeryDemo';
import './App.css';

export const WalletContext = createContext();

function App() {
  const [account, setAccount] = useState(null);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
        if (accounts.length > 0) setAccount(accounts[0]);
      });
      window.ethereum.on('accountsChanged', accounts => {
        if (accounts.length > 0) setAccount(accounts[0]);
        else setAccount(null);
      });
    }
  }, []);

  return (
    <WalletContext.Provider value={{ account, setAccount }}>
      <BrowserRouter>
        <div className="app-container">
          <Navbar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/register" element={<Register />} />
              <Route path="/issue" element={<Issue />} />
              
              <Route path="/verify" element={<Verify />} />
              <Route path="/revoke" element={<Revoke />} />
              <Route path="/explorer" element={<Explorer />} />
              <Route path="/demo" element={<ForgeryDemo />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </WalletContext.Provider>
  );
}

export default App;
