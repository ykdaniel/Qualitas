import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from './context/AuthContext';
import { AppProviders } from './components/Shared/AppProviders';
import './App.css';

// --- Lazy loaded components ---
const Login = React.lazy(() => import('./components/Login/Login'));
const Home = React.lazy(() => import('./components/Home/Home'));
const Dashboard = React.lazy(() => import('./components/Dashboard/Dashboard'));
const IAM = React.lazy(() => import('./components/IAM/IAM'));
const ITP = React.lazy(() => import('./components/ITP/ITP'));
const ITPDetail = React.lazy(() => import('./components/ITP/ITPDetail'));
const NOI = React.lazy(() => import('./components/NOI/NOI'));
const Contractors = React.lazy(() => import('./components/Contractors/Contractors'));
const KM = React.lazy(() => import('./components/KM/KM'));
const OBS = React.lazy(() => import('./components/OBS/OBS'));
const NCR = React.lazy(() => import('./components/NCR/NCR'));
const ITR = React.lazy(() => import('./components/ITR/ITR'));
const FAT = React.lazy(() => import('./components/FAT/FAT'));
const Audit = React.lazy(() => import('./components/Audit/Audit'));
const OwnerPerformance = React.lazy(() => import('./components/OwnerPerformance/OwnerPerformance'));
const FollowUpIssue = React.lazy(() => import('./components/FollowUpIssue/FollowUpIssue'));
const PQP = React.lazy(() => import('./components/PQP/PQP'));
const KPI = React.lazy(() => import('./components/KPI/KPI'));
const DocumentNamingRules = React.lazy(() => import('./components/DocumentNamingRules/DocumentNamingRules'));
const OSD = React.lazy(() => import('./components/OSD/OSD'));
const Checklist = React.lazy(() => import('./components/Checklist/Checklist'));

// --- Loading fallback ---
const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
    <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(0,0,0,0.1)', borderTopColor: '#0056b3', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
    <div style={{ color: '#555', fontFamily: 'sans-serif' }}>載入中...</div>
  </div>
);

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Protected Routes with Data Providers */}
          <Route element={
            <PrivateRoute>
              <AppProviders>
                <Outlet />
              </AppProviders>
            </PrivateRoute>
          }>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/kpi" element={<KPI />} />
            <Route path="/iam" element={<IAM />} />
            <Route path="/followup" element={<FollowUpIssue />} />
            <Route path="/pqp" element={<PQP />} />
            <Route path="/itp" element={<ITP />} />
            <Route path="/itp/:id" element={<ITPDetail />} />
            <Route path="/noi" element={<NOI />} />
            <Route path="/contractors" element={<Contractors />} />
            <Route path="/km" element={<KM />} />
            <Route path="/osd" element={<OSD />} />
            <Route path="/obs" element={<OBS />} />
            <Route path="/ncr" element={<NCR />} />
            <Route path="/itr" element={<ITR />} />
            <Route path="/fat" element={<FAT />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/owner-performance" element={<OwnerPerformance />} />
            <Route path="/document-naming-rules" element={<DocumentNamingRules />} />
            <Route path="/checklist" element={<Checklist />} />
          </Route>
        </Routes>
      </Suspense>
      <Toaster position="top-center" richColors />
    </BrowserRouter>
  );
}

export default App;
