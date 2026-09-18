import React from 'react';

function StatusBadge({ status }) {
  const normalizedStatus = status ? status.toLowerCase() : 'pending';
  return (
    <span className={`badge ${normalizedStatus}`}>
      {status}
    </span>
  );
}

export default StatusBadge;
