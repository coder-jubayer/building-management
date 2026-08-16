export const AMENITY_IDS = [
  'guest_parking',
  'swimming_pool',
  'community_hall',
  'table_tennis',
  'billiard_room',
] as const;

export type AmenityId = (typeof AMENITY_IDS)[number];

export interface AmenityDefinition {
  id: AmenityId;
  name: string;
  icon: string;
  color: string;
  openHour: number;
  closeHour: number;
  slotMinutes: number;
  capacity: number;
}

export const AMENITIES: AmenityDefinition[] = [
  {
    id: 'guest_parking',
    name: 'Guest Parking',
    icon: 'car-sport',
    color: '#F59E0B',
    openHour: 6,
    closeHour: 22,
    slotMinutes: 60,
    capacity: 4,
  },
  {
    id: 'swimming_pool',
    name: 'Swimming Pool',
    icon: 'water',
    color: '#3B82F6',
    openHour: 6,
    closeHour: 21,
    slotMinutes: 60,
    capacity: 1,
  },
  {
    id: 'community_hall',
    name: 'Community Hall',
    icon: 'balloon',
    color: '#D946EF',
    openHour: 9,
    closeHour: 22,
    slotMinutes: 60,
    capacity: 1,
  },
  {
    id: 'table_tennis',
    name: 'Table Tennis',
    icon: 'tennisball',
    color: '#10B981',
    openHour: 8,
    closeHour: 22,
    slotMinutes: 60,
    capacity: 1,
  },
  {
    id: 'billiard_room',
    name: 'Billiard Room',
    icon: 'ellipse',
    color: '#6366F1',
    openHour: 10,
    closeHour: 22,
    slotMinutes: 60,
    capacity: 1,
  },
];

const AMENITY_MAP = new Map(AMENITIES.map((item) => [item.id, item]));

export function getAmenity(id: string): AmenityDefinition | undefined {
  return AMENITY_MAP.get(id as AmenityId);
}

export function isAmenityId(id: string): id is AmenityId {
  return AMENITY_MAP.has(id as AmenityId);
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function minutesToTime(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function todayKey(): string {
  return formatDateKey(new Date());
}

export function slotStartDate(date: string, startTime: string): Date | null {
  const parsed = parseDateKey(date);
  if (!parsed) return null;
  const minutes = timeToMinutes(startTime);
  if (!Number.isFinite(minutes)) return null;
  parsed.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return parsed;
}

export function isPastSlot(date: string, startTime: string): boolean {
  const start = slotStartDate(date, startTime);
  return !start || start.getTime() <= Date.now();
}

export interface GeneratedSlot {
  startTime: string;
  endTime: string;
}

export function generateSlots(amenity: AmenityDefinition): GeneratedSlot[] {
  const slots: GeneratedSlot[] = [];
  const start = amenity.openHour * 60;
  const end = amenity.closeHour * 60;
  for (let minutes = start; minutes + amenity.slotMinutes <= end; minutes += amenity.slotMinutes) {
    slots.push({
      startTime: minutesToTime(minutes),
      endTime: minutesToTime(minutes + amenity.slotMinutes),
    });
  }
  return slots;
}

export function matchingSlot(amenity: AmenityDefinition, startTime: string): GeneratedSlot | undefined {
  return generateSlots(amenity).find((slot) => slot.startTime === startTime);
}

export function upcomingDateKeys(days = 7): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return formatDateKey(date);
  });
}

export function dateLabel(date: string): string {
  const parsed = parseDateKey(date);
  if (!parsed) return date;
  if (date === todayKey()) return 'Today';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (date === formatDateKey(tomorrow)) return 'Tomorrow';
  return parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function weekdayLabel(date: string): string {
  const parsed = parseDateKey(date);
  if (!parsed) return '';
  if (date === todayKey()) return 'Today';
  return parsed.toLocaleDateString('en-US', { weekday: 'short' });
}

export function dayNumber(date: string): string {
  const parsed = parseDateKey(date);
  return parsed ? String(parsed.getDate()) : date;
}
