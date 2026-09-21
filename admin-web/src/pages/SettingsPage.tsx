import { useCallback, useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import {
  fetchPlatformSettings,
  updatePlatformSettings,
} from '../services/platform.service';
import type { PlatformSettings, TrialDayOption } from '../types';

export function SettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [options, setOptions] = useState<TrialDayOption[]>([]);
  const [whatsapp, setWhatsapp] = useState('');
  const [charge, setCharge] = useState('0');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await fetchPlatformSettings();
      setSettings(data.settings);
      setOptions(data.trialDayOptions);
      setWhatsapp(data.settings.supportWhatsApp || '');
      setCharge(String(data.settings.chargePerBuildingBdt ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = async (patch: {
    freeTrialEnabled?: boolean;
    freeTrialDays?: number;
    supportWhatsApp?: string;
    chargePerBuildingBdt?: number;
  }) => {
    setSaving(true);
    setError(null);
    try {
      const next = await updatePlatformSettings(patch);
      setSettings(next);
      if (patch.supportWhatsApp !== undefined) setWhatsapp(next.supportWhatsApp);
      if (patch.chargePerBuildingBdt !== undefined) {
        setCharge(String(next.chargePerBuildingBdt ?? 0));
      }
      showToast('Settings saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  const openWhatsAppPreview = () => {
    const digits = whatsapp.replace(/[^\d]/g, '');
    if (!digits) return;
    window.open(`https://wa.me/${digits}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Settings</h1>
          <p>Free trial, building charge (BDT), and support WhatsApp.</p>
        </div>
        <Button variant="outline" onClick={() => void load()}>
          Refresh
        </Button>
      </header>

      <div className="content">
        {error ? <div className="error-text">{error}</div> : null}
        {loading ? <div className="empty">Loading settings…</div> : null}

        {!loading && settings ? (
          <>
            <div
              className="panel panel-pad"
              style={{ background: 'var(--accent-soft)', borderColor: '#cfe8e2' }}
            >
              <h2 style={{ margin: '0 0 8px', fontFamily: 'var(--display)' }}>Free trial</h2>
              <p className="muted" style={{ margin: 0, maxWidth: 720 }}>
                Control whether new buildings can unlock the resident app for a limited time.
                Changing the length only affects buildings that claim the trial after you save.
              </p>
            </div>

            <div className="panel panel-pad">
              <div className="switch-row">
                <div>
                  <strong>Offer free trial</strong>
                  <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                    When off, locked buildings only see Contact Support.
                  </div>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.freeTrialEnabled)}
                    disabled={saving}
                    onChange={(e) => void persist({ freeTrialEnabled: e.target.checked })}
                  />
                  <span />
                </label>
              </div>
            </div>

            <div className="panel panel-pad stack">
              <div>
                <strong>Trial length</strong>
                <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                  Shown when building admins claim. Already-claimed trials keep their original days.
                </div>
              </div>
              <div className="chips">
                {options.map((opt) => {
                  const selected = settings.freeTrialDays === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`chip ${selected ? 'active' : ''}`}
                      disabled={saving}
                      onClick={() => {
                        if (!selected) void persist({ freeTrialDays: opt.value });
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="panel panel-pad stack">
              <div>
                <strong>Charge per building</strong>
                <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                  Amount in BDT (TK) used to estimate earnings on Overview — activated buildings ×
                  this charge.
                </div>
              </div>
              <Input
                label="Amount (BDT TK)"
                value={charge}
                onChange={(e) => setCharge(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="e.g. 1500"
                inputMode="numeric"
              />
              <div className="toolbar">
                <Button
                  loading={saving}
                  onClick={() => {
                    const amount = Number(charge);
                    if (!Number.isFinite(amount) || amount < 0) {
                      setError('Enter a valid charge amount in BDT');
                      return;
                    }
                    void persist({ chargePerBuildingBdt: amount });
                  }}
                >
                  Save charge
                </Button>
                {settings.chargePerBuildingBdt > 0 ? (
                  <span className="muted" style={{ fontSize: 13 }}>
                    Current · {settings.chargePerBuildingBdt.toLocaleString('en-BD')} TK / building
                  </span>
                ) : null}
              </div>
            </div>

            <div className="panel panel-pad stack">
              <div>
                <strong>Support WhatsApp</strong>
                <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                  Country code + number, no spaces. Used on the locked screen in the resident app.
                </div>
              </div>
              <Input
                label="WhatsApp number"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="8801XXXXXXXXX"
              />
              <div className="toolbar">
                <Button
                  loading={saving}
                  onClick={() => void persist({ supportWhatsApp: whatsapp.trim() })}
                >
                  Save number
                </Button>
                {whatsapp.replace(/[^\d]/g, '').length >= 8 ? (
                  <Button variant="outline" onClick={openWhatsAppPreview}>
                    Preview chat
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="hint-box">
              Activate individual buildings from the building detail page after payment. That does
              not rewrite a running free trial clock.
            </div>
          </>
        ) : null}
      </div>

      {toast ? <div className="toast">{toast}</div> : null}
    </>
  );
}
