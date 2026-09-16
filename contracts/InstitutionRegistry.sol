// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title InstitutionRegistry — Binds institution identity to Ethereum address
/// @notice Prevents the forgery attack from Zonneveld et al. (2026)
/// by requiring institutions to register before issuing credentials
contract InstitutionRegistry {
    struct Institution {
        string name;
        string domain;
        uint256 registeredAt;
        bool isActive;
    }

    address public admin;
    mapping(address => Institution) public institutions;
    address[] public registeredAddresses;

    event InstitutionRegistered(address indexed addr, string name, string domain);
    event InstitutionRevoked(address indexed addr);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function registerInstitution(
        address instAddress,
        string calldata name,
        string calldata domain
    ) external onlyAdmin {
        require(!institutions[instAddress].isActive, "Already registered");
        require(bytes(name).length > 0, "Name required");

        institutions[instAddress] = Institution({
            name: name,
            domain: domain,
            registeredAt: block.timestamp,
            isActive: true
        });
        registeredAddresses.push(instAddress);

        emit InstitutionRegistered(instAddress, name, domain);
    }

    function isRegistered(address addr) external view returns (bool) {
        return institutions[addr].isActive;
    }

    function revokeInstitution(address addr) external onlyAdmin {
        require(institutions[addr].isActive, "Not registered");
        institutions[addr].isActive = false;
        emit InstitutionRevoked(addr);
    }

    function getInstitutionCount() external view returns (uint256) {
        return registeredAddresses.length;
    }

    function getInstitutionAt(uint256 index) external view returns (address) {
        require(index < registeredAddresses.length, "Index out of bounds");
        return registeredAddresses[index];
    }
}
