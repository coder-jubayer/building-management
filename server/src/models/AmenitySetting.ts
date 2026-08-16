import mongoose, { Document, Schema, Model } from 'mongoose';
import { AMENITY_IDS } from '../constants/amenities';

export const SLOT_MINUTE_OPTIONS = [30, 45, 60] as const;
export const SLOT_MINUTES_MIN = 15;
export const SLOT_MINUTES_MAX = 240;
export const SLOT_CAPACITY_OPTIONS = [1, 2, 4, 6, 8] as const;
export const SLOT_CAPACITY_MIN = 1;
export const SLOT_CAPACITY_MAX = 50;

export function isSlotMinutes(value: unknown): value is number {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= SLOT_MINUTES_MIN && minutes <= SLOT_MINUTES_MAX;
}

export function isSlotCapacity(value: unknown): value is number {
  const capacity = Number(value);
  return Number.isInteger(capacity) && capacity >= SLOT_CAPACITY_MIN && capacity <= SLOT_CAPACITY_MAX;
}

export interface IAmenitySetting {
  buildingId: string;
  amenityId: string;
  slotMinutes: number;
  capacity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAmenitySettingDocument extends IAmenitySetting, Document {
  toSafeJSON(): {
    buildingId: string;
    amenityId: string;
    slotMinutes: number;
    capacity: number;
  };
}

const amenitySettingSchema = new Schema<IAmenitySettingDocument>(
  {
    buildingId: { type: String, required: true, index: true },
    amenityId: { type: String, required: true, enum: [...AMENITY_IDS] },
    slotMinutes: { type: Number, required: true, min: SLOT_MINUTES_MIN, max: SLOT_MINUTES_MAX },
    capacity: { type: Number, required: true, min: SLOT_CAPACITY_MIN, max: SLOT_CAPACITY_MAX },
  },
  { timestamps: true },
);

amenitySettingSchema.index({ buildingId: 1, amenityId: 1 }, { unique: true });

amenitySettingSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    buildingId: this.buildingId,
    amenityId: this.amenityId,
    slotMinutes: this.slotMinutes,
    capacity: this.capacity,
  };
};

if (mongoose.models.AmenitySetting) {
  mongoose.deleteModel('AmenitySetting');
}

export const AmenitySetting: Model<IAmenitySettingDocument> = mongoose.model<IAmenitySettingDocument>(
  'AmenitySetting',
  amenitySettingSchema,
);
