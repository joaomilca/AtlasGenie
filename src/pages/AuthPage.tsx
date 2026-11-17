import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  resetUserPassword,
  signInWithGoogle,
} from '../services/firebase';
import { useAtlas } from '../context/AtlasContext';
import { useAuth, formatCleanAuthOrFirestoreError } from '../context/AuthContext';

export const AuthPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { enableDemoMode, showToast } = useAtlas();
  const { login, signup } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isSignup = location.pathname === '/signup';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isSignup) {
        await signup(email, password);
      } else {
        await login(email, password);
      }
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(formatCleanAuthOrFirestoreError(err, i18n.language));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      navigate('/dashboard');
    } catch (err: unknown) {
      const cleanMsg = formatCleanAuthOrFirestoreError(err, i18n.language);
      setError(cleanMsg);
      showToast(cleanMsg, 'alert');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email.includes('@')) {
      setError(t('auth.errResetEmail'));
      return;
    }
    try {
      await resetUserPassword(email);
      showToast(t('auth.resetSent'));
    } catch (err: any) {
      setError(err?.message || t('auth.errFailed'));
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 py-14">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="font-serif-atlas text-2xl font-bold text-slate-900 dark:text-white">
            {isSignup ? t('auth.signupTitle') : t('auth.loginTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('auth.subtitle')}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full py-2.5 px-4 text-xs font-semibold text-slate-900 dark:text-white bg-[#FAF6F0] dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
        >
          {t('auth.googleBtn')}
        </button>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
          <span className="flex-shrink mx-3 text-xs text-slate-400">{t('auth.orEmail')}</span>
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignup && (
            <div>
              <label htmlFor="auth-name" className="block text-xs font-medium mb-1">
                {t('auth.name')}
              </label>
              <input
                id="auth-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-medium mb-1">
              {t('auth.email')}
            </label>
            <input
              id="auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-medium mb-1">
              {t('auth.password')}
            </label>
            <input
              id="auth-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            {isSignup ? t('nav.signup') : t('nav.login')}
          </button>
        </form>

        {!isSignup && (
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline cursor-pointer"
          >
            {t('auth.resetPassword')}
          </button>
        )}

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <Link
            to={isSignup ? '/login' : '/signup'}
            className="font-semibold text-amber-700 dark:text-amber-400 hover:underline"
          >
            {isSignup ? t('auth.alreadyHaveAccount') : t('auth.needAccount')}
          </Link>
          <button
            type="button"
            onClick={() => {
              enableDemoMode();
              navigate('/demo');
            }}
            className="text-teal-700 dark:text-teal-400 font-medium hover:underline cursor-pointer"
          >
            {t('auth.orContinueDemo')}
          </button>
        </div>
      </div>
    </main>
  );
};
