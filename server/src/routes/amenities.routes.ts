import { Router, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { AmenityBooking, IAmenityBookingDocument } from '../models/AmenityBooking';
import { AmenitySetting, SLOT_MINUTE_OPTIONS, isSlotCapacity, isSlotMinutes } from '../models/AmenitySetting';
import { Building } from '../models/Building';
import { User } from '../models/User';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest, requireAuth, requireAmenityBooker, requireAmenityManager } from '../middleware/auth';
import { canBookAmenities, canManageAmenityBookings, isAppAdmin } from '../constants/roles';
import {
  AMENITIES,
  AmenityDefinition,
  dateLabel,
  dayNumber,
  generateSlots,
  getAmenity,
  isAmenityId,
  isPastSlot,
  matchingSlot,
  pad2,
  parseDateKey,
  todayKey,
  upcomingDateKeys,
  weekdayLabel,
} from '../constants/amenities';

const router = Router();
router.use(requireAuth);

const BOOKING_WINDOW_DAYS = 7;

function hoursLabel(amenity: AmenityDefinition) {
  return `${pad2(amenity.openHour)}:00 – ${pad2(amenity.closeHour)}:00`;
}

function applySetting(
  base: AmenityDefinition,
  setting?: { slotMinutes?: number; capacity?: number } | null,
): AmenityDefinition {
  const minutes = isSlotMinutes(setting?.slotMinutes)
    ? setting.slotMinutes
    : isSlotMinutes(base.slotMinutes)
      ? base.slotMinutes
      : 60;
  const capacity = isSlotCapacity(setting?.capacity)
    ? setting.capacity
    : isSlotCapacity(base.capacity)
      ? base.capacity
      : 1;
  return { ...base, slotMinutes: minutes, capacity };
}

async function loadAmenitiesForBuilding(buildingId: string): Promise<AmenityDefinition[]> {
  const settings = await AmenitySetting.find({ buildingId }).lean();
  const map = new Map(settings.map((item) => [item.amenityId, item]));
  return AMENITIES.map((item) => applySetting(item, map.get(item.id)));
}

async function loadAmenityForBuilding(buildingId: string, amenityId: string) {
  const base = getAmenity(amenityId);
  if (!base || !isAmenityId(amenityId)) return undefined;
  const setting = await AmenitySetting.findOne({ buildingId, amenityId }).lean();
  return applySetting(base, setting);
}

async function resolveBuildingId(
  actor: { role: string; buildingId?: string },
  requested?: string,
  allowDefault = false,
): Promise<string> {
  if (isAppAdmin(actor.role)) {
    if (requested) {
      const building = await Building.findById(requested);
      if (!building) throw new AppError(404, 'Building not found');
      return building._id.toString();
    }
    if (!allowDefault) throw new AppError(400, 'Select a building');
    const first = await Building.findOne().sort({ name: 1 });
    if (!first) throw new AppError(404, 'No buildings found');
    return first._id.toString();
  }
  if (!actor.buildingId) {
    throw new AppError(400, 'Your account is not linked to a building');
  }
  return actor.buildingId;
}

function requestedDate(value?: unknown): string {
  if (!value) return todayKey();
  const date = String(value);
  if (!parseDateKey(date)) throw new AppError(400, 'Invalid date');
  const allowed = upcomingDateKeys(BOOKING_WINDOW_DAYS);
  if (!allowed.includes(date) && date !== todayKey()) {
    throw new AppError(400, 'Choose a date within the next 7 days');
  }
  return date;
}

function withCancel(booking: IAmenityBookingDocument, actorId: string, actorRole: string) {
  const json = booking.toSafeJSON(actorId);
  const upcoming = json.status === 'booked' && !isPastSlot(json.date, json.startTime);
  return {
    ...json,
    dateLabel: dateLabel(json.date),
    canCancel: upcoming && (json.mine || canManageAmenityBookings(actorRole)),
  };
}

type UserInfo = { name?: string; phone?: string; unitNumber?: string };

async function userInfoMap(userIds: string[]): Promise<Map<string, UserInfo>> {
  const ids = [...new Set(userIds.filter((id) => id && mongoose.isValidObjectId(id)))];
  if (!ids.length) return new Map();
  const users = await User.find({ _id: { $in: ids } }).select('name phone unitNumber');
  return new Map(
    users.map((user) => [
      user._id.toString(),
      { name: user.name, phone: user.phone, unitNumber: user.unitNumber },
    ]),
  );
}

function bookingForManager(
  booking: IAmenityBookingDocument,
  actorId: string,
  actorRole: string,
  info?: UserInfo,
) {
  return {
    ...withCancel(booking, actorId, actorRole),
    userName: info?.name || booking.userName,
    unitNumber: info?.unitNumber || booking.unitNumber,
    userPhone: info?.phone,
  };
}

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const canManage = canManageAmenityBookings(actor.role);
    const buildings = isAppAdmin(actor.role)
      ? (await Building.find().sort({ name: 1 })).map((item) => item.toSafeJSON())
      : undefined;
    const buildingId = await resolveBuildingId(
      actor,
      req.query.buildingId ? String(req.query.buildingId) : undefined,
      true,
    );
    const date = requestedDate(req.query.date);
    const dates = upcomingDateKeys(BOOKING_WINDOW_DAYS).map((value) => ({
      value,
      label: weekdayLabel(value),
      day: dayNumber(value),
      fullLabel: dateLabel(value),
    }));

    const catalog = await loadAmenitiesForBuilding(buildingId);
    const bookings = await AmenityBooking.find({
      buildingId,
      date,
      status: 'booked',
    }).sort({ startTime: 1 });

    const amenities = catalog.map((amenity) => {
      const slots = generateSlots(amenity);
      const openSlots = slots.filter((slot) => !isPastSlot(date, slot.startTime));
      const total = openSlots.length * amenity.capacity;
      const booked = bookings.filter(
        (item) =>
          item.amenityId === amenity.id &&
          openSlots.some((slot) => slot.startTime === item.startTime),
      ).length;
      return {
        id: amenity.id,
        name: amenity.name,
        icon: amenity.icon,
        color: amenity.color,
        capacity: amenity.capacity,
        slotMinutes: amenity.slotMinutes,
        openHour: amenity.openHour,
        closeHour: amenity.closeHour,
        hoursLabel: hoursLabel(amenity),
        totalSlots: total,
        bookedSlots: booked,
        availableSlots: Math.max(0, total - booked),
      };
    });

    const myBookings = await AmenityBooking.find({
      buildingId,
      userId: actor.userId,
      status: 'booked',
      date: { $gte: todayKey() },
    }).sort({ date: 1, startTime: 1 });

    const upcomingMine = myBookings.filter((item) => !isPastSlot(item.date, item.startTime));
    const nextBooking = upcomingMine[0] ? withCancel(upcomingMine[0], actor.userId, actor.role) : null;

    let dayBookings;
    if (canManage) {
      const infos = await userInfoMap(bookings.map((item) => item.userId));
      dayBookings = bookings.map((item) =>
        bookingForManager(item, actor.userId, actor.role, infos.get(item.userId)),
      );
    }

    res.json({
      success: true,
      data: {
        date,
        dates,
        amenities,
        myBookings: upcomingMine.map((item) => withCancel(item, actor.userId, actor.role)),
        dayBookings,
        nextBooking,
        canBook: canBookAmenities(actor.role),
        canManage,
        slotMinuteOptions: [...SLOT_MINUTE_OPTIONS],
        buildings,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/bookings', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const canManage = canManageAmenityBookings(actor.role);
    const buildingId = await resolveBuildingId(
      actor,
      req.query.buildingId ? String(req.query.buildingId) : undefined,
      true,
    );
    const date = req.query.date ? requestedDate(req.query.date) : undefined;
    const query: Record<string, unknown> = {
      buildingId,
      status: 'booked',
      date: date || { $gte: todayKey() },
    };
    if (!canManage) query.userId = actor.userId;

    const found = await AmenityBooking.find(query).sort({ date: 1, startTime: 1 });
    const infos = canManage ? await userInfoMap(found.map((item) => item.userId)) : new Map();
    const bookings = found
      .filter((item) => date || !isPastSlot(item.date, item.startTime))
      .map((item) =>
        canManage
          ? bookingForManager(item, actor.userId, actor.role, infos.get(item.userId))
          : withCancel(item, actor.userId, actor.role),
      );

    res.json({
      success: true,
      data: { bookings, canManage },
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:amenityId/settings', requireAmenityManager, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const amenityId = String(req.params.amenityId);
    if (!getAmenity(amenityId) || !isAmenityId(amenityId)) {
      throw new AppError(404, 'Amenity not found');
    }
    const slotMinutes = Number(req.body.slotMinutes);
    const capacity = Number(req.body.capacity);
    if (!isSlotMinutes(slotMinutes)) {
      throw new AppError(400, 'Slot length must be a whole number between 15 and 240 minutes');
    }
    if (!isSlotCapacity(capacity)) {
      throw new AppError(400, 'Spots per slot must be a whole number between 1 and 50');
    }

    const buildingId = await resolveBuildingId(
      actor,
      req.body.buildingId ? String(req.body.buildingId) : undefined,
      true,
    );

    const setting = await AmenitySetting.findOneAndUpdate(
      { buildingId, amenityId },
      { $set: { slotMinutes, capacity } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const amenity = applySetting(getAmenity(amenityId)!, setting);
    res.json({
      success: true,
      data: {
        amenity: {
          id: amenity.id,
          name: amenity.name,
          slotMinutes: amenity.slotMinutes,
          capacity: amenity.capacity,
          hoursLabel: hoursLabel(amenity),
        },
        slotMinuteOptions: [...SLOT_MINUTE_OPTIONS],
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:amenityId/slots', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const canManage = canManageAmenityBookings(actor.role);
    const amenityId = String(req.params.amenityId);
    const buildingId = await resolveBuildingId(
      actor,
      req.query.buildingId ? String(req.query.buildingId) : undefined,
      true,
    );
    const amenity = await loadAmenityForBuilding(buildingId, amenityId);
    if (!amenity) {
      throw new AppError(404, 'Amenity not found');
    }

    const date = requestedDate(req.query.date);
    const generated = generateSlots(amenity);
    const bookings = await AmenityBooking.find({
      buildingId,
      amenityId,
      date,
      status: 'booked',
    }).sort({ startTime: 1 });
    const infos = canManage ? await userInfoMap(bookings.map((item) => item.userId)) : new Map();

    const slots = generated.map((slot) => {
      const occupants = bookings.filter((item) => item.startTime === slot.startTime);
      const mine = occupants.find((item) => item.userId === actor.userId);
      const past = isPastSlot(date, slot.startTime);
      const remaining = Math.max(0, amenity.capacity - occupants.length);
      const available = !past && remaining > 0 && !mine;
      return {
        startTime: slot.startTime,
        endTime: slot.endTime,
        capacity: amenity.capacity,
        bookedCount: occupants.length,
        remaining,
        past,
        available,
        mine: Boolean(mine),
        myBookingId: mine?._id.toString(),
        bookedBy: canManage
          ? occupants.map((item) => {
              const info = infos.get(item.userId);
              return {
                id: item.userId,
                bookingId: item._id.toString(),
                name: info?.name || item.userName,
                unitNumber: info?.unitNumber || item.unitNumber,
                phone: info?.phone,
                mine: item.userId === actor.userId,
                canCancel:
                  item.status === 'booked' &&
                  !isPastSlot(item.date, item.startTime) &&
                  (item.userId === actor.userId || canManage),
              };
            })
          : occupants.map((item) => ({
              id: item.userId,
              name: item.userId === actor.userId ? 'You' : 'Reserved',
              mine: item.userId === actor.userId,
            })),
      };
    });

    res.json({
      success: true,
      data: {
        date,
        dateLabel: dateLabel(date),
        amenity: {
          id: amenity.id,
          name: amenity.name,
          icon: amenity.icon,
          color: amenity.color,
          capacity: amenity.capacity,
          slotMinutes: amenity.slotMinutes,
          hoursLabel: hoursLabel(amenity),
        },
        canBook: canBookAmenities(actor.role),
        canManage,
        slotMinuteOptions: [...SLOT_MINUTE_OPTIONS],
        dayBookings: canManage
          ? bookings.map((item) =>
              bookingForManager(item, actor.userId, actor.role, infos.get(item.userId)),
            )
          : undefined,
        slots,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:amenityId/bookings', requireAmenityBooker, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const amenityId = String(req.params.amenityId);
    const buildingId = await resolveBuildingId(
      actor,
      req.body.buildingId ? String(req.body.buildingId) : undefined,
      true,
    );
    const amenity = await loadAmenityForBuilding(buildingId, amenityId);
    if (!amenity) {
      throw new AppError(404, 'Amenity not found');
    }

    const date = requestedDate(req.body.date);
    const startTime = String(req.body.startTime ?? '').trim();
    const slot = matchingSlot(amenity, startTime);
    if (!slot) {
      throw new AppError(400, 'That time slot is not available for this amenity');
    }
    if (isPastSlot(date, slot.startTime)) {
      throw new AppError(400, 'This time slot has already passed');
    }

    const user = await User.findById(actor.userId);
    const existing = await AmenityBooking.find({
      buildingId,
      amenityId,
      date,
      startTime: slot.startTime,
      status: 'booked',
    }).select('slotIndex userId');

    if (existing.some((item) => item.userId === actor.userId)) {
      throw new AppError(409, 'You already booked this slot');
    }
    if (existing.length >= amenity.capacity) {
      throw new AppError(409, 'This slot is already booked');
    }

    const used = new Set(existing.map((item) => item.slotIndex));
    let slotIndex = 0;
    while (used.has(slotIndex)) slotIndex += 1;

    try {
      const booking = await AmenityBooking.create({
        buildingId,
        amenityId,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        slotIndex,
        status: 'booked',
        userId: actor.userId,
        userName: user?.name || actor.email,
        unitNumber: user?.unitNumber,
      });

      res.status(201).json({
        success: true,
        data: { booking: withCancel(booking, actor.userId, actor.role) },
      });
    } catch (error) {
      const mongoErr = error as { code?: number };
      if (mongoErr.code === 11000) {
        throw new AppError(409, 'This slot is already booked');
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

router.delete('/bookings/:bookingId', requireAmenityBooker, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.user!;
    const booking = await AmenityBooking.findById(req.params.bookingId);
    if (!booking || booking.status !== 'booked') {
      throw new AppError(404, 'Booking not found');
    }

    const manager = canManageAmenityBookings(actor.role);
    if (booking.userId !== actor.userId && !manager) {
      throw new AppError(403, 'You can only cancel your own booking');
    }
    if (!isAppAdmin(actor.role) && actor.buildingId && booking.buildingId !== actor.buildingId) {
      throw new AppError(403, 'You cannot cancel this booking');
    }
    if (isPastSlot(booking.date, booking.startTime)) {
      throw new AppError(400, 'This booking has already started');
    }

    booking.status = 'cancelled';
    await booking.save();

    res.json({
      success: true,
      message: 'Booking cancelled',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
