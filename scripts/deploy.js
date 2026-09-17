const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting deployment...");

  // Deploy InstitutionRegistry
  const InstitutionRegistry = await hre.ethers.getContractFactory("InstitutionRegistry");
  const registry = await InstitutionRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`InstitutionRegistry deployed to: ${registryAddress}`);

  // Deploy CredentialManager
  const CredentialManager = await hre.ethers.getContractFactory("CredentialManager");
  const credentialManager = await CredentialManager.deploy(registryAddress);
  await credentialManager.waitForDeployment();
  const credentialManagerAddress = await credentialManager.getAddress();
  console.log(`CredentialManager deployed to: ${credentialManagerAddress}`);

  // Write addresses to frontend
  const frontendDir = path.join(__dirname, "..", "frontend", "src", "abis");
  if (!fs.existsSync(frontendDir)) {
    fs.mkdirSync(frontendDir, { recursive: true });
  }

  const deployedAddresses = {
    InstitutionRegistry: registryAddress,
    CredentialManager: credentialManagerAddress
  };

  fs.writeFileSync(
    path.join(frontendDir, "deployedAddresses.json"),
    JSON.stringify(deployedAddresses, null, 2)
  );

  // Copy ABIs
  const registryArtifact = path.join(__dirname, "..", "artifacts", "contracts", "InstitutionRegistry.sol", "InstitutionRegistry.json");
  const managerArtifact = path.join(__dirname, "..", "artifacts", "contracts", "CredentialManager.sol", "CredentialManager.json");

  if (fs.existsSync(registryArtifact)) {
    fs.copyFileSync(registryArtifact, path.join(frontendDir, "InstitutionRegistry.json"));
  }
  if (fs.existsSync(managerArtifact)) {
    fs.copyFileSync(managerArtifact, path.join(frontendDir, "CredentialManager.json"));
  }

  console.log("Deployment and ABI extraction complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
