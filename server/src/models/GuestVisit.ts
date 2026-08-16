import mongoose, { Document, Schema, Model } from 'mongoose';
import { GUEST_STATUSES, GuestStatus } from '../constants/guests';

export interface IGuestVisit {
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
  decidedAt?: Date;
  decidedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGuestVisitDocument extends IGuestVisit, Document {
  toSafeJSON(): {
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
    canDecide: boolean;
  };
}

const guestVisitSchema = new Schema<IGuestVisitDocument>(
  {
    buildingId: { type: String, required: true, index: true },
    residentId: { type: String, required: true, index: true },
    residentName: { type: String, required: true, trim: true },
    unitNumber: { type: String, trim: true },
    visitorName: { type: String, required: true, trim: true },
    visitorPhone: { type: String, required: true, trim: true },
    purpose: { type: String, required: true, trim: true },
    status: { type: String, enum: GUEST_STATUSES, default: 'pending', index: true },
    createdBy: { type: String, required: true, index: true },
    createdByName: { type: String, required: true, trim: true },
    decidedAt: { type: Date },
    decidedBy: { type: String },
  },
  { timestamps: true },
);

guestVisitSchema.index({ buildingId: 1, createdAt: -1 });
guestVisitSchema.index({ residentId: 1, status: 1, createdAt: -1 });

guestVisitSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    buildingId: this.buildingId,
    residentId: this.residentId,
    residentName: this.residentName,
    unitNumber: this.unitNumber,
    visitorName: this.visitorName,
    visitorPhone: this.visitorPhone,
    purpose: this.purpose,
    status: this.status,
    createdBy: this.createdBy,
    createdByName: this.createdByName,
    createdAt: (this.createdAt ?? new Date()).toISOString(),
    decidedAt: this.decidedAt ? this.decidedAt.toISOString() : undefined,
    canDecide: false,
  };
};

if (mongoose.models.GuestVisit) {
  mongoose.deleteModel('GuestVisit');
}

export const GuestVisit: Model<IGuestVisitDocument> = mongoose.model<IGuestVisitDocument>(
  'GuestVisit',
  guestVisitSchema,
);
