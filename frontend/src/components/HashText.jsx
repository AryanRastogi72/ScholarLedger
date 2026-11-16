import { useState } from 'react';
import { Copy, Check } from '@phosphor-icons/react';

export const shorten = (v, head = 6, tail = 4) => (v && v.length > head + tail + 3 ? `${v.slice(0, head)}…${v.slice(-tail)}` : v);

// Monospace, middle-truncated hash or address with one-click copy and the full value in title.
function HashText({ value, full = false }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="hash">
      <code title={value}>{full ? value : shorten(value)}</code>
      <button type="button" className="secondary small" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${value}`}>
        {copied ? <Check size={16} /> : <Copy size={16} />}
        <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </span>
  );
}

export default HashText;
