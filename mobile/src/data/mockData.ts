export interface Notice {
  id: string;
  title: string;
  content: string;
  date: string;
  author: string;
  isNew: boolean;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  amount: number;
  color: string;
}

export interface Amenity {
  id: string;
  name: string;
  availableSlots: number;
}

export interface MarketplaceItem {
  id: string;
  title: string;
  price: number;
  image: string;
  sellerName: string;
  date: string;
}

export interface Candidate {
  id: string;
  name: string;
  position: string;
  votes: number;
  image: string;
}

export interface GuestRequest {
  id: string;
  name: string;
  phone: string;
  purpose: string;
  time: string;
  status: 'pending' | 'approved' | 'denied';
}

export interface Contact {
  id: string;
  name: string;
  role: string;
  phone: string;
}

export interface Complaint {
  id: string;
  title: string;
  category: string;
  status: 'open' | 'in_progress' | 'resolved';
  date: string;
}

export interface ChatPreview {
  id: string;
  name: string;
  role: string;
  lastMsg: string;
  time: string;
  unread: number;
}

export const mockNotices: Notice[] = [
  {
    id: '1',
    title: 'Water Supply Interruption',
    content:
      'There will be no water supply on Friday from 10 AM to 2 PM due to maintenance.',
    date: 'Today, 09:00 AM',
    author: 'Management',
    isNew: true,
  },
  {
    id: '2',
    title: 'Annual General Meeting',
    content: 'The AGM will be held on the 15th of next month in the Community Hall.',
    date: 'Yesterday',
    author: 'Committee',
    isNew: false,
  },
  {
    id: '3',
    title: 'Lift 2 Maintenance',
    content: 'Lift 2 will be under maintenance this weekend.',
    date: 'Oct 12',
    author: 'Maintenance',
    isNew: false,
  },
];

export const mockExpenses: ExpenseCategory[] = [
  { id: '1', name: 'Guard Salary', amount: 45000, color: '#6366F1' },
  { id: '2', name: 'Electricity Bill', amount: 32000, color: '#EAB308' },
  { id: '3', name: 'Lift Maintenance', amount: 15000, color: '#10B981' },
  { id: '4', name: 'Cleaner Salary', amount: 12000, color: '#06B6D4' },
  { id: '5', name: 'WASA Bill', amount: 8000, color: '#3B82F6' },
  { id: '6', name: 'Other Expenses', amount: 5000, color: '#9CA3AF' },
];

export const mockAmenities: Amenity[] = [
  { id: '1', name: 'Swimming Pool', availableSlots: 4 },
  { id: '2', name: 'Guest Parking', availableSlots: 2 },
  { id: '3', name: 'Community Hall', availableSlots: 1 },
  { id: '4', name: 'Table Tennis', availableSlots: 3 },
  { id: '5', name: 'Billiard Room', availableSlots: 0 },
];

export const mockMarketplace: MarketplaceItem[] = [
  {
    id: '1',
    title: 'Wooden Dining Table',
    price: 150,
    image:
      'https://images.unsplash.com/photo-1577140917170-285929fb55b7?auto=format&fit=crop&q=80&w=300&h=300',
    sellerName: 'Apt 4B',
    date: '2 hrs ago',
  },
  {
    id: '2',
    title: 'Mountain Bike',
    price: 200,
    image:
      'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&q=80&w=300&h=300',
    sellerName: 'Apt 12A',
    date: '5 hrs ago',
  },
  {
    id: '3',
    title: 'IKEA Bookshelf',
    price: 45,
    image:
      'https://images.unsplash.com/photo-1594620113682-1c7b5084931a?auto=format&fit=crop&q=80&w=300&h=300',
    sellerName: 'Apt 7C',
    date: '1 day ago',
  },
];

export const mockCandidates: Candidate[] = [
  {
    id: '1',
    name: 'Robert Chen',
    position: 'President',
    votes: 142,
    image: '',
  },
  {
    id: '2',
    name: 'Sarah Jenkins',
    position: 'President',
    votes: 128,
    image: '',
  },
  {
    id: '3',
    name: 'Michael Ross',
    position: 'Treasurer',
    votes: 180,
    image: '',
  },
];

export const mockGuests: GuestRequest[] = [
  {
    id: '1',
    name: 'Amazon Delivery',
    phone: '+1 234 567 8900',
    purpose: 'Delivery',
    time: '10 mins ago',
    status: 'pending',
  },
  {
    id: '2',
    name: 'John Smith',
    phone: '+1 987 654 3210',
    purpose: 'Personal',
    time: '2 hours ago',
    status: 'approved',
  },
  {
    id: '3',
    name: 'Plumber',
    phone: '+1 555 123 4567',
    purpose: 'Maintenance',
    time: 'Yesterday',
    status: 'approved',
  },
];

export const mockContacts: Contact[] = [
  { id: '1', name: 'Main Gate Security', role: 'Security Guard', phone: '100' },
  { id: '2', name: 'Property Manager', role: 'Management', phone: '+18001234567' },
  { id: '3', name: 'Local Police', role: 'Emergency', phone: '911' },
  { id: '4', name: 'Fire Station', role: 'Emergency', phone: '912' },
  { id: '5', name: 'City Hospital', role: 'Medical', phone: '913' },
  { id: '6', name: 'Gas Supplier', role: 'Utility', phone: '+18005550000' },
];

export const mockComplaints: Complaint[] = [
  {
    id: '1',
    title: 'Leaking pipe in bathroom',
    category: 'Plumbing',
    status: 'in_progress',
    date: 'Today',
  },
  {
    id: '2',
    title: 'AC not cooling',
    category: 'Electrical',
    status: 'open',
    date: 'Yesterday',
  },
  {
    id: '3',
    title: 'Lobby light broken',
    category: 'Common Area',
    status: 'resolved',
    date: 'Oct 10',
  },
];

export const mockChats: ChatPreview[] = [
  {
    id: '1',
    name: 'Security Gate',
    role: 'Guard',
    lastMsg: 'Your visitor has arrived.',
    time: '10:02 AM',
    unread: 2,
  },
  {
    id: '2',
    name: 'Building Manager',
    role: 'Manager',
    lastMsg: 'The maintenance is scheduled.',
    time: 'Yesterday',
    unread: 0,
  },
  {
    id: '3',
    name: 'Alice (A-201)',
    role: 'Resident',
    lastMsg: 'Thanks for the package!',
    time: 'Tue',
    unread: 0,
  },
  {
    id: '4',
    name: 'John (C-104)',
    role: 'Resident',
    lastMsg: 'Are we still on for the meeting?',
    time: 'Mon',
    unread: 0,
  },
];

export const mockRentals = [
  {
    id: '1',
    unit: 'A-101',
    tenant: 'Sarah Jenkins',
    leaseEnd: '2027-05-31',
    status: 'Active',
    rent: 'Tk 1,20,000',
  },
  {
    id: '2',
    unit: 'B-402',
    tenant: 'Robert Fox',
    leaseEnd: '2026-12-31',
    status: 'Active',
    rent: 'Tk 1,45,000',
  },
  {
    id: '3',
    unit: 'C-205',
    tenant: 'Vacant',
    leaseEnd: '-',
    status: 'Available',
    rent: 'Tk 1,50,000',
  },
  {
    id: '4',
    unit: 'A-304',
    tenant: 'Michael Chen',
    leaseEnd: '2026-08-15',
    status: 'Expiring Soon',
    rent: 'Tk 1,30,000',
  },
];
