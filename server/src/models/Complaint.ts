import mongoose, { Document, Schema, Model } from 'mongoose';
import { COMPLAINT_CATEGORY_VALUES, COMPLAINT_STATUSES, ComplaintStatus } from '../constants/complaints';

export type ComplaintMediaKind = 'image' | 'video';

export interface IComplaintMedia {
  path: string;
  kind: ComplaintMediaKind;
}

export interface IComplaint {
  buildingId: string;
  title: string;
  description: string;
  category: string;
  status: ComplaintStatus;
  media: IComplaintMedia[];
  createdBy: string;
  createdByName: string;
  unitNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IComplaintDocument extends IComplaint, Document {
  toSafeJSON(mediaUrls?: Array<{ url: string; kind: ComplaintMediaKind }>): {
    id: string;
    buildingId: string;
    title: string;
    description: string;
    category: string;
    status: ComplaintStatus;
    media: Array<{ url: string; kind: ComplaintMediaKind }>;
    createdBy: string;
    createdByName: string;
    unitNumber?: string;
    createdAt: string;
    updatedAt: string;
  };
}

const complaintSchema = new Schema<IComplaintDocument>(
  {
    buildingId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: COMPLAINT_CATEGORY_VALUES },
    status: { type: String, enum: COMPLAINT_STATUSES, default: 'open', index: true },
    media: {
      type: [
        {
          path: { type: String, required: true },
          kind: { type: String, enum: ['image', 'video'], required: true },
        },
      ],
      default: [],
    },
    createdBy: { type: String, required: true, index: true },
    createdByName: { type: String, required: true, trim: true },
    unitNumber: { type: String, trim: true },
  },
  { timestamps: true },
);

complaintSchema.index({ buildingId: 1, createdAt: -1 });
complaintSchema.index({ buildingId: 1, status: 1, createdAt: -1 });

complaintSchema.methods.toSafeJSON = function toSafeJSON(
  mediaUrls?: Array<{ url: string; kind: ComplaintMediaKind }>,
) {
  return {
    id: this._id.toString(),
    buildingId: this.buildingId,
    title: this.title,
    description: this.description,
    category: this.category,
    status: this.status,
    media:
      mediaUrls ??
      this.media.map((item: IComplaintMedia) => ({
        url: item.path,
        kind: item.kind,
      })),
    createdBy: this.createdBy,
    createdByName: this.createdByName,
    unitNumber: this.unitNumber,
    createdAt: (this.createdAt ?? new Date()).toISOString(),
    updatedAt: (this.updatedAt ?? new Date()).toISOString(),
  };
};

if (mongoose.models.Complaint) {
  mongoose.deleteModel('Complaint');
}

export const Complaint: Model<IComplaintDocument> = mongoose.model<IComplaintDocument>('Complaint', complaintSchema);
