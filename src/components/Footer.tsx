import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LifeBuoy, Compass, Github } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAtlas } from '../context/AtlasContext';

interface FooterProps {
  onOpenSupport: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onOpenSupport }) => {
  const { t } = useTranslation();
  const { showToast } = useAtlas();
  const location = useLocation();
  const navigate = useNavigate();

  const handleFaqClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (location.pathname !== '/') {
      navigate('/');
      setTimeout(() => {
        document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    } else {
      document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleGithubClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (navigator.clipboard) {
      navigator.clipboard.writeText('https://github.com/atlasgenie/atlasgenie').catch(() => {});
    }
    showToast(t('footer.githubToast'));
  };

  return (
    <footer className="print:hidden bg-[#0F172A] text-slate-300 border-t border-slate-800 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 pt-12 pb-24 md:py-14">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start lg:items-center justify-between pb-10 border-b border-slate-800/90">
          {/* Brand Wordmark & Short Tagline */}
          <div className="lg:col-span-5 space-y-2.5">
            <Link
              to="/"
              className="inline-flex items-center gap-2 font-serif-atlas text-2xl font-bold tracking-tight text-white hover:text-amber-400 transition-colors"
            >
              <Compass className="w-5 h-5 text-[#D97706]" />
              <span>AtlasGenie</span>
            </Link>
            <p className="text-sm text-slate-400 max-w-md leading-relaxed">
              {t('footer.tagline')}
            </p>
          </div>

          {/* Quick Navigation */}
          <nav
            aria-label={t('footer.quickNav')}
            className="lg:col-span-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm font-medium"
          >
            <Link
              to="/demo"
              className="text-slate-300 hover:text-amber-400 transition-colors whitespace-nowrap"
            >
              {t('footer.tryDemo')}
            </Link>
            <Link
              to="/dashboard"
              className="text-slate-300 hover:text-amber-400 transition-colors whitespace-nowrap"
            >
              {t('footer.dashboard')}
            </Link>
            <a
              href="#faq"
              onClick={handleFaqClick}
              className="text-slate-300 hover:text-amber-400 transition-colors whitespace-nowrap cursor-pointer"
            >
              {t('footer.faqs')}
            </a>
            <button
              type="button"
              onClick={handleGithubClick}
              className="inline-flex items-center gap-1.5 text-slate-300 hover:text-amber-400 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Github className="w-3.5 h-3.5" />
              <span>{t('footer.github')}</span>
            </button>
          </nav>

          {/* Primary CTA: Contact Support (opens In-Page Support Modal) */}
          <div className="lg:col-span-3 flex lg:justify-end">
            <button
              type="button"
              onClick={onOpenSupport}
              className="inline-flex items-center gap-2 px-5 py-3 text-xs sm:text-sm font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors shadow-sm whitespace-nowrap cursor-pointer"
            >
              <LifeBuoy className="w-4 h-4" />
              <span>{t('footer.contactBtn')}</span>
            </button>
          </div>
        </div>

        {/* Bottom Copyright & Trust Summary */}
        <div className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <p>{t('footer.copyright')}</p>
          <p className="font-mono-tabular text-slate-400">
            {t('footer.trustSummary')}
          </p>
        </div>
      </div>
    </footer>
  );
};
