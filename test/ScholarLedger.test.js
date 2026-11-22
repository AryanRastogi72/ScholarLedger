const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ScholarLedger Contracts", function () {
  let InstitutionRegistry, registry, CredentialManager, manager;
  let admin, institution1, institution2, adminB, adminC, outsider;
  let register, deregister;

  beforeEach(async function () {
    [admin, institution1, institution2, adminB, adminC, outsider] = await ethers.getSigners();

    InstitutionRegistry = await ethers.getContractFactory("InstitutionRegistry");
    registry = await InstitutionRegistry.deploy([admin.address, adminB.address, adminC.address], 2);
    await registry.waitForDeployment();

    // Admin A proposes, admin B approves: the 2-of-3 threshold is met and the change executes.
    register = async (addr, name, domain) => {
      await registry.connect(admin).proposeRegister(addr, name, domain);
      await registry.connect(adminB).approve((await registry.getProposalCount()) - 1n);
    };
    deregister = async (addr, validUntil) => {
      await registry.connect(admin).proposeDeregister(addr, validUntil);
      await registry.connect(adminB).approve((await registry.getProposalCount()) - 1n);
    };

    CredentialManager = await ethers.getContractFactory("CredentialManager");
    manager = await CredentialManager.deploy(await registry.getAddress());
    await manager.waitForDeployment();
  });

  describe("InstitutionRegistry", function () {
    it("Should set the admins and threshold on deployment", async function () {
      expect(await registry.getAdmins()).to.deep.equal([admin.address, adminB.address, adminC.address]);
      expect(await registry.threshold()).to.equal(2n);
      expect(await registry.isAdmin(adminC.address)).to.be.true;
      expect(await registry.isAdmin(outsider.address)).to.be.false;
    });

    it("Should register an institution", async function () {
      await register(institution1.address, "State University", "state.edu");
      expect(await registry.isRegistered(institution1.address)).to.be.true;
    });

    it("Should reject duplicate registration", async function () {
      await register(institution1.address, "State University", "state.edu");
      await expect(
        registry.proposeRegister(institution1.address, "State University", "state.edu")
      ).to.be.revertedWith("Address was registered before");
    });

    it("Should reject a proposal from a non-admin", async function () {
      await expect(
        registry.connect(institution1).proposeRegister(institution2.address, "Tech Institute", "tech.edu")
      ).to.be.revertedWith("Not an admin");
    });

    it("Should check isRegistered", async function () {
      expect(await registry.isRegistered(institution1.address)).to.be.false;
      await register(institution1.address, "State University", "state.edu");
      expect(await registry.isRegistered(institution1.address)).to.be.true;
    });

    it("Should revoke an institution", async function () {
      await register(institution1.address, "State University", "state.edu");
      await deregister(institution1.address, await time.latest());
      expect(await registry.isRegistered(institution1.address)).to.be.false;
    });

    it("Should reject the zero address and an empty domain", async function () {
      await expect(registry.proposeRegister(ethers.ZeroAddress, "X", "x.edu")).to.be.revertedWith("Zero address");
      await expect(registry.proposeRegister(institution1.address, "X", "")).to.be.revertedWith("Domain required");
    });

    it("Should never let a deregistered address register again", async function () {
      await register(institution1.address, "State University", "state.edu");
      await deregister(institution1.address, await time.latest());
      await expect(
        registry.proposeRegister(institution1.address, "State University", "state.edu")
      ).to.be.revertedWith("Address was registered before");
    });

    it("Should reject a validUntil in the future", async function () {
      await register(institution1.address, "State University", "state.edu");
      await expect(
        registry.proposeDeregister(institution1.address, (await time.latest()) + 1000)
      ).to.be.revertedWith("validUntil in the future");
    });
  });

  describe("Multi-admin approval", function () {
    const deployRegistry = (admins, threshold) =>
      ethers.getContractFactory("InstitutionRegistry").then((f) => f.deploy(admins, threshold));

    it("The constructor rejects a bad threshold, a zero admin and a duplicate admin", async function () {
      const a = [admin.address, adminB.address, adminC.address];
      await expect(deployRegistry(a, 0)).to.be.revertedWith("Bad threshold");
      await expect(deployRegistry(a, 4)).to.be.revertedWith("Bad threshold");
      await expect(deployRegistry([admin.address, ethers.ZeroAddress], 1)).to.be.revertedWith("Zero admin");
      await expect(deployRegistry([admin.address, admin.address], 1)).to.be.revertedWith("Duplicate admin");
    });

    it("A non-admin cannot propose or approve", async function () {
      await expect(registry.connect(outsider).proposeRegister(institution1.address, "S", "s.edu")).to.be.revertedWith("Not an admin");
      await expect(registry.connect(outsider).proposeDeregister(institution1.address, 0)).to.be.revertedWith("Not an admin");
      await registry.connect(admin).proposeRegister(institution1.address, "S", "s.edu");
      await expect(registry.connect(outsider).approve(0)).to.be.revertedWith("Not an admin");
    });

    it("Registers only after the second approval, which emits InstitutionRegistered", async function () {
      await registry.connect(admin).proposeRegister(institution1.address, "State University", "state.edu");
      expect(await registry.isRegistered(institution1.address)).to.be.false;
      expect((await registry.proposals(0)).approvals).to.equal(1n);
      await expect(registry.connect(adminC).approve(0))
        .to.emit(registry, "InstitutionRegistered").withArgs(institution1.address, "State University", "state.edu");
      expect(await registry.isRegistered(institution1.address)).to.be.true;
      expect((await registry.proposals(0)).executed).to.be.true;
    });

    it("The same admin cannot approve twice, and an executed proposal cannot be approved", async function () {
      await registry.connect(admin).proposeRegister(institution1.address, "S", "s.edu");
      await expect(registry.connect(admin).approve(0)).to.be.revertedWith("Already approved");
      await registry.connect(adminB).approve(0);
      await expect(registry.connect(adminC).approve(0)).to.be.revertedWith("Already executed");
      await expect(registry.connect(adminC).approve(99)).to.be.revertedWith("No such proposal");
    });

    it("Two proposals for one address: the second fails when it would execute", async function () {
      await registry.connect(admin).proposeRegister(institution1.address, "First", "first.edu");
      await registry.connect(adminB).proposeRegister(institution1.address, "Second", "second.edu");
      await registry.connect(adminC).approve(0); // first executes
      await expect(registry.connect(adminC).approve(1)).to.be.revertedWith("Address was registered before");
      expect((await registry.institutions(institution1.address)).name).to.equal("First");
    });

    it("A deregister proposal executes on the second approval and keeps the cutoff behaviour", async function () {
      await register(institution1.address, "State University", "state.edu");
      const manager2 = await (await ethers.getContractFactory("CredentialManager")).deploy(await registry.getAddress());
      const early = ethers.keccak256(ethers.toUtf8Bytes("early2"));
      await manager2.connect(institution1).issueCredential(early);
      await time.increase(10);
      const cutoff = await time.latest();
      await registry.connect(admin).proposeDeregister(institution1.address, cutoff);
      expect(await registry.isRegistered(institution1.address)).to.be.true;
      await registry.connect(adminC).approve((await registry.getProposalCount()) - 1n);
      expect(await registry.isRegistered(institution1.address)).to.be.false;
      expect((await manager2.verifyCredential(early))[0]).to.be.true;
    });

    it("With threshold 1 a proposal executes immediately", async function () {
      const solo = await deployRegistry([admin.address], 1);
      await solo.connect(admin).proposeRegister(institution1.address, "Solo U", "solo.edu");
      expect(await solo.isRegistered(institution1.address)).to.be.true;
    });
  });

  describe("CredentialManager", function () {
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes("credential123"));

    beforeEach(async function () {
      await register(institution1.address, "State University", "state.edu");
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
      await register(institution2.address, "Other U", "other.edu");
      
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
      await deregister(institution1.address, leakTime);

      expect((await manager.verifyCredential(early))[0]).to.be.true;
      const [lateValid, , , lateRevoked] = await manager.verifyCredential(late);
      expect(lateValid).to.be.false;
      expect(lateRevoked).to.be.false;
    });

    it("A deregistered issuer cannot revoke", async function () {
      await manager.connect(institution1).issueCredential(credentialHash);
      await deregister(institution1.address, await time.latest());
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
