// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @title InstitutionRegistry — Binds institution identity to Ethereum address
/// @notice Prevents the forgery attack from Zonneveld et al. (2026)
/// by requiring institutions to register before issuing credentials
contract InstitutionRegistry {
    struct Institution {
        string name;
        string domain;
        uint256 registeredAt;
        bool isActive;
        uint64 validUntil; // set on deregistration: credentials issued before this time stay valid
    }

    address public admin;
    mapping(address => Institution) public institutions;
    address[] public registeredAddresses;

    event InstitutionRegistered(address indexed addr, string name, string domain);
    event InstitutionRevoked(address indexed addr, uint64 validUntil);

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
        require(instAddress != address(0), "Zero address");
        require(!institutions[instAddress].isActive, "Already registered");
        // A deregistered address is gone for good; an institution that lost its key registers a new address.
        require(institutions[instAddress].registeredAt == 0, "Address was registered before");
        require(bytes(name).length > 0, "Name required");
        require(bytes(domain).length > 0, "Domain required");

        institutions[instAddress] = Institution({
            name: name,
            domain: domain,
            registeredAt: block.timestamp,
            isActive: true,
            validUntil: 0
        });
        registeredAddresses.push(instAddress);

        emit InstitutionRegistered(instAddress, name, domain);
    }

    function isRegistered(address addr) external view returns (bool) {
        return institutions[addr].isActive;
    }

    /// @notice Deregister an institution. Credentials issued before `validUntil` stay valid; later ones do not.
    /// A closing university passes block.timestamp; one whose key leaked passes the time of the leak.
    function revokeInstitution(address addr, uint64 validUntil) external onlyAdmin {
        require(institutions[addr].isActive, "Not registered");
        require(validUntil <= block.timestamp, "validUntil in the future");
        institutions[addr].isActive = false;
        institutions[addr].validUntil = validUntil;
        emit InstitutionRevoked(addr, validUntil);
    }

    /// @notice Was `issuer` allowed to issue at time `issuedAt`?
    function issuedWhileAuthorized(address issuer, uint256 issuedAt) external view returns (bool) {
        Institution storage inst = institutions[issuer];
        return inst.isActive || issuedAt < inst.validUntil;
    }

    function getInstitutionCount() external view returns (uint256) {
        return registeredAddresses.length;
    }

    function getInstitutionAt(uint256 index) external view returns (address) {
        require(index < registeredAddresses.length, "Index out of bounds");
        return registeredAddresses[index];
    }
}
