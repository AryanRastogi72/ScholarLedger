import { useRef, useState } from 'react';
import { UploadSimple } from '@phosphor-icons/react';

// Drop zone that is also a real button. Calls onFile(File).
function FileDrop({ onFile, accept, title, hint }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const pick = (f) => f && onFile(f);
  return (
    <>
      <button
        type="button"
        className={`drop${over ? ' over' : ''}`}
        onClick={() => input.current.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
      >
        <UploadSimple size={32} aria-hidden="true" />
        <strong>{title}</strong>
        <span className="muted">{hint}</span>
      </button>
      <input
        ref={input} type="file" accept={accept} hidden
        onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }}
      />
    </>
  );
}

export default FileDrop;
