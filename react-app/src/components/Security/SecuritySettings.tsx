import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import shellStyles from '../Shared/ModuleShell.module.css';

interface SetupResponse {
  secret: string;
  provisioning_uri: string;
  qr_data_url: string;
}

const SecuritySettings: React.FC = () => {
  const [twoFAEnabled, setTwoFAEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [enrollOtp, setEnrollOtp] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [disableOtp, setDisableOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/auth/2fa/status');
      setTwoFAEnabled(res.data.enabled);
    } catch {
      setTwoFAEnabled(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const startSetup = async () => {
    setLoading(true);
    try {
      const res = await api.post<SetupResponse>('/auth/2fa/setup');
      setSetup(res.data);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to start 2FA setup');
    } finally {
      setLoading(false);
    }
  };

  const enable = async () => {
    if (!enrollOtp || enrollOtp.length < 6) { toast.error('Enter the 6-digit code'); return; }
    setLoading(true);
    try {
      await api.post('/auth/2fa/enable', { otp: enrollOtp });
      toast.success('2FA enabled');
      setSetup(null);
      setEnrollOtp('');
      fetchStatus();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to enable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    if (!disablePassword || !disableOtp) { toast.error('Password and 2FA code both required'); return; }
    setLoading(true);
    try {
      await api.post('/auth/2fa/disable', { password: disablePassword, otp: disableOtp });
      toast.success('2FA disabled');
      setDisablePassword('');
      setDisableOtp('');
      fetchStatus();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const logoutEverywhere = async () => {
    if (!window.confirm('Sign out of every device including this one?')) return;
    try {
      await api.post('/auth/logout-all');
      toast.success('Signed out everywhere');
      window.location.href = '/login';
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Failed');
    }
  };

  return (
    <div className={shellStyles.container} style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#2d2a24', margin: '0 0 24px' }}>
        Security Settings
      </h1>

      <section style={{ background: '#fff', border: '1px solid rgba(184,148,90,0.22)', borderRadius: 12, padding: 22, marginBottom: 18 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2d2a24', marginTop: 0 }}>
          Two-Factor Authentication (TOTP)
        </h2>
        {twoFAEnabled === null ? <p style={{ color: '#8b8275' }}>Loading…</p> : null}

        {twoFAEnabled === false && !setup && (
          <>
            <p style={{ color: '#4a4238', fontSize: 14 }}>
              Add a second authentication factor using an app like Google Authenticator, Authy, or 1Password.
            </p>
            <button onClick={startSetup} disabled={loading} style={btnPrimary}>
              {loading ? '…' : 'Enable 2FA'}
            </button>
          </>
        )}

        {twoFAEnabled === false && setup && (
          <>
            <p style={{ color: '#4a4238', fontSize: 14 }}>
              Scan the QR code with your authenticator app, then enter the 6-digit code below.
            </p>
            <img src={setup.qr_data_url} alt="2FA QR code" style={{ width: 200, height: 200, display: 'block', margin: '12px 0' }} />
            <p style={{ fontSize: 12, color: '#8b8275', wordBreak: 'break-all' }}>
              Manual entry secret: <code style={{ background: '#faf7f1', padding: '2px 6px', borderRadius: 4 }}>{setup.secret}</code>
            </p>
            <input
              type="text" inputMode="numeric" maxLength={6} placeholder="123456"
              value={enrollOtp} onChange={(e) => setEnrollOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={input}
            />
            <button onClick={enable} disabled={loading || enrollOtp.length < 6} style={btnPrimary}>
              Confirm and enable
            </button>
            <button onClick={() => setSetup(null)} disabled={loading} style={btnSecondary}>
              Cancel
            </button>
          </>
        )}

        {twoFAEnabled === true && (
          <>
            <p style={{ color: '#4a8543', fontSize: 14, fontWeight: 600 }}>✓ 2FA is currently enabled.</p>
            <p style={{ color: '#4a4238', fontSize: 14 }}>To turn off 2FA, confirm with your password and a current 2FA code:</p>
            <input
              type="password" placeholder="Current password" value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)} style={input}
            />
            <input
              type="text" inputMode="numeric" maxLength={6} placeholder="2FA code"
              value={disableOtp} onChange={(e) => setDisableOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={input}
            />
            <button onClick={disable} disabled={loading} style={btnDanger}>Disable 2FA</button>
          </>
        )}
      </section>

      <section style={{ background: '#fff', border: '1px solid rgba(184,148,90,0.22)', borderRadius: 12, padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: '#2d2a24', marginTop: 0 }}>Sign out of all devices</h2>
        <p style={{ color: '#4a4238', fontSize: 14 }}>
          If you suspect your account was accessed from a device you don't recognize, sign out everywhere. You'll be logged out of this browser and any other active session.
        </p>
        <button onClick={logoutEverywhere} style={btnDanger}>Sign out everywhere</button>
      </section>
    </div>
  );
};

const input: React.CSSProperties = {
  display: 'block', width: '100%', maxWidth: 280, padding: '10px 12px',
  border: '1px solid rgba(184,148,90,0.32)', borderRadius: 8, marginBottom: 10,
  fontSize: 14,
};
const btnBase: React.CSSProperties = {
  padding: '10px 18px', fontSize: 14, fontWeight: 600, border: 'none',
  borderRadius: 8, cursor: 'pointer', marginRight: 8,
};
const btnPrimary: React.CSSProperties = {
  ...btnBase, background: 'linear-gradient(135deg, #b8945a 0%, #8a6a3a 100%)', color: '#faf7f1',
};
const btnSecondary: React.CSSProperties = {
  ...btnBase, background: '#faf7f1', color: '#4a4238', border: '1px solid rgba(184,148,90,0.32)',
};
const btnDanger: React.CSSProperties = {
  ...btnBase, background: '#b91c1c', color: '#fff',
};

export default SecuritySettings;
