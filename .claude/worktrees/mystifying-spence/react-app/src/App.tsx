import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
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
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Home />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/kpi"
          element={
            <PrivateRoute>
              <KPI />
            </PrivateRoute>
          }
        />
        <Route
          path="/iam"
          element={
            <PrivateRoute>
              <IAM />
            </PrivateRoute>
          }
        />
        <Route
          path="/followup"
          element={
            <PrivateRoute>
              <FollowUpIssue />
            </PrivateRoute>
          }
        />
        <Route
          path="/pqp"
          element={
            <PrivateRoute>
              <PQP />
            </PrivateRoute>
          }
        />
        <Route
          path="/itp"
          element={
            <PrivateRoute>
              <ITP />
            </PrivateRoute>
          }
        />
        <Route
          path="/itp/:id"
          element={
            <PrivateRoute>
              <ITPDetail />
            </PrivateRoute>
          }
        />
        <Route
          path="/noi"
          element={
            <PrivateRoute>
              <NOI />
            </PrivateRoute>
          }
        />
        <Route
          path="/contractors"
          element={
            <PrivateRoute>
              <Contractors />
            </PrivateRoute>
          }
        />
        <Route
          path="/km"
          element={
            <PrivateRoute>
              <KM />
            </PrivateRoute>
          }
        />
        <Route
          path="/osd"
          element={
            <PrivateRoute>
              <OSD />
            </PrivateRoute>
          }
        />
        <Route
          path="/obs"
          element={
            <PrivateRoute>
              <OBS />
            </PrivateRoute>
          }
        />
        <Route
          path="/ncr"
          element={
            <PrivateRoute>
              <NCR />
            </PrivateRoute>
          }
        />
        <Route
          path="/itr"
          element={
            <PrivateRoute>
              <ITR />
            </PrivateRoute>
          }
        />
        <Route
          path="/fat"
          element={
            <PrivateRoute>
              <FAT />
            </PrivateRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <PrivateRoute>
              <Audit />
            </PrivateRoute>
          }
        />
        <Route
          path="/owner-performance"
          element={
            <PrivateRoute>
              <OwnerPerformance />
            </PrivateRoute>
          }
        />
        <Route
          path="/document-naming-rules"
          element={
            <PrivateRoute>
              <DocumentNamingRules />
            </PrivateRoute>
          }
        />
        <Route
          path="/checklist"
          element={
            <PrivateRoute>
              <Checklist />
            </PrivateRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
