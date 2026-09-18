import React, { useContext, useState } from 'react';
import { WalletContext } from '../App';

function MetaMaskConnect() {
  const { account, setAccount } = useContext(WalletContext);
  const [error, setError] = useState('');

  const connect = async () => {
    if (!window.ethereum) {
      setError('MetaMask not installed');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) {
        setAccount(accounts[0]);
      }
    } catch (err) {
      console.error(err);
      setError('Connection failed');
    }
  };

  if (account) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span>{account.slice(0, 6)}...{account.slice(-4)}</span>
      </div>
    );
  }

  return (
    <div>
      <button onClick={connect}>Connect MetaMask</button>
      {error && <span style={{ color: 'var(--error-color)', marginLeft: '10px' }}>{error}</span>}
    </div>
  );
}

export default MetaMaskConnect;
