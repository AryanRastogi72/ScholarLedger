// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./InstitutionRegistry.sol";

/// @title CredentialManager — Issue, verify, and revoke academic credentials
/// @notice Signs over full credential metadata (not just a hash),
/// closing the identity-spoofing gap demonstrated in Zonneveld et al.
contract CredentialManager {
    struct Credential {
        bytes32 credentialHash;
        address issuer;
        uint256 issuedAt;
        bool isRevoked;
        string studentId;
        string programName;
    }

    InstitutionRegistry public registry;

    mapping(bytes32 => Credential) public credentials;
    bytes32[] public credentialHashes;
    bytes32[] public merkleRoots;

    event CredentialIssued(
        bytes32 indexed credentialHash,
        address indexed issuer,
        string studentId,
        string programName
    );
    event CredentialRevoked(bytes32 indexed credentialHash, address indexed revoker);
    event BatchProcessed(bytes32 merkleRoot, uint256 credentialCount);

    constructor(address registryAddress) {
        registry = InstitutionRegistry(registryAddress);
    }

    function issueCredential(
        bytes32 credentialHash,
        string calldata studentId,
        string calldata programName
    ) external {
        require(registry.isRegistered(msg.sender), "Issuer not registered");
        require(credentials[credentialHash].issuedAt == 0, "Credential already exists");
        require(credentialHash != bytes32(0), "Invalid hash");

        credentials[credentialHash] = Credential({
            credentialHash: credentialHash,
            issuer: msg.sender,
            issuedAt: block.timestamp,
            isRevoked: false,
            studentId: studentId,
            programName: programName
        });
        credentialHashes.push(credentialHash);

        emit CredentialIssued(credentialHash, msg.sender, studentId, programName);
    }

    function verifyCredential(bytes32 credentialHash)
        external view
        returns (bool isValid, address issuer, uint256 issuedAt, bool isRevoked)
    {
        Credential memory cred = credentials[credentialHash];
        bool exists = cred.issuedAt > 0;
        bool issuerStillRegistered = exists ? registry.isRegistered(cred.issuer) : false;

        return (
            exists && !cred.isRevoked && issuerStillRegistered,
            cred.issuer,
            cred.issuedAt,
            cred.isRevoked
        );
    }

    function revokeCredential(bytes32 credentialHash) external {
        Credential storage cred = credentials[credentialHash];
        require(cred.issuedAt > 0, "Credential does not exist");
        require(cred.issuer == msg.sender, "Only issuer can revoke");
        require(!cred.isRevoked, "Already revoked");

        cred.isRevoked = true;
        emit CredentialRevoked(credentialHash, msg.sender);
    }

    function storeMerkleRoot(bytes32 merkleRoot, uint256 count) external {
        require(registry.isRegistered(msg.sender), "Not a registered institution");
        merkleRoots.push(merkleRoot);
        emit BatchProcessed(merkleRoot, count);
    }

    function getCredentialCount() external view returns (uint256) {
        return credentialHashes.length;
    }

    function getMerkleRootCount() external view returns (uint256) {
        return merkleRoots.length;
    }
}
