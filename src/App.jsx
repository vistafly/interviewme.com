import { useState, lazy, Suspense } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import SplashScreen from './components/SplashScreen';
import { useAdminStatus } from './hooks/useAdminStatus';

const SetupPage = lazy(() => import('./pages/SetupPage'));
const InterviewPage = lazy(() => import('./pages/InterviewPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

function AppContent() {
  const [page, setPage] = useState('landing');
  const [questions, setQuestions] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [splashDone, setSplashDone] = useState(false);
  const isAdmin = useAdminStatus();

  return (
    <>
      {!splashDone && <SplashScreen onComplete={() => setSplashDone(true)} />}

      {page === 'landing' && (
        <LandingPage
          onStart={() => setPage('setup')}
          onAnalytics={() => setPage('analytics')}
          onAdmin={isAdmin ? () => setPage('admin') : null}
        />
      )}
      {page === 'setup' && (
        <Suspense fallback={null}>
          <SetupPage
            onBack={() => setPage('landing')}
            onReady={(qs, co, jt) => {
              setQuestions(qs);
              setCompanyName(co);
              setJobTitle(jt);
              setPage('interview');
            }}
          />
        </Suspense>
      )}
      {page === 'interview' && (
        <Suspense fallback={null}>
          <InterviewPage
            questions={questions}
            company={companyName}
            jobTitle={jobTitle}
            onExit={() => setPage('landing')}
          />
        </Suspense>
      )}
      {page === 'analytics' && (
        <Suspense fallback={null}>
          <AnalyticsPage
            onBack={() => setPage('landing')}
            onAdmin={isAdmin ? () => setPage('admin') : null}
          />
        </Suspense>
      )}
      {page === 'admin' && (
        <Suspense fallback={null}>
          <AdminPage onBack={() => setPage('analytics')} />
        </Suspense>
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
