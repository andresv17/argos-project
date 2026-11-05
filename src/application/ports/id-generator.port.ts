/**
 * Entropy-isolating IdGeneratorPort interface for the Application Layer.
 * Prohibits direct usage of global random or UUID generators in Domain and Application [INV-ARCH-002].
 *
 * @implements INV-ARCH-002, INV-ARCH-004, REQ-PET-001, REQ-REC-001, REQ-REC-002, REQ-REC-003, REQ-REC-004, REQ-REC-005, REQ-REC-006
 */

export interface IdGeneratorPort {
  /**
   * Generates the next valid UUID v4 identifier.
   */
  nextId(): string;
}
