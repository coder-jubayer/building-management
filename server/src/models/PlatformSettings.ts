import mongoose, { Document, Schema, Model } from 'mongoose';

export const FREE_TRIAL_DAY_OPTIONS = [7, 14, 30, 60] as const;
export type FreeTrialDays = (typeof FREE_TRIAL_DAY_OPTIONS)[number];

export interface IPlatformSettings {
  freeTrialEnabled: boolean;
  freeTrialDays: number;
  supportWhatsApp: string;
  /** Charge in BDT (TK) applied per activated building for earnings estimates. */
  chargePerBuildingBdt: number;
  updatedAt: Date;
  createdAt: Date;
}

export interface IPlatformSettingsDocument extends IPlatformSettings, Document {
  toSafeJSON(): {
    freeTrialEnabled: boolean;
    freeTrialDays: number;
    supportWhatsApp: string;
    freeTrialLabel: string;
    chargePerBuildingBdt: number;
  };
}

const platformSettingsSchema = new Schema<IPlatformSettingsDocument>(
  {
    freeTrialEnabled: { type: Boolean, default: true },
    freeTrialDays: { type: Number, default: 14 },
    supportWhatsApp: { type: String, default: '', trim: true },
    chargePerBuildingBdt: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

platformSettingsSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    freeTrialEnabled: Boolean(this.freeTrialEnabled),
    freeTrialDays: Number(this.freeTrialDays) || 14,
    supportWhatsApp: String(this.supportWhatsApp || '').trim(),
    freeTrialLabel: formatTrialLabel(Number(this.freeTrialDays) || 14),
    chargePerBuildingBdt: Math.max(0, Number(this.chargePerBuildingBdt) || 0),
  };
};

if (mongoose.models.PlatformSettings) {
  mongoose.deleteModel('PlatformSettings');
}

export const PlatformSettings: Model<IPlatformSettingsDocument> =
  mongoose.model<IPlatformSettingsDocument>('PlatformSettings', platformSettingsSchema);

export function formatTrialLabel(days: number): string {
  if (days === 7) return '7 days';
  if (days === 14) return '14 days';
  if (days === 30) return '1 month';
  if (days === 60) return '2 months';
  if (days % 30 === 0) return `${days / 30} months`;
  return `${days} days`;
}

export async function getPlatformSettings(): Promise<IPlatformSettingsDocument> {
  let settings = await PlatformSettings.findOne();
  if (!settings) {
    settings = await PlatformSettings.create({
      freeTrialEnabled: true,
      freeTrialDays: 14,
      supportWhatsApp: '',
      chargePerBuildingBdt: 0,
    });
  }
  return settings;
}
