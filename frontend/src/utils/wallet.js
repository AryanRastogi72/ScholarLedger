import { createContext } from 'react';

export const WalletContext = createContext({ account: null, chainId: null, connect: () => {}, error: '' });
