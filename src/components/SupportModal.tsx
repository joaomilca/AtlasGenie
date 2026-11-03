import React, { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAtlas } from '../context/AtlasContext';

interface SupportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupportModal: React.FC<SupportModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { showToast, currentUser } = useAtlas();

  const [name, setName] = useState(currentUser?.displayName || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [issueType, setIssueType] = useState('general');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (currentUser) {
      if (!name && currentUser.displayName) setName(currentUser.displayName);
      if (!email && currentUser.email) setEmail(currentUser.email);
    }
  }, [currentUser, name, email]);

  // Accessibility: Press ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    showToast(t('support.successToast'));
    setMessage('');
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-[#FAF6F0] dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden transition-all duration-200 scale-100 opacity-100"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div>
            <p className="text-[11px] font-mono-tabular uppercase tracking-wider text-amber-700 dark:text-amber-400">
              {t('support.kicker')}
            </p>
            <h2
              id="support-modal-title"
              className="font-serif-atlas text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-0.5"
            >
              {t('support.modalTitle')}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              {t('support.modalSub')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('support.closeAria')}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Contact Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="support-name-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {t('support.nameLabel')}
              </label>
              <input
                id="support-name-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('support.namePlaceholder')}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label
                htmlFor="support-email-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {t('support.emailLabel')}
              </label>
              <input
                id="support-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('support.emailPlaceholder')}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="support-issue-select"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t('support.issueLabel')}
            </label>
            <select
              id="support-issue-select"
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="general">{t('support.issueGeneral')}</option>
              <option value="trust">{t('support.issueTrust')}</option>
              <option value="group">{t('support.issueGroup')}</option>
              <option value="bug">{t('support.issueBug')}</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="support-message-textarea"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t('support.messageLabel')}
            </label>
            <textarea
              id="support-message-textarea"
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('support.messagePlaceholder')}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {t('support.cancelBtn')}
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t('support.sendBtn')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
