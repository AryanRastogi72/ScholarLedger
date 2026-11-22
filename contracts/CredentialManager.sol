// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "./InstitutionRegistry.sol";

/// @title CredentialManager: issue, verify, and revoke academic credentials
/// @notice Stores only a salted commitment per credential. No student data is on chain.
contract CredentialManager {
    struct Credential {
        address issuer;
        uint64 issuedAt;
        bool isRevoked;
    }

    struct Batch {
        bytes32 merkleRoot;
        address issuer;
        uint32 count;
        uint64 timestamp;
    }

    InstitutionRegistry public immutable registry;

    mapping(bytes32 => Credential) public credentials;
    uint256 public credentialCount;
    Batch[] public batches;

    event CredentialIssued(bytes32 indexed commitment, address indexed issuer, uint256 issuedAt);
    event CredentialRevoked(bytes32 indexed commitment, address indexed revoker);
    event BatchProcessed(uint256 indexed batchId, bytes32 merkleRoot, address indexed issuer, uint256 count);

    constructor(address registryAddress) {
        registry = InstitutionRegistry(registryAddress);
    }

    function issueCredential(bytes32 commitment) external {
        require(registry.isRegistered(msg.sender), "Issuer not registered");
        require(credentials[commitment].issuedAt == 0, "Credential already exists");
        require(commitment != bytes32(0), "Invalid hash");

        credentials[commitment] = Credential({
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            isRevoked: false
        });
        credentialCount++;

        emit CredentialIssued(commitment, msg.sender, block.timestamp);
    }

    function verifyCredential(bytes32 commitment)
        external view
        returns (bool isValid, address issuer, uint256 issuedAt, bool isRevoked)
    {
        Credential memory cred = credentials[commitment];
        bool exists = cred.issuedAt > 0;
        bool issuerAuthorized = exists && registry.issuedWhileAuthorized(cred.issuer, cred.issuedAt);

        return (
            exists && !cred.isRevoked && issuerAuthorized,
            cred.issuer,
            cred.issuedAt,
            cred.isRevoked
        );
    }

    function revokeCredential(bytes32 commitment) external {
        require(registry.isRegistered(msg.sender), "Issuer not registered");
        Credential storage cred = credentials[commitment];
        require(cred.issuedAt > 0, "Credential does not exist");
        require(cred.issuer == msg.sender, "Only issuer can revoke");
        require(!cred.isRevoked, "Already revoked");

        cred.isRevoked = true;
        emit CredentialRevoked(commitment, msg.sender);
    }

    function storeMerkleRoot(bytes32 root, uint256 count) external returns (uint256 batchId) {
        require(registry.isRegistered(msg.sender), "Not a registered institution");
        require(root != bytes32(0), "Invalid root");
        require(count > 0, "Empty batch");
        require(count <= type(uint32).max, "Batch too large");

        batchId = batches.length;
        batches.push(Batch({
            merkleRoot: root,
            issuer: msg.sender,
            count: uint32(count),
            timestamp: uint64(block.timestamp)
        }));
        emit BatchProcessed(batchId, root, msg.sender, count);
    }

    function getCredentialCount() external view returns (uint256) {
        return credentialCount;
    }

    function getBatchCount() external view returns (uint256) {
        return batches.length;
    }
}
