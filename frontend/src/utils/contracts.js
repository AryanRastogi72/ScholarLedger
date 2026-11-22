import { ethers } from 'ethers';
import InstitutionRegistryABI from '../abis/InstitutionRegistry.json';
import CredentialManagerABI from '../abis/CredentialManager.json';
import deployedAddresses from '../abis/deployedAddresses.json';

export function getProvider() {
  if (!window.ethereum) throw new Error('MetaMask not found');
  return new ethers.BrowserProvider(window.ethereum);
}

export function getReadProvider() {
  return new ethers.JsonRpcProvider(import.meta.env.VITE_RPC_URL ?? 'http://127.0.0.1:8545');
}

// The one chain this site talks to; every write goes through getSigner(), so the check lives here.
export const SITE_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 31337);
export const MANAGER_ADDRESS = deployedAddresses.CredentialManager;

export async function getSigner() {
  const provider = getProvider();
  const { chainId } = await provider.getNetwork();
  if (Number(chainId) !== SITE_CHAIN_ID) {
    throw new Error(`Your wallet is on chain ${chainId}. Switch MetaMask to Hardhat Local (${SITE_CHAIN_ID}) and try again.`);
  }
  return provider.getSigner();
}

export function getRegistryContract(signerOrProvider) {
  return new ethers.Contract(
    deployedAddresses.InstitutionRegistry,
    InstitutionRegistryABI.abi,
    signerOrProvider
  );
}

export function getCredentialManagerContract(signerOrProvider) {
  return new ethers.Contract(
    deployedAddresses.CredentialManager,
    CredentialManagerABI.abi,
    signerOrProvider
  );
}
