const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ScholarLedger Contracts", function () {
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
      await registry.revokeInstitution(institution1.address, await time.latest());
      expect(await registry.isRegistered(institution1.address)).to.be.false;
    });

    it("Should reject the zero address and an empty domain", async function () {
      await expect(registry.registerInstitution(ethers.ZeroAddress, "X", "x.edu")).to.be.revertedWith("Zero address");
      await expect(registry.registerInstitution(institution1.address, "X", "")).to.be.revertedWith("Domain required");
    });

    it("Should never let a deregistered address register again", async function () {
      await registry.registerInstitution(institution1.address, "State University", "state.edu");
      await registry.revokeInstitution(institution1.address, await time.latest());
      await expect(
        registry.registerInstitution(institution1.address, "State University", "state.edu")
      ).to.be.revertedWith("Address was registered before");
    });

    it("Should reject a validUntil in the future", async function () {
      await registry.registerInstitution(institution1.address, "State University", "state.edu");
      await expect(
        registry.revokeInstitution(institution1.address, (await time.latest()) + 1000)
      ).to.be.revertedWith("validUntil in the future");
    });
  });

  describe("CredentialManager", function () {
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes("credential123"));

    beforeEach(async function () {
      await registry.registerInstitution(institution1.address, "State University", "state.edu");
    });

    it("Should issue a credential from registered institution", async function () {
      await expect(
        manager.connect(institution1).issueCredential(credentialHash)
      ).to.emit(manager, "CredentialIssued");

      const [isValid, issuer, issuedAt, isRevoked] = await manager.verifyCredential(credentialHash);
      expect(isValid).to.be.true;
      expect(issuer).to.equal(institution1.address);
      expect(isRevoked).to.be.false;
    });

    it("Should reject issuance from unregistered address", async function () {
      await expect(
        manager.connect(institution2).issueCredential(credentialHash)
      ).to.be.revertedWith("Issuer not registered");
    });

    it("Should verify a valid credential", async function () {
      await manager.connect(institution1).issueCredential(credentialHash);
      const [isValid] = await manager.verifyCredential(credentialHash);
      expect(isValid).to.be.true;
    });

    it("Should detect revoked credential", async function () {
      await manager.connect(institution1).issueCredential(credentialHash);
      await manager.connect(institution1).revokeCredential(credentialHash);
      
      const [isValid, , , isRevoked] = await manager.verifyCredential(credentialHash);
      expect(isValid).to.be.false; // isValid should be false if revoked
      expect(isRevoked).to.be.true;
    });

    it("Should only allow original issuer to revoke", async function () {
      await manager.connect(institution1).issueCredential(credentialHash);
      await registry.registerInstitution(institution2.address, "Other U", "other.edu");
      
      await expect(
        manager.connect(institution2).revokeCredential(credentialHash)
      ).to.be.revertedWith("Only issuer can revoke");
    });

    it("Should reject duplicate credential hash", async function () {
      await manager.connect(institution1).issueCredential(credentialHash);
      await expect(
        manager.connect(institution1).issueCredential(credentialHash)
      ).to.be.revertedWith("Credential already exists");
    });

    it("Should store merkle root", async function () {
      const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes("root123"));
      await expect(
        manager.connect(institution1).storeMerkleRoot(merkleRoot, 100)
      ).to.emit(manager, "BatchProcessed").withArgs(0, merkleRoot, institution1.address, 100);
    });

    it("CredentialIssued has 3 inputs and none is a string", async function () {
      const ev = manager.interface.getEvent("CredentialIssued");
      expect(ev.inputs.length).to.equal(3);
      ev.inputs.forEach(i => expect(i.type).to.not.equal("string"));
    });

    it("credentials() returns only issuer, issuedAt, isRevoked", async function () {
      await manager.connect(institution1).issueCredential(credentialHash);
      const c = await manager.credentials(credentialHash);
      expect(c.length).to.equal(3);
      expect(c.issuer).to.equal(institution1.address);
      expect(c.issuedAt).to.be.gt(0n);
      expect(c.isRevoked).to.be.false;
    });

    it("storeMerkleRoot stores root, issuer, count and increments batchId", async function () {
      const r1 = ethers.keccak256(ethers.toUtf8Bytes("r1"));
      const r2 = ethers.keccak256(ethers.toUtf8Bytes("r2"));
      await manager.connect(institution1).storeMerkleRoot(r1, 7);
      await expect(manager.connect(institution1).storeMerkleRoot(r2, 3))
        .to.emit(manager, "BatchProcessed").withArgs(1, r2, institution1.address, 3);
      const b = await manager.batches(0);
      expect(b.merkleRoot).to.equal(r1);
      expect(b.issuer).to.equal(institution1.address);
      expect(b.count).to.equal(7n);
      expect(await manager.getBatchCount()).to.equal(2n);
    });

    it("storeMerkleRoot rejects zero root, zero count and unregistered sender", async function () {
      const r = ethers.keccak256(ethers.toUtf8Bytes("r"));
      await expect(manager.connect(institution1).storeMerkleRoot(ethers.ZeroHash, 1)).to.be.revertedWith("Invalid root");
      await expect(manager.connect(institution1).storeMerkleRoot(r, 0)).to.be.revertedWith("Empty batch");
      await expect(manager.connect(institution2).storeMerkleRoot(r, 1)).to.be.revertedWith("Not a registered institution");
    });

    it("Credentials issued before validUntil stay valid after deregistration; later ones do not", async function () {
      const early = ethers.keccak256(ethers.toUtf8Bytes("early"));
      const late = ethers.keccak256(ethers.toUtf8Bytes("late"));
      await manager.connect(institution1).issueCredential(early);
      await time.increase(10);
      const leakTime = await time.latest(); // the key is considered compromised from here on
      await manager.connect(institution1).issueCredential(late);
      await registry.revokeInstitution(institution1.address, leakTime);

      expect((await manager.verifyCredential(early))[0]).to.be.true;
      const [lateValid, , , lateRevoked] = await manager.verifyCredential(late);
      expect(lateValid).to.be.false;
      expect(lateRevoked).to.be.false;
    });

    it("A deregistered issuer cannot revoke", async function () {
      await manager.connect(institution1).issueCredential(credentialHash);
      await registry.revokeInstitution(institution1.address, await time.latest());
      await expect(
        manager.connect(institution1).revokeCredential(credentialHash)
      ).to.be.revertedWith("Issuer not registered");
    });

    it("storeMerkleRoot rejects a count above uint32", async function () {
      const r = ethers.keccak256(ethers.toUtf8Bytes("r"));
      await expect(manager.connect(institution1).storeMerkleRoot(r, 2n ** 32n)).to.be.revertedWith("Batch too large");
    });

    it("commitment test vector matches", async function () {
      const c = "0x" + require("crypto").createHash("sha256").update("0".repeat(64) + "|S1|BTech|").digest("hex");
      expect(c).to.equal("0x2225df7e8e27bd1a06ead6224e43eecc4f02d8507b5a5f71aa31b7e695e22372");
    });
  });
});
