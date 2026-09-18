import { ethers } from 'ethers';
import InstitutionRegistryABI from '../abis/InstitutionRegistry.json';
import CredentialManagerABI from '../abis/CredentialManager.json';
import deployedAddresses from '../abis/deployedAddresses.json';

export function getProvider() {
  if (!window.ethereum) throw new Error('MetaMask not found');
  return new ethers.BrowserProvider(window.ethereum);
}

export async function getSigner() {
  const provider = getProvider();
  return provider.getSigner();
}

export async function getRegistryContract(signerOrProvider) {
  return new ethers.Contract(
    deployedAddresses.InstitutionRegistry,
    InstitutionRegistryABI.abi,
    signerOrProvider
  );
}

export async function getCredentialManagerContract(signerOrProvider) {
  return new ethers.Contract(
    deployedAddresses.CredentialManager,
    CredentialManagerABI.abi,
    signerOrProvider
  );
}

export { deployedAddresses };
