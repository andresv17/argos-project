/**
 * Entropy-isolating ClockPort interface for the Application Layer.
 * Prohibits direct usage of global clock calls in Domain and Application [INV-ARCH-001].
 *
 * @implements INV-ARCH-001, INV-ARCH-004, REQ-PET-001, REQ-PET-002, REQ-PET-003, REQ-BACKUP-001, REQ-BACKUP-002
 */

export interface ClockPort {
  /**
   * Returns current local/system calendar date in ISO-8601 format (YYYY-MM-DD).
   */
  todayIsoDate(): string;

  /**
   * Returns current UTC timestamp in ISO-8601 format (YYYY-MM-DDTHH:mm:ss.sssZ).
   */
  nowIsoTimestamp(): string;
}
