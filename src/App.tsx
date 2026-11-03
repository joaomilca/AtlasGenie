/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { I18nProvider } from './i18n/I18nContext';
import { AtlasProvider } from './context/AtlasContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { SupportModal } from './components/SupportModal';
import { LandingPage } from './pages/LandingPage';
import { DemoHubPage } from './pages/DemoHubPage';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { TripWizardPage } from './pages/TripWizardPage';
import { TripWorkspacePage } from './pages/TripWorkspacePage';
import { JoinTripPage } from './pages/JoinTripPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  const [supportModalOpen, setSupportModalOpen] = useState(false);

  return (
    <I18nProvider>
      <AtlasProvider>
        <BrowserRouter>
          <div className="min-h-screen flex flex-col bg-[#FAF6F0] text-[#0F172A] dark:bg-[#0B1120] dark:text-[#F8FAFC]">
            <Navbar />
            <div className="flex-1">
              <Routes>
                <Route
                  path="/"
                  element={<LandingPage onOpenSupport={() => setSupportModalOpen(true)} />}
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
            </div>
            <Footer onOpenSupport={() => setSupportModalOpen(true)} />
            <SupportModal
              isOpen={supportModalOpen}
              onClose={() => setSupportModalOpen(false)}
            />
          </div>
        </BrowserRouter>
      </AtlasProvider>
    </I18nProvider>
  );
}
