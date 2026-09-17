const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TrustAnchor Contracts", function () {
  let InstitutionRegistry, registry, CredentialManager, manager;
  let admin, institution1, institution2, student;

  beforeEach(async function () {
    [admin, institution1, institution2, student] = await ethers.getSigners();

    InstitutionRegistry = await ethers.getContractFactory("InstitutionRegistry");
    registry = await InstitutionRegistry.deploy();
    await registry.waitForDeployment();

    CredentialManager = await ethers.getContractFactory("CredentialManager");
    manager = await CredentialManager.deploy(await registry.getAddress());
    await manager.waitForDeployment();
  });

  describe("InstitutionRegistry", function () {
    it("Should set admin on deployment", async function () {
      expect(await registry.admin()).to.equal(admin.address);
    });

    it("Should register an institution", async function () {
      await registry.registerInstitution(institution1.address, "State University", "state.edu");
      expect(await registry.isRegistered(institution1.address)).to.be.true;
    });

    it("Should reject duplicate registration", async function () {
      await registry.registerInstitution(institution1.address, "State University", "state.edu");
      await expect(
        registry.registerInstitution(institution1.address, "State University", "state.edu")
      ).to.be.revertedWith("Already registered");
    });

    it("Should reject registration from non-admin", async function () {
      await expect(
        registry.connect(institution1).registerInstitution(institution2.address, "Tech Institute", "tech.edu")
      ).to.be.revertedWith("Only admin can perform this action");
    });

    it("Should check isRegistered", async function () {
      expect(await registry.isRegistered(institution1.address)).to.be.false;
      await registry.registerInstitution(institution1.address, "State University", "state.edu");
      expect(await registry.isRegistered(institution1.address)).to.be.true;
    });

    it("Should revoke an institution", async function () {
      await registry.registerInstitution(institution1.address, "State University", "state.edu");
      await registry.revokeInstitution(institution1.address);
      expect(await registry.isRegistered(institution1.address)).to.be.false;
    });
  });

  describe("CredentialManager", function () {
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes("credential123"));
    const studentId = "STU12345";
    const programName = "B.S. Computer Science";

    beforeEach(async function () {
      await registry.registerInstitution(institution1.address, "State University", "state.edu");
    });

    it("Should issue a credential from registered institution", async function () {
      await expect(
        manager.connect(institution1).issueCredential(credentialHash, studentId, programName)
      ).to.emit(manager, "CredentialIssued");

      const [isValid, issuer, issuedAt, isRevoked] = await manager.verifyCredential(credentialHash);
      expect(isValid).to.be.true;
      expect(issuer).to.equal(institution1.address);
      expect(isRevoked).to.be.false;
    });

    it("Should reject issuance from unregistered address", async function () {
      await expect(
        manager.connect(institution2).issueCredential(credentialHash, studentId, programName)
      ).to.be.revertedWith("Issuer not registered");
    });

    it("Should verify a valid credential", async function () {
      await manager.connect(institution1).issueCredential(credentialHash, studentId, programName);
      const [isValid] = await manager.verifyCredential(credentialHash);
      expect(isValid).to.be.true;
    });

    it("Should detect revoked credential", async function () {
      await manager.connect(institution1).issueCredential(credentialHash, studentId, programName);
      await manager.connect(institution1).revokeCredential(credentialHash);
      
      const [isValid, , , isRevoked] = await manager.verifyCredential(credentialHash);
      expect(isValid).to.be.false; // isValid should be false if revoked
      expect(isRevoked).to.be.true;
    });

    it("Should only allow original issuer to revoke", async function () {
      await manager.connect(institution1).issueCredential(credentialHash, studentId, programName);
      await registry.registerInstitution(institution2.address, "Other U", "other.edu");
      
      await expect(
        manager.connect(institution2).revokeCredential(credentialHash)
      ).to.be.revertedWith("Only issuer can revoke");
    });

    it("Should reject duplicate credential hash", async function () {
      await manager.connect(institution1).issueCredential(credentialHash, studentId, programName);
      await expect(
        manager.connect(institution1).issueCredential(credentialHash, "STU999", "Other Program")
      ).to.be.revertedWith("Credential already exists");
    });

    it("Should store merkle root", async function () {
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("root123"));
      await expect(
        manager.connect(institution1).storeMerkleRoot(merkleRoot, 100)
      ).to.emit(manager, "BatchProcessed").withArgs(merkleRoot, 100);
    });
  });
});
