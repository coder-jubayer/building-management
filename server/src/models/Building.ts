import mongoose, { Document, Schema, Model } from 'mongoose';
import { generateBuildingCode } from '../utils/buildingCode';

export const BUILDING_ACCESS_STATUSES = ['locked', 'trial', 'active', 'expired'] as const;
export type BuildingAccessStatus = (typeof BUILDING_ACCESS_STATUSES)[number];

export interface IBuilding {
  name: string;
  code: string;
  createdBy?: string;
  isActive: boolean;
  /** Feature access for everyone in this building. */
  accessStatus: BuildingAccessStatus;
  trialClaimed: boolean;
  trialStartedAt?: Date;
  trialEndsAt?: Date;
  /** Frozen days granted when the trial was claimed — not updated if platform settings change later. */
  trialDaysGranted?: number;
  activatedAt?: Date;
  /** When paid activation ended (locked / expired by admin). */
  deactivatedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBuildingDocument extends IBuilding, Document {
  toSafeJSON(): {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
    accessStatus: BuildingAccessStatus;
    trialClaimed: boolean;
    trialStartedAt?: string;
    trialEndsAt?: string;
    trialDaysGranted?: number;
    activatedAt?: string;
    deactivatedAt?: string;
    expiresAt?: string;
  };
}

const buildingSchema = new Schema<IBuildingDocument>(
  {
    name: { type: String, required: true, trim: true },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    createdBy: { type: String },
    isActive: { type: Boolean, default: true },
    accessStatus: {
      type: String,
      enum: BUILDING_ACCESS_STATUSES,
      default: 'locked',
    },
    trialClaimed: { type: Boolean, default: false },
    trialStartedAt: { type: Date },
    trialEndsAt: { type: Date },
    trialDaysGranted: { type: Number },
    activatedAt: { type: Date },
    deactivatedAt: { type: Date },
    expiresAt: { type: Date },
  },
  { timestamps: true },
);

const MAX_CODE_ATTEMPTS = 10;

buildingSchema.pre('validate', async function assignCode(next) {
  if (this.code) {
    next();
    return;
  }

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const candidate = generateBuildingCode();
    const taken = await mongoose.models.Building.exists({ code: candidate });
    if (!taken) {
      this.code = candidate;
      next();
      return;
    }
  }

  next(new Error('Could not generate a unique building code'));
});

buildingSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    name: this.name,
    code: this.code,
    isActive: this.isActive,
    accessStatus: this.accessStatus || 'locked',
    trialClaimed: Boolean(this.trialClaimed),
    trialStartedAt: this.trialStartedAt?.toISOString(),
    trialEndsAt: this.trialEndsAt?.toISOString(),
    trialDaysGranted: this.trialDaysGranted,
    activatedAt: this.activatedAt?.toISOString(),
    deactivatedAt: this.deactivatedAt?.toISOString(),
    expiresAt: this.expiresAt?.toISOString(),
  };
};

if (mongoose.models.Building) {
  mongoose.deleteModel('Building');
}

export const Building: Model<IBuildingDocument> = mongoose.model<IBuildingDocument>(
  'Building',
  buildingSchema,
);
