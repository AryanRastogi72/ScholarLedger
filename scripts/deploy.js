const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting deployment...");

  // Admins and threshold: Hardhat accounts #0, #3, #4 with 2-of-3 on the local chain, from the environment elsewhere
  const signers = await hre.ethers.getSigners();
  const local = (await hre.ethers.provider.getNetwork()).chainId === 31337n;
  let admins;
  let threshold;
  if (local) {
    admins = [signers[0].address, signers[3].address, signers[4].address];
    threshold = 2;
  } else {
    if (!process.env.ADMIN_ADDRESSES || !process.env.ADMIN_THRESHOLD) {
      throw new Error("Set ADMIN_ADDRESSES (comma-separated) and ADMIN_THRESHOLD for this network");
    }
    admins = process.env.ADMIN_ADDRESSES.split(",").map((a) => a.trim());
    threshold = Number(process.env.ADMIN_THRESHOLD);
  }
  console.log(`Admins: ${admins.join(", ")} (threshold ${threshold})`);

  // Deploy InstitutionRegistry
  const InstitutionRegistry = await hre.ethers.getContractFactory("InstitutionRegistry");
  const registry = await InstitutionRegistry.deploy(admins, threshold);
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

  if (local) {
    // #0 proposes, #3 approves: the 2-of-3 threshold is met
    const issuer = signers[1];
    await (await registry.connect(signers[0]).proposeRegister(issuer.address, "Demo University", "demo.edu")).wait();
    await (await registry.connect(signers[3]).approve(0)).wait();
    console.log(`Registered Demo University issuer: ${issuer.address}`);
  }

  console.log("Deployment and ABI extraction complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
