import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from './context/AuthContext';
import { AppProviders } from './components/Shared/AppProviders';
import Login from './components/Login/Login';
import Home from './components/Home/Home';
import Dashboard from './components/Dashboard/Dashboard';
import IAM from './components/IAM/IAM';
import ITP from './components/ITP/ITP';
import ITPDetail from './components/ITP/ITPDetail';
import NOI from './components/NOI/NOI';
import Contractors from './components/Contractors/Contractors';
import KM from './components/KM/KM';
import OBS from './components/OBS/OBS';
import NCR from './components/NCR/NCR';
import ITR from './components/ITR/ITR';
import FAT from './components/FAT/FAT';
import Audit from './components/Audit/Audit';
import OwnerPerformance from './components/OwnerPerformance/OwnerPerformance';
import FollowUpIssue from './components/FollowUpIssue/FollowUpIssue';
import PQP from './components/PQP/PQP';
import KPI from './components/KPI/KPI';
import DocumentNamingRules from './components/DocumentNamingRules/DocumentNamingRules';
import OSD from './components/OSD/OSD';
import Checklist from './components/Checklist/Checklist';
import './App.css';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

function App() {
  return (
    <BrowserRouter>
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
      <Toaster position="top-center" richColors />
    </BrowserRouter>
  );
}

export default App;
