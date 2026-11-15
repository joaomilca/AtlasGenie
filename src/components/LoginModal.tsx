import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { signInWithGoogle } from '../services/firebase';
import { useAuth, mapFirebaseAuthError } from '../context/AuthContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { t, i18n } = useTranslation();
  const { login, signup } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

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
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(mapFirebaseAuthError(err, i18n.language));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err?.message || t('auth.errGoogle'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-mono-tabular uppercase tracking-widest text-amber-700 dark:text-amber-400">
              {t('auth.cloudSyncKicker')}
            </p>
            <h2
              id="login-modal-title"
              className="font-serif-atlas text-xl font-bold text-slate-900 dark:text-white mt-0.5"
            >
              {isSignup ? t('auth.signupTitle') : t('auth.loginTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {t('toast.loginToSave')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('auth.modalCloseAria')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
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
          className="w-full py-2.5 px-4 text-xs font-semibold text-slate-900 dark:text-white bg-[#FAF6F0] dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          {t('auth.googleBtn')}
        </button>

        <div className="relative flex py-0.5 items-center">
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
          <span className="flex-shrink mx-3 text-xs text-slate-400">{t('auth.orEmail')}</span>
          <div className="flex-grow border-t border-slate-200 dark:border-slate-800" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {isSignup && (
            <div>
              <label htmlFor="modal-auth-name" className="block text-xs font-medium mb-1">
                {t('auth.name')}
              </label>
              <input
                id="modal-auth-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}

          <div>
            <label htmlFor="modal-auth-email" className="block text-xs font-medium mb-1">
              {t('auth.email')}
            </label>
            <input
              id="modal-auth-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label htmlFor="modal-auth-password" className="block text-xs font-medium mb-1">
              {t('auth.password')}
            </label>
            <input
              id="modal-auth-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-[#0F172A] dark:bg-amber-600 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {isSignup ? t('nav.signup') : t('nav.login')}
          </button>
        </form>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              setIsSignup((prev) => !prev);
              setError(null);
            }}
            className="font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 rounded"
          >
            {isSignup ? t('auth.alreadyHaveAccount') : t('auth.needAccount')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 rounded"
          >
            {t('support.cancelBtn')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default React.memo(LoginModal);
