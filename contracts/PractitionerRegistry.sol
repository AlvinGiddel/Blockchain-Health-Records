// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PractitionerRegistry
 * @dev Unified on-chain attestation registry for Kenyan healthcare practitioners
 * Supports multiple statutory regulators:
 *  - KMPDC (Kenya Medical Practitioners and Dentists Council) - Doctors & Dentists
 *  - NCK (Nursing Council of Kenya) - Registered Nurses & Midwives
 */
contract PractitionerRegistry {
    address public immutable owner;

    enum Regulator { KMPDC, NCK }
    enum Cadre { Doctor, Dentist, Nurse, Midwife }

    struct PractitionerAttestation {
        string regulator;          // "KMPDC" or "NCK"
        string cadre;              // "doctor", "dentist", "nurse", "midwife"
        bytes32 licenseHash;       // sha256(regulator, licenseNumber)
        address practitionerAddress;
        uint256 verifiedAt;
        uint256 expiryDate;
        bool isValid;
    }

    // Mapping from licenseHash to attestation record
    mapping(bytes32 => PractitionerAttestation) public attestations;
    // Mapping from practitioner address to list of attestation hashes
    mapping(address => bytes32[]) public practitionerAttestations;

    event PractitionerAttested(
        bytes32 indexed licenseHash,
        string regulator,
        string cadre,
        address indexed practitionerAddress,
        uint256 verifiedAt,
        uint256 expiryDate
    );

    event AttestationRevoked(bytes32 indexed licenseHash, string reason);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only registry authority can attest");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Register or update an attestation from an off-chain oracle verification
     */
    function attestPractitioner(
        string calldata regulator,
        string calldata cadre,
        bytes32 licenseHash,
        address practitionerAddress,
        uint256 expiryDate
    ) external onlyOwner {
        require(licenseHash != bytes32(0), "Invalid license hash");
        require(practitionerAddress != address(0), "Invalid practitioner address");

        attestations[licenseHash] = PractitionerAttestation({
            regulator: regulator,
            cadre: cadre,
            licenseHash: licenseHash,
            practitionerAddress: practitionerAddress,
            verifiedAt: block.timestamp,
            expiryDate: expiryDate,
            isValid: true
        });

        practitionerAttestations[practitionerAddress].push(licenseHash);

        emit PractitionerAttested(
            licenseHash,
            regulator,
            cadre,
            practitionerAddress,
            block.timestamp,
            expiryDate
        );
    }

    /**
     * @dev Revoke an attestation (e.g. if board suspends practitioner license)
     */
    function revokeAttestation(bytes32 licenseHash, string calldata reason) external onlyOwner {
        require(attestations[licenseHash].isValid, "Attestation not found or already revoked");
        attestations[licenseHash].isValid = false;
        emit AttestationRevoked(licenseHash, reason);
    }

    /**
     * @dev Check whether a practitioner holds an active, valid attestation
     */
    function isPractitionerValid(bytes32 licenseHash) external view returns (bool) {
        PractitionerAttestation memory att = attestations[licenseHash];
        if (!att.isValid) return false;
        if (att.expiryDate > 0 && block.timestamp > att.expiryDate) return false;
        return true;
    }
}
