import { useState, useCallback } from 'react';
import { friendlyError, errorKind } from './errors';

// Runs `send` (returns a transaction response) and tracks: wallet -> submitted -> confirmed | error.
export function useTx() {
  const [tx, setTx] = useState({ phase: 'idle' });

  const run = useCallback(async (send) => {
    setTx({ phase: 'wallet' });
    try {
      const sent = await send();
      setTx({ phase: 'submitted', hash: sent.hash });
      const receipt = await sent.wait();
      setTx({ phase: 'confirmed', hash: sent.hash, block: receipt.blockNumber, gas: receipt.gasUsed.toString() });
      return { sent, receipt };
    } catch (err) {
      setTx({ phase: 'error', message: friendlyError(err), kind: errorKind(err) });
      return null;
    }
  }, []);

  const reset = useCallback(() => setTx({ phase: 'idle' }), []);
  return { tx, run, reset };
}
