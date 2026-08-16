export type UserRole =
  | 'app_admin'
  | 'building_admin'
  | 'committee'
  | 'guard'
  | 'resident';

export const ROLE_LABELS: Record<UserRole, string> = {
  app_admin: 'App Admin',
  building_admin: 'Building Admin',
  committee: 'Committee',
  guard: 'Security Guard',
  resident: 'Resident',
};

export function isAppAdmin(role?: UserRole | null): boolean {
  return role === 'app_admin';
}

export function isBuildingAdmin(role?: UserRole | null): boolean {
  return role === 'building_admin';
}

export function canManageUsers(role?: UserRole | null): boolean {
  return isAppAdmin(role) || isBuildingAdmin(role);
}

export function canPostNotices(role?: UserRole | null): boolean {
  return role === 'committee' || isBuildingAdmin(role) || isAppAdmin(role);
}

export function canManageExpenses(role?: UserRole | null): boolean {
  return role === 'committee' || isBuildingAdmin(role) || isAppAdmin(role);
}

export function canManageDirectory(role?: UserRole | null): boolean {
  return role === 'committee' || isBuildingAdmin(role) || isAppAdmin(role);
}

export function canCreateListing(role?: UserRole | null): boolean {
  return role === 'resident' || role === 'committee' || isBuildingAdmin(role) || isAppAdmin(role);
}

export function canManageElections(role?: UserRole | null): boolean {
  return role === 'committee' || isBuildingAdmin(role) || isAppAdmin(role);
}

export function canCastVote(role?: UserRole | null): boolean {
  return role === 'resident';
}

export function canCreateComplaint(role?: UserRole | null): boolean {
  return role === 'resident' || role === 'committee' || isBuildingAdmin(role) || isAppAdmin(role);
}

export function canManageComplaints(role?: UserRole | null): boolean {
  return role === 'committee' || isBuildingAdmin(role) || isAppAdmin(role);
}

export function canBookAmenities(role?: UserRole | null): boolean {
  return role === 'resident' || role === 'committee' || isBuildingAdmin(role) || isAppAdmin(role);
}

export function canManageAmenityBookings(role?: UserRole | null): boolean {
  return isBuildingAdmin(role) || isAppAdmin(role);
}

export function canCreateGuestVisits(role?: UserRole | null): boolean {
  return role === 'guard' || isBuildingAdmin(role) || isAppAdmin(role);
}

export function canDecideGuestVisits(role?: UserRole | null): boolean {
  return role === 'resident';
}

export function isResident(role?: UserRole | null): boolean {
  return role === 'resident';
}

export function canMutateUser(actorId?: string, actorRole?: UserRole | null, target?: User | null): boolean {
  if (!actorId || !actorRole || !target) return false;
  if (target.id === actorId) return false;
  if (isAppAdmin(actorRole)) return true;
  if (isBuildingAdmin(actorRole)) {
    return target.role === 'committee' || target.role === 'guard' || target.role === 'resident';
  }
  return false;
}

export interface Building {
  id: string;
  name: string;
  isActive?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: UserRole;
  unitNumber?: string;
  buildingId?: string;
  buildingName?: string;
  isActive?: boolean;
  createdAt?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

export interface HealthCheckResponse {
  success: boolean;
  status: string;
  timestamp: string;
  environment: string;
  database: string;
  version: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface UsersListResponse {
  users: User[];
  roles: { value: UserRole; label: string }[];
  buildings?: Building[];
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  author: string;
  date: string;
  createdAt?: string;
  buildingId?: string;
  isNew?: boolean;
  unread?: boolean;
}

export interface NoticesListResponse {
  notices: Notice[];
  canPost: boolean;
  unreadCount?: number;
  buildings?: Building[];
}

export type ExpenseCategory = string;

export interface ExpenseCategoryOption {
  value: ExpenseCategory;
  label: string;
  color: string;
  custom?: boolean;
}

export interface ExpenseItem {
  id: string;
  year: number;
  month: number;
  buildingId: string;
  category: ExpenseCategory;
  categoryLabel: string;
  color: string;
  amount: number;
  note?: string;
  addedByName: string;
  createdAt: string;
}

export interface ExpenseBreakdown {
  category: ExpenseCategory;
  label: string;
  color: string;
  amount: number;
  percent: number;
}

export interface ExpensesMonthResponse {
  year: number;
  month: number;
  monthLabel: string;
  total: number;
  canManage: boolean;
  categories: ExpenseCategoryOption[];
  breakdown: ExpenseBreakdown[];
  expenses: ExpenseItem[];
  buildings?: Building[];
}

export type DirectoryType = string;

export interface DirectoryTypeOption {
  value: DirectoryType;
  label: string;
  icon: string;
  custom?: boolean;
}

export interface DirectoryContact {
  id: string;
  buildingId: string;
  type?: DirectoryType;
  typeLabel: string;
  icon: string;
  name: string;
  phone: string;
  note?: string;
  createdByName?: string;
  createdAt?: string;
}

export interface DirectoryListResponse {
  contacts: DirectoryContact[];
  types: DirectoryTypeOption[];
  canManage: boolean;
  buildings?: Building[];
}

export interface MarketplaceListing {
  id: string;
  buildingId: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  sellerId: string;
  sellerName: string;
  sellerPhone?: string;
  sellerEmail?: string;
  status?: string;
  createdAt?: string;
  isMine?: boolean;
  canDelete?: boolean;
}

export interface MarketplaceListResponse {
  listings: MarketplaceListing[];
  canCreate: boolean;
  buildings?: Building[];
}

export interface MarketplaceThread {
  id: string;
  listingId: string;
  listingTitle: string;
  listingImage?: string;
  otherId: string;
  otherName: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unread: number;
  isSeller: boolean;
}

export interface MarketplaceChatMessage {
  id: string;
  threadId: string;
  listingId: string;
  senderId: string;
  senderName: string;
  text: string;
  image?: string;
  mine: boolean;
  seen?: boolean;
  createdAt: string;
}

export type InboxCategory = 'committee' | 'resident' | 'guard';

export interface InboxContact {
  id: string;
  name: string;
  role: UserRole | string;
  roleLabel: string;
  phone?: string;
  email?: string;
  unitNumber?: string;
  threadId?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  inInbox?: boolean;
  unread?: number;
}

export interface InboxDirectoryResponse {
  buildingId: string;
  categories: Array<{ value: InboxCategory; label: string; count: number }>;
  contacts: Record<InboxCategory, InboxContact[]>;
}

export interface InboxThread {
  id: string;
  otherId: string;
  otherName: string;
  otherRole: string;
  lastMessage?: string;
  lastMessageAt?: string;
  updatedAt?: string;
  unread: number;
}

export interface InboxGroupMember {
  id: string;
  name: string;
  role?: string;
  phone?: string;
  unitNumber?: string;
}

export interface InboxGroup {
  id: string;
  name: string;
  createdBy: string;
  isOwner: boolean;
  memberIds: string[];
  members: InboxGroupMember[];
  memberCount: number;
  photo?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  updatedAt?: string;
  unread: number;
}

export interface InboxGroupMessage {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  text: string;
  image?: string;
  mine: boolean;
  seen?: boolean;
  createdAt: string;
}

export interface InboxGroupDetail {
  group: InboxGroup;
  messages: InboxGroupMessage[];
}

export interface InboxChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderName: string;
  text: string;
  image?: string;
  mine: boolean;
  seen?: boolean;
  createdAt: string;
}

export interface InboxThreadDetail {
  thread: InboxThread;
  messages: InboxChatMessage[];
}

export interface MarketplaceThreadDetail {
  thread: MarketplaceThread;
  messages: MarketplaceChatMessage[];
}

export type ElectionStatus = 'upcoming' | 'open' | 'closed';

export interface ElectionCandidate {
  id: string;
  electionId: string;
  name: string;
  unitNumber?: string;
  image?: string;
  votes?: number;
  percent?: number;
}

export interface ElectionSummary {
  id: string;
  buildingId: string;
  title: string;
  position: string;
  description?: string;
  startsAt: string;
  endsAt: string;
  showResults: boolean;
  status: ElectionStatus;
  periodLabel: string;
  candidateCount: number;
  totalVotes?: number;
  canManage: boolean;
  canVote: boolean;
  hasVoted: boolean;
  myCandidateId?: string;
  resultsVisible: boolean;
  createdByName?: string;
}

export interface ElectionDetailResponse {
  election: ElectionSummary;
  candidates: ElectionCandidate[];
}

export interface ElectionsListResponse {
  elections: ElectionSummary[];
  canManage: boolean;
  buildings?: Building[];
}

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved';

export interface ComplaintCategoryOption {
  value: string;
  label: string;
}

export interface ComplaintStatusOption {
  value: ComplaintStatus;
  label: string;
}

export interface ComplaintMedia {
  url: string;
  kind: 'image' | 'video';
}

export interface ComplaintTicket {
  id: string;
  buildingId: string;
  title: string;
  description: string;
  category: string;
  categoryLabel: string;
  status: ComplaintStatus;
  statusLabel: string;
  media: ComplaintMedia[];
  createdBy: string;
  createdByName: string;
  createdByPhone?: string;
  createdByEmail?: string;
  createdByRole?: string;
  unitNumber?: string;
  createdAt: string;
  updatedAt?: string;
  isMine?: boolean;
  canManage?: boolean;
  canComment?: boolean;
}

export interface ComplaintComment {
  id: string;
  complaintId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  text: string;
  media?: ComplaintMedia[];
  isSystem?: boolean;
  createdAt: string;
}

export interface ComplaintsListResponse {
  complaints: ComplaintTicket[];
  categories: ComplaintCategoryOption[];
  statuses: ComplaintStatusOption[];
  canCreate: boolean;
  canManage: boolean;
  buildings?: Building[];
}

export interface ComplaintDetailResponse {
  complaint: ComplaintTicket;
  comments: ComplaintComment[];
}

export interface AmenitySummary {
  id: string;
  name: string;
  icon: string;
  color: string;
  capacity: number;
  slotMinutes: number;
  openHour: number;
  closeHour: number;
  hoursLabel: string;
  totalSlots: number;
  bookedSlots: number;
  availableSlots: number;
}

export interface AmenityDateOption {
  value: string;
  label: string;
  day: string;
  fullLabel: string;
}

export interface AmenityBooking {
  id: string;
  buildingId: string;
  amenityId: string;
  amenityName: string;
  amenityIcon: string;
  amenityColor: string;
  date: string;
  dateLabel?: string;
  startTime: string;
  endTime: string;
  status: 'booked' | 'cancelled';
  userId: string;
  userName: string;
  userPhone?: string;
  unitNumber?: string;
  mine: boolean;
  canCancel?: boolean;
  createdAt: string;
}

export interface AmenityOccupant {
  id: string;
  bookingId?: string;
  name: string;
  unitNumber?: string;
  phone?: string;
  mine: boolean;
  canCancel?: boolean;
}

export interface AmenitySlot {
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  remaining: number;
  past: boolean;
  available: boolean;
  mine: boolean;
  myBookingId?: string;
  bookedBy: AmenityOccupant[];
}

export interface AmenitySlotsResponse {
  date: string;
  dateLabel: string;
  amenity: {
    id: string;
    name: string;
    icon: string;
    color: string;
    capacity: number;
    slotMinutes: number;
    hoursLabel: string;
  };
  canBook: boolean;
  canManage?: boolean;
  slotMinuteOptions?: number[];
  dayBookings?: AmenityBooking[];
  slots: AmenitySlot[];
}

export interface AmenitiesListResponse {
  date: string;
  dates: AmenityDateOption[];
  amenities: AmenitySummary[];
  myBookings: AmenityBooking[];
  dayBookings?: AmenityBooking[];
  nextBooking?: AmenityBooking | null;
  canBook: boolean;
  canManage?: boolean;
  slotMinuteOptions?: number[];
  buildings?: Building[];
}

export type GuestStatus = 'pending' | 'approved' | 'denied';

export interface GuestHost {
  id: string;
  name: string;
  unitNumber?: string;
  phone?: string;
}

export interface GuestVisit {
  id: string;
  buildingId: string;
  residentId: string;
  residentName: string;
  unitNumber?: string;
  visitorName: string;
  visitorPhone: string;
  purpose: string;
  status: GuestStatus;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  decidedAt?: string;
  canDecide?: boolean;
}

export interface GuestsListResponse {
  visits: GuestVisit[];
  pendingCount: number;
  canCreate: boolean;
  canDecide: boolean;
  purposes: string[];
  residents?: GuestHost[];
  buildings?: Building[];
  buildingId?: string;
}
