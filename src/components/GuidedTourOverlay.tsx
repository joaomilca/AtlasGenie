import React, { useEffect, useState, useCallback } from 'react';
import { Sparkles, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface TourStep {
  targetSelector: string;
  title: string;
  body: string;
}

interface GuidedTourOverlayProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuidedTourOverlay: React.FC<GuidedTourOverlayProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const steps: TourStep[] = [
    {
      targetSelector: '[data-tour="trust-badges"]',
      title: t('tour.step1Title'),
      body: t('tour.step1Body'),
    },
    {
      targetSelector: '[data-tour="vibe-slider"]',
      title: t('tour.step2Title'),
      body: t('tour.step2Body'),
    },
    {
      targetSelector: '[data-tour="plan-b"]',
      title: t('tour.step3Title'),
      body: t('tour.step3Body'),
    },
    {
      targetSelector: '[data-tour="workspace-tabs"]',
      title: t('tour.step4Title'),
      body: t('tour.step4Body'),
    },
  ];

  const updateHighlightRect = useCallback(() => {
    if (!isOpen) return;
    const step = steps[currentStep];
    if (!step) return;
    const el = document.querySelector(step.targetSelector) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep, steps.length]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      return;
    }
    updateHighlightRect();
    const timer = setTimeout(updateHighlightRect, 250);
    window.addEventListener('resize', updateHighlightRect);
    window.addEventListener('scroll', updateHighlightRect, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateHighlightRect);
      window.removeEventListener('scroll', updateHighlightRect, true);
    };
  }, [isOpen, currentStep, updateHighlightRect]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        if (currentStep < steps.length - 1) setCurrentStep((s) => s + 1);
        else onClose();
      } else if (e.key === 'ArrowLeft' && currentStep > 0) {
        setCurrentStep((s) => s - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentStep, steps.length, onClose]);

  if (!isOpen) return null;

  const activeStep = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  // Position tooltip card near the target element while keeping it inside viewport bounds
  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;

  let tooltipTop = viewportH / 2 - 110;
  let tooltipLeft = Math.max(16, viewportW / 2 - 180);

  if (targetRect && targetRect.width > 0) {
    const spaceBelow = viewportH - targetRect.bottom;
    if (spaceBelow > 210) {
      tooltipTop = Math.min(viewportH - 210, targetRect.bottom + 14);
    } else {
      tooltipTop = Math.max(16, targetRect.top - 195);
    }
    tooltipLeft = Math.min(
      Math.max(16, targetRect.left),
      Math.max(16, viewportW - 380)
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guided-tour-title"
      data-testid="guided-tour-overlay"
      className="fixed inset-0 z-50 print:hidden"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-950/55 backdrop-blur-[1px] transition-opacity"
      />

      {/* Spotlight Ring around Target Element */}
      {targetRect && targetRect.width > 0 && (
        <div
          aria-hidden="true"
          style={{
            top: Math.max(4, targetRect.top - 6),
            left: Math.max(4, targetRect.left - 6),
            width: targetRect.width + 12,
            height: targetRect.height + 12,
          }}
          className="fixed z-50 pointer-events-none rounded-xl border-2 border-[#D97706] shadow-[0_0_0_4px_rgba(217,119,6,0.28)] transition-all duration-300"
        />
      )}

      {/* Tooltip Card */}
      <div
        style={{
          top: tooltipTop,
          left: tooltipLeft,
        }}
        className="fixed z-50 w-[calc(100vw-2rem)] max-w-[360px] rounded-2xl bg-[#0F172A] text-white border border-amber-500/60 shadow-2xl p-5 space-y-4 transition-all duration-300"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-[#D97706] text-white">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span className="text-[11px] font-mono-tabular uppercase tracking-wider text-amber-400">
              {t('tour.stepCounter', { current: currentStep + 1, total: steps.length })}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('tour.skipBtn')}
            className="text-slate-400 hover:text-white p-1 rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <h3 id="guided-tour-title" className="font-serif-atlas text-lg font-bold text-white">
            {activeStep.title}
          </h3>
          <p className="text-sm text-slate-200 leading-relaxed">{activeStep.body}</p>
        </div>

        {/* Step Dots + Controls */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-slate-400 hover:text-white cursor-pointer"
          >
            {t('tour.skipBtn')}
          </button>

          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => prev - 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>{t('tour.prevBtn')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (isLastStep) {
                  onClose();
                } else {
                  setCurrentStep((prev) => prev + 1);
                }
              }}
              className="inline-flex items-center gap-1 px-4 py-1.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-amber-600 rounded-lg transition-colors cursor-pointer"
            >
              <span>{isLastStep ? t('tour.finishBtn') : t('tour.nextBtn')}</span>
              {!isLastStep && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
