export const GUEST_STATUSES = ['pending', 'approved', 'denied'] as const;
export type GuestStatus = (typeof GUEST_STATUSES)[number];

export const GUEST_PURPOSES = [
  'Guest',
  'Delivery',
  'Family',
  'Cab / Ride',
  'Maintenance',
  'Other',
] as const;

export function isGuestStatus(value: string): value is GuestStatus {
  return (GUEST_STATUSES as readonly string[]).includes(value);
}
