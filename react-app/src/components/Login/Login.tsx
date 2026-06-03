import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getErrorMessage } from '../../utils/errorUtils';
import api from '../../services/api';
import styles from './Login.module.css';

const Login = () => {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequired, setOtpRequired] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const formData = new URLSearchParams();
      formData.append('username', account);
      formData.append('password', password);
      if (otp) formData.append('otp', otp);

      const response = await api.post('/auth/login', formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const { access_token, refresh_token } = response.data;
      await login(access_token, refresh_token);
      navigate('/');
    } catch (err: unknown) {
      // Backend signals "2FA needed" via 401 + detail "2FA code required" (and X-2FA-Required header).
      // Show the OTP field and let the user retry with their code.
      if (isAxiosError(err) && err.response?.status === 401) {
        const detail = err.response?.data?.detail;
        const headerFlag = err.response?.headers?.['x-2fa-required'];
        if (headerFlag === 'true' || (typeof detail === 'string' && detail.toLowerCase().includes('2fa'))) {
          setOtpRequired(true);
          setError(detail || '2FA code required');
          return;
        }
      }
      if (isAxiosError(err) && !err.response) {
        setError('Unable to reach backend API. Please confirm backend is running on port 8000.');
        return;
      }
      if (isAxiosError(err) && err.response?.status === 500) {
        const detail = err.response?.data?.detail;
        if (typeof detail === 'string' && detail.trim()) {
          setError(detail);
          return;
        }
      }
      setError(getErrorMessage(err, t('login.failed')));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.overlay} />
      <div className={styles.languageSelector}>
        <button
          className={`${styles.langButton} ${language === 'en' ? styles.active : ''}`}
          onClick={() => setLanguage('en')}
        >
          English
        </button>
        <button
          className={`${styles.langButton} ${language === 'zh' ? styles.active : ''}`}
          onClick={() => setLanguage('zh')}
        >
          中文
        </button>
      </div>
      <div className={styles.loginBox}>
        <h1 className={styles.title}>{t('login.welcome')}</h1>
        <p className={styles.subtitle}>{t('login.subtitle')}</p>
        {error && <div className={styles.error}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="email">{t('login.email')}</label>
            <input
              id="email"
              type="text"
              className={styles.input}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="admin or admin@example.com"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.label} htmlFor="password">{t('login.password')}</label>
            <input
              id="password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {otpRequired && (
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor="otp">2FA Code</label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className={styles.input}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                autoFocus
                required
              />
            </div>
          )}
          <button type="submit" className={styles.button} disabled={isSubmitting}>
            {isSubmitting ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
