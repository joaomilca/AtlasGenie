/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useCallback, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { I18nProvider } from './i18n/I18nContext';
import { AuthProvider } from './context/AuthContext';
import { AtlasProvider } from './context/AtlasContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { ModalSuspenseFallback, TabViewSuspenseFallback } from './components/SuspenseFallback';
import { LandingPage } from './pages/LandingPage';
import { TripWizardPage } from './pages/TripWizardPage';
import { TripWorkspacePage } from './pages/TripWorkspacePage';

const SupportModal = lazy(() =>
  import('./components/SupportModal').then((m) => ({ default: m.SupportModal }))
);
const DemoHubPage = lazy(() =>
  import('./pages/DemoHubPage').then((m) => ({ default: m.DemoHubPage }))
);
const AuthPage = lazy(() =>
  import('./pages/AuthPage').then((m) => ({ default: m.AuthPage }))
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const JoinTripPage = lazy(() =>
  import('./pages/JoinTripPage').then((m) => ({ default: m.JoinTripPage }))
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
);

export default function App() {
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const handleOpenSupport = useCallback(() => setSupportModalOpen(true), []);
  const handleCloseSupport = useCallback(() => setSupportModalOpen(false), []);

  return (
    <I18nProvider>
      <AuthProvider>
        <AtlasProvider>
          <BrowserRouter>
            <div className="min-h-screen flex flex-col bg-[#FAF6F0] text-[#0F172A] dark:bg-[#0B1120] dark:text-[#F8FAFC] overflow-x-hidden">
              <Navbar />
              <div
                data-testid="main-scrollable-content"
                className="flex-1 w-full px-4 md:px-0 pb-24 md:pb-0"
              >
                <Suspense
                  fallback={
                    <div className="max-w-7xl mx-auto px-0 md:px-8 py-8">
                      <TabViewSuspenseFallback />
                    </div>
                  }
                >
                  <Routes>
                    <Route
                      path="/"
                      element={<LandingPage onOpenSupport={handleOpenSupport} />}
                    />
                    <Route path="/demo" element={<DemoHubPage />} />
                    <Route path="/login" element={<AuthPage />} />
                    <Route path="/signup" element={<AuthPage />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/trips/new" element={<TripWizardPage />} />
                    <Route path="/trips/:id" element={<TripWorkspacePage />} />
                    <Route path="/trips/:id/budget" element={<TripWorkspacePage />} />
                    <Route path="/trips/:id/group" element={<TripWorkspacePage />} />
                    <Route path="/trips/:id/expenses" element={<TripWorkspacePage />} />
                    <Route path="/join/:inviteCode" element={<JoinTripPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Suspense>
              </div>
              <Footer onOpenSupport={handleOpenSupport} />
              {supportModalOpen && (
                <Suspense fallback={<ModalSuspenseFallback />}>
                  <SupportModal
                    isOpen={supportModalOpen}
                    onClose={handleCloseSupport}
                  />
                </Suspense>
              )}
            </div>
          </BrowserRouter>
        </AtlasProvider>
      </AuthProvider>
    </I18nProvider>
  );
}
