import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { getErrorMessage } from '../../utils/errorUtils';
import api from '../../services/api';
import styles from './Login.module.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      formData.append('username', email);
      formData.append('password', password);

      // SECURITY: Backend sets httpOnly cookie with token
      // No tokens are returned in response body
      const response = await api.post('/auth/login', formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        withCredentials: true  // Important: Send cookies with request
      });

      if (response.data && response.data.message === 'Login successful') {
        // Login updates auth state and fetches user profile
        // Token is already in httpOnly cookie
        await login();
        navigate('/');
      }
    } catch (err: unknown) {
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
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
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
          <button type="submit" className={styles.button} disabled={isSubmitting}>
            {isSubmitting ? t('login.signingIn') : t('login.signIn')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
