import React, { useContext } from 'react';
import { NavLink } from 'react-router-dom';
import MetaMaskConnect from './MetaMaskConnect';

function Navbar() {
  return (
    <nav className="navbar">
      <div className="nav-brand">
        <h2>TrustAnchor</h2>
      </div>
      <div className="nav-links">
        <NavLink to="/">Home</NavLink>
        <NavLink to="/register">Register</NavLink>
        <NavLink to="/issue">Issue</NavLink>
        
        <NavLink to="/verify">Verify</NavLink>
        <NavLink to="/revoke">Revoke</NavLink>
        <NavLink to="/explorer">Explorer</NavLink>
        <NavLink to="/demo">Forgery Demo</NavLink>
      </div>
      <div>
        <MetaMaskConnect />
      </div>
    </nav>
  );
}

export default Navbar;
