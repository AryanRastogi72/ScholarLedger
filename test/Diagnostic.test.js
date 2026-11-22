// Diagnostic matrix: every external function, its good path and every revert string.
// ScholarLedger.test.js holds the scenario tests; this file is the systematic checklist (see docs/DIAGNOSTIC.md).
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Diagnostic matrix", function () {
  let registry, manager, a, b, c, inst, inst2, outsider;
  const h = (s) => ethers.keccak256(ethers.toUtf8Bytes(s));

  beforeEach(async function () {
    [a, b, c, inst, inst2, outsider] = await ethers.getSigners();
    registry = await (await ethers.getContractFactory("InstitutionRegistry")).deploy([a.address, b.address, c.address], 2);
    manager = await (await ethers.getContractFactory("CredentialManager")).deploy(await registry.getAddress());
  });
  const register = async (who, name = "U", domain = "u.edu") => {
    await registry.connect(a).proposeRegister(who.address, name, domain);
    await registry.connect(b).approve((await registry.getProposalCount()) - 1n);
  };
  const deregister = async (who, cutoff) => {
    await registry.connect(a).proposeDeregister(who.address, cutoff);
    await registry.connect(b).approve((await registry.getProposalCount()) - 1n);
  };

  describe("InstitutionRegistry", function () {
    it("constructor: reverts and stored state", async function () {
      const F = await ethers.getContractFactory("InstitutionRegistry");
      await expect(F.deploy([a.address], 0)).to.be.revertedWith("Bad threshold");
      await expect(F.deploy([a.address], 2)).to.be.revertedWith("Bad threshold");
      await expect(F.deploy([a.address, ethers.ZeroAddress], 1)).to.be.revertedWith("Zero admin");
      await expect(F.deploy([a.address, a.address], 1)).to.be.revertedWith("Duplicate admin");
      expect(await registry.threshold()).to.equal(2n);
      expect(await registry.admins(1)).to.equal(b.address);
      expect(await registry.isAdmin(c.address)).to.be.true;
    });

    it("proposeRegister: every revert", async function () {
      await expect(registry.connect(outsider).proposeRegister(inst.address, "U", "u.edu")).to.be.revertedWith("Not an admin");
      await expect(registry.proposeRegister(ethers.ZeroAddress, "U", "u.edu")).to.be.revertedWith("Zero address");
      await expect(registry.proposeRegister(inst.address, "", "u.edu")).to.be.revertedWith("Name required");
      await expect(registry.proposeRegister(inst.address, "U", "")).to.be.revertedWith("Domain required");
      await register(inst);
      await expect(registry.proposeRegister(inst.address, "U", "u.edu")).to.be.revertedWith("Address was registered before");
    });

    it("proposeDeregister: every revert", async function () {
      const now = await time.latest();
      await expect(registry.connect(outsider).proposeDeregister(inst.address, now)).to.be.revertedWith("Not an admin");
      await expect(registry.proposeDeregister(inst.address, now)).to.be.revertedWith("Not registered");
      await register(inst);
      await expect(registry.proposeDeregister(inst.address, now + 1000)).to.be.revertedWith("validUntil in the future");
      await expect(registry.proposeDeregister(inst.address, 0)).to.be.revertedWith("Cutoff before registration");
    });

    it("approve: every revert, events, and the proposal fields", async function () {
      await expect(registry.connect(outsider).approve(0)).to.be.revertedWith("Not an admin");
      await expect(registry.approve(0)).to.be.revertedWith("No such proposal");
      await expect(registry.connect(a).proposeRegister(inst.address, "U", "u.edu"))
        .to.emit(registry, "ProposalCreated").withArgs(0, 0, inst.address, a.address)
        .and.to.emit(registry, "ProposalApproved").withArgs(0, a.address, 1);
      const p = await registry.proposals(0);
      expect([p.kind, p.target, p.name, p.domain, p.approvals, p.executed]).to.deep.equal([0n, inst.address, "U", "u.edu", 1n, false]);
      await expect(registry.connect(a).approve(0)).to.be.revertedWith("Already approved");
      expect(await registry.hasApproved(0, a.address)).to.be.true;
      expect(await registry.hasApproved(0, b.address)).to.be.false;
      await registry.connect(b).approve(0);
      await expect(registry.connect(c).approve(0)).to.be.revertedWith("Already executed");
    });

    it("execution re-checks the conditions", async function () {
      await registry.connect(a).proposeDeregister(inst.address, 0).catch(() => {}); // not registered yet: reverts at proposal time
      await register(inst);
      const now = await time.latest();
      await registry.connect(a).proposeDeregister(inst.address, now); // id 1
      await registry.connect(b).proposeDeregister(inst.address, now); // id 2
      await registry.connect(c).approve(1); // executes: inactive now
      await expect(registry.connect(c).approve(2)).to.be.revertedWith("Not registered");
    });

    it("issuedWhileAuthorized: before, at and after the cutoff; unknown and active issuers", async function () {
      await register(inst);
      expect(await registry.issuedWhileAuthorized(inst.address, 1)).to.be.true; // active: always
      const cutoff = await time.latest();
      await deregister(inst, cutoff);
      expect(await registry.issuedWhileAuthorized(inst.address, cutoff - 1)).to.be.true;
      expect(await registry.issuedWhileAuthorized(inst.address, cutoff)).to.be.true;
      expect(await registry.issuedWhileAuthorized(inst.address, cutoff + 1)).to.be.false;
      expect(await registry.issuedWhileAuthorized(outsider.address, 1)).to.be.false; // never registered
    });

    it("getters", async function () {
      expect(await registry.getAdmins()).to.deep.equal([a.address, b.address, c.address]);
      expect(await registry.getProposalCount()).to.equal(0n);
      expect(await registry.getInstitutionCount()).to.equal(0n);
      await expect(registry.getInstitutionAt(0)).to.be.revertedWith("Index out of bounds");
      await register(inst, "State U", "state.edu");
      expect(await registry.getProposalCount()).to.equal(1n);
      expect(await registry.getInstitutionCount()).to.equal(1n);
      expect(await registry.getInstitutionAt(0)).to.equal(inst.address);
      const i = await registry.institutions(inst.address);
      expect([i.name, i.domain, i.isActive, i.validUntil]).to.deep.equal(["State U", "state.edu", true, 0n]);
      expect(await registry.isRegistered(inst.address)).to.be.true;
      expect(await registry.isRegistered(outsider.address)).to.be.false;
    });

    it("InstitutionRevoked carries the cutoff", async function () {
      await register(inst);
      const cutoff = await time.latest();
      await registry.connect(a).proposeDeregister(inst.address, cutoff);
      await expect(registry.connect(b).approve(1)).to.emit(registry, "InstitutionRevoked").withArgs(inst.address, cutoff);
    });
  });

  describe("CredentialManager", function () {
    beforeEach(async function () { await register(inst); });

    it("issueCredential: good path and every revert", async function () {
      await expect(manager.connect(outsider).issueCredential(h("x"))).to.be.revertedWith("Issuer not registered");
      await expect(manager.connect(inst).issueCredential(ethers.ZeroHash)).to.be.revertedWith("Invalid hash");
      await expect(manager.connect(inst).issueCredential(h("x")))
        .to.emit(manager, "CredentialIssued");
      await expect(manager.connect(inst).issueCredential(h("x"))).to.be.revertedWith("Credential already exists");
      expect(await manager.getCredentialCount()).to.equal(1n);
      expect(await manager.credentialCount()).to.equal(1n);
    });

    it("verifyCredential: unknown, valid, revoked, deregistered before and after the cutoff", async function () {
      expect(await manager.verifyCredential(h("none"))).to.deep.equal([false, ethers.ZeroAddress, 0n, false]);

      await manager.connect(inst).issueCredential(h("early"));
      const early = (await manager.credentials(h("early"))).issuedAt;
      await time.increase(5);
      const cutoff = await time.latest();
      await manager.connect(inst).issueCredential(h("late")); // issued after the cutoff
      expect((await manager.verifyCredential(h("early")))[0]).to.be.true;

      await manager.connect(inst).issueCredential(h("revoked"));
      await manager.connect(inst).revokeCredential(h("revoked"));
      const rv = await manager.verifyCredential(h("revoked"));
      expect([rv[0], rv[3]]).to.deep.equal([false, true]);

      await deregister(inst, cutoff);
      const e = await manager.verifyCredential(h("early"));
      expect([e[0], e[1], e[2]]).to.deep.equal([true, inst.address, early]);
      const l = await manager.verifyCredential(h("late"));
      expect([l[0], l[3]]).to.deep.equal([false, false]);
    });

    it("revokeCredential: good path and every revert", async function () {
      await manager.connect(inst).issueCredential(h("r"));
      await expect(manager.connect(outsider).revokeCredential(h("r"))).to.be.revertedWith("Issuer not registered");
      await expect(manager.connect(inst).revokeCredential(h("none"))).to.be.revertedWith("Credential does not exist");
      await register(inst2, "Other", "other.edu");
      await expect(manager.connect(inst2).revokeCredential(h("r"))).to.be.revertedWith("Only issuer can revoke");
      await expect(manager.connect(inst).revokeCredential(h("r")))
        .to.emit(manager, "CredentialRevoked").withArgs(h("r"), inst.address);
      await expect(manager.connect(inst).revokeCredential(h("r"))).to.be.revertedWith("Already revoked");
    });

    it("storeMerkleRoot: good path, getters and every revert", async function () {
      await expect(manager.connect(outsider).storeMerkleRoot(h("r"), 1)).to.be.revertedWith("Not a registered institution");
      await expect(manager.connect(inst).storeMerkleRoot(ethers.ZeroHash, 1)).to.be.revertedWith("Invalid root");
      await expect(manager.connect(inst).storeMerkleRoot(h("r"), 0)).to.be.revertedWith("Empty batch");
      await expect(manager.connect(inst).storeMerkleRoot(h("r"), 2n ** 32n)).to.be.revertedWith("Batch too large");
      await manager.connect(inst).storeMerkleRoot(h("r"), 2n ** 32n - 1n); // the largest allowed count
      expect(await manager.getBatchCount()).to.equal(1n);
      const batch = await manager.batches(0);
      expect([batch.merkleRoot, batch.issuer, batch.count]).to.deep.equal([h("r"), inst.address, 2n ** 32n - 1n]);
    });

    it("registry is wired in and immutable", async function () {
      expect(await manager.registry()).to.equal(await registry.getAddress());
    });
  });
});
