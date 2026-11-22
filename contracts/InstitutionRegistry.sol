// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/// @title InstitutionRegistry: binds institution identity to an Ethereum address
/// @notice Prevents the forgery attack from Zonneveld et al. (2026) by requiring institutions to register
/// before issuing credentials. Adding or removing an institution needs `threshold` of the fixed admins to approve.
contract InstitutionRegistry {
    struct Institution {
        string name;
        string domain;
        uint256 registeredAt;
        bool isActive;
        uint64 validUntil; // set on deregistration: credentials issued before this time stay valid
    }

    enum Kind { Register, Deregister }

    struct Proposal {
        Kind kind;
        address target;
        string name;       // Register only
        string domain;     // Register only
        uint64 validUntil; // Deregister only
        uint8 approvals;
        bool executed;
    }

    address[] public admins; // fixed at deployment; there is no way to change the set afterwards
    mapping(address => bool) public isAdmin;
    uint8 public immutable threshold;

    mapping(address => Institution) public institutions;
    address[] public registeredAddresses;
    Proposal[] public proposals;
    mapping(uint256 => mapping(address => bool)) public hasApproved;

    event InstitutionRegistered(address indexed addr, string name, string domain);
    event InstitutionRevoked(address indexed addr, uint64 validUntil);
    event ProposalCreated(uint256 indexed id, Kind kind, address indexed target, address indexed proposer);
    event ProposalApproved(uint256 indexed id, address indexed admin, uint8 approvals);

    modifier onlyAdmin() {
        require(isAdmin[msg.sender], "Not an admin");
        _;
    }

    constructor(address[] memory _admins, uint8 _threshold) {
        require(_threshold >= 1 && _threshold <= _admins.length, "Bad threshold");
        for (uint256 i = 0; i < _admins.length; i++) {
            address a = _admins[i];
            require(a != address(0), "Zero admin");
            require(!isAdmin[a], "Duplicate admin");
            isAdmin[a] = true;
        }
        admins = _admins;
        threshold = _threshold;
    }

    function proposeRegister(
        address instAddress,
        string calldata name,
        string calldata domain
    ) external onlyAdmin returns (uint256 id) {
        _checkRegister(instAddress, name, domain);
        id = _push(Kind.Register, instAddress, name, domain, 0);
    }

    function proposeDeregister(address addr, uint64 validUntil) external onlyAdmin returns (uint256 id) {
        _checkDeregister(addr, validUntil);
        id = _push(Kind.Deregister, addr, "", "", validUntil);
    }

    function approve(uint256 id) external onlyAdmin {
        _approve(id);
    }

    function _push(Kind kind, address target, string memory name, string memory domain, uint64 validUntil)
        internal returns (uint256 id)
    {
        id = proposals.length;
        proposals.push(Proposal(kind, target, name, domain, validUntil, 0, false));
        emit ProposalCreated(id, kind, target, msg.sender);
        _approve(id); // the proposer's own approval
    }

    function _approve(uint256 id) internal {
        require(id < proposals.length, "No such proposal");
        Proposal storage p = proposals[id];
        require(!p.executed, "Already executed");
        require(!hasApproved[id][msg.sender], "Already approved");
        hasApproved[id][msg.sender] = true;
        p.approvals += 1;
        emit ProposalApproved(id, msg.sender, p.approvals);
        if (p.approvals >= threshold) _execute(p);
    }

    // Conditions are checked again here: the state may have changed since the proposal was made.
    function _execute(Proposal storage p) internal {
        if (p.kind == Kind.Register) {
            _checkRegister(p.target, p.name, p.domain);
            institutions[p.target] = Institution({
                name: p.name,
                domain: p.domain,
                registeredAt: block.timestamp,
                isActive: true,
                validUntil: 0
            });
            registeredAddresses.push(p.target);
            emit InstitutionRegistered(p.target, p.name, p.domain);
        } else {
            _checkDeregister(p.target, p.validUntil);
            institutions[p.target].isActive = false;
            institutions[p.target].validUntil = p.validUntil;
            emit InstitutionRevoked(p.target, p.validUntil);
        }
        p.executed = true;
    }

    function _checkRegister(address instAddress, string memory name, string memory domain) internal view {
        require(instAddress != address(0), "Zero address");
        // Covers active and deregistered addresses: a deregistered address is gone for good, and an institution
        // that lost its key registers a new address.
        require(institutions[instAddress].registeredAt == 0, "Address was registered before");
        require(bytes(name).length > 0, "Name required");
        require(bytes(domain).length > 0, "Domain required");
    }

    function _checkDeregister(address addr, uint64 validUntil) internal view {
        require(institutions[addr].isActive, "Not registered");
        require(validUntil <= block.timestamp, "validUntil in the future");
    }

    function isRegistered(address addr) external view returns (bool) {
        return institutions[addr].isActive;
    }

    /// @notice Was `issuer` allowed to issue at time `issuedAt`?
    function issuedWhileAuthorized(address issuer, uint256 issuedAt) external view returns (bool) {
        Institution storage inst = institutions[issuer];
        return inst.isActive || issuedAt < inst.validUntil;
    }

    function getAdmins() external view returns (address[] memory) {
        return admins;
    }

    function getProposalCount() external view returns (uint256) {
        return proposals.length;
    }

    function getInstitutionCount() external view returns (uint256) {
        return registeredAddresses.length;
    }

    function getInstitutionAt(uint256 index) external view returns (address) {
        require(index < registeredAddresses.length, "Index out of bounds");
        return registeredAddresses[index];
    }
}
