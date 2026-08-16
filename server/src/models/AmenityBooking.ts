import mongoose, { Document, Schema, Model } from 'mongoose';
import { getAmenity } from '../constants/amenities';

export const BOOKING_STATUSES = ['booked', 'cancelled'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface IAmenityBooking {
  buildingId: string;
  amenityId: string;
  date: string;
  startTime: string;
  endTime: string;
  slotIndex: number;
  status: BookingStatus;
  userId: string;
  userName: string;
  unitNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAmenityBookingDocument extends IAmenityBooking, Document {
  toSafeJSON(actorId?: string): {
    id: string;
    buildingId: string;
    amenityId: string;
    amenityName: string;
    amenityIcon: string;
    amenityColor: string;
    date: string;
    startTime: string;
    endTime: string;
    status: BookingStatus;
    userId: string;
    userName: string;
    unitNumber?: string;
    mine: boolean;
    createdAt: string;
  };
}

const amenityBookingSchema = new Schema<IAmenityBookingDocument>(
  {
    buildingId: { type: String, required: true, index: true },
    amenityId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    slotIndex: { type: Number, required: true, min: 0 },
    status: { type: String, enum: BOOKING_STATUSES, default: 'booked', index: true },
    userId: { type: String, required: true, index: true },
    userName: { type: String, required: true, trim: true },
    unitNumber: { type: String, trim: true },
  },
  { timestamps: true },
);

amenityBookingSchema.index(
  { buildingId: 1, amenityId: 1, date: 1, startTime: 1, slotIndex: 1 },
  { unique: true, partialFilterExpression: { status: 'booked' } },
);

amenityBookingSchema.index(
  { buildingId: 1, amenityId: 1, date: 1, startTime: 1, userId: 1 },
  { unique: true, partialFilterExpression: { status: 'booked' } },
);

amenityBookingSchema.index({ buildingId: 1, userId: 1, date: 1, startTime: 1 });
amenityBookingSchema.index({ buildingId: 1, amenityId: 1, date: 1, status: 1 });

amenityBookingSchema.methods.toSafeJSON = function toSafeJSON(actorId?: string) {
  const amenity = getAmenity(this.amenityId);
  return {
    id: this._id.toString(),
    buildingId: this.buildingId,
    amenityId: this.amenityId,
    amenityName: amenity?.name ?? this.amenityId,
    amenityIcon: amenity?.icon ?? 'calendar',
    amenityColor: amenity?.color ?? '#4F46E5',
    date: this.date,
    startTime: this.startTime,
    endTime: this.endTime,
    status: this.status,
    userId: this.userId,
    userName: this.userName,
    unitNumber: this.unitNumber,
    mine: actorId ? this.userId === actorId : false,
    createdAt: (this.createdAt ?? new Date()).toISOString(),
  };
};

if (mongoose.models.AmenityBooking) {
  mongoose.deleteModel('AmenityBooking');
}

export const AmenityBooking: Model<IAmenityBookingDocument> = mongoose.model<IAmenityBookingDocument>(
  'AmenityBooking',
  amenityBookingSchema,
);
