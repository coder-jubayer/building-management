import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from './errorHandler';
import {
  canBookAmenities,
  canCreateComplaint,
  canCreateListing,
  canManageAmenityBookings,
  canManageComplaints,
  canManageDirectory,
  canManageElections,
  canManageExpenses,
  canManageResidentDues,
  canManageUsers,
  canPostNotices,
  canCreateGuestVisits,
  isAppAdmin,
  UserRole,
} from '../constants/roles';

export interface AuthPayload {
  userId: string;
  role: UserRole;
  email?: string;
  buildingId?: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function requireAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, 'Authentication required'));
    return;
  }

  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
}

export function requireUserManager(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !canManageUsers(req.user.role)) {
    next(new AppError(403, 'You do not have permission to manage users'));
    return;
  }
  next();
}

export function requireAppAdmin(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !isAppAdmin(req.user.role)) {
    next(new AppError(403, 'Only app admins can access this resource'));
    return;
  }
  next();
}

export function requireNoticePoster(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !canPostNotices(req.user.role)) {
    next(new AppError(403, 'Only committee and building admins can post notices'));
    return;
  }
  next();
}

export function requireExpenseManager(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !canManageExpenses(req.user.role)) {
    next(new AppError(403, 'Only committee can add or update expenses'));
    return;
  }
  next();
}

export function requireResidentDueManager(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !canManageResidentDues(req.user.role)) {
    next(new AppError(403, 'Only building admins can manage resident dues'));
    return;
  }
  next();
}

export function requireDirectoryManager(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !canManageDirectory(req.user.role)) {
    next(new AppError(403, 'Only building admin or committee can manage the directory'));
    return;
  }
  next();
}

export function requireListingCreator(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !canCreateListing(req.user.role)) {
    next(new AppError(403, 'Only building admin, committee, or residents can create listings'));
    return;
  }
  next();
}

export function requireElectionManager(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !canManageElections(req.user.role)) {
    next(new AppError(403, 'Only committee and building admins can manage elections'));
    return;
  }
  next();
}

export function requireComplaintCreator(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !canCreateComplaint(req.user.role)) {
    next(new AppError(403, 'You do not have permission to create complaint tickets'));
    return;
  }
  next();
}

export function requireComplaintManager(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !canManageComplaints(req.user.role)) {
    next(new AppError(403, 'Only committee and building admins can manage complaints'));
    return;
  }
  next();
}

export function requireAmenityBooker(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !canBookAmenities(req.user.role)) {
    next(new AppError(403, 'You do not have permission to book amenities'));
    return;
  }
  next();
}

export function requireAmenityManager(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !canManageAmenityBookings(req.user.role)) {
    next(new AppError(403, 'Only building admins can manage amenity slots'));
    return;
  }
  next();
}

export function requireGuestCreator(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user || !canCreateGuestVisits(req.user.role)) {
    next(new AppError(403, 'Only security guards can send visitor approval requests'));
    return;
  }
  next();
}
