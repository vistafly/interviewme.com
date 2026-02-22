import { useState, lazy, Suspense } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';

const SetupPage = lazy(() => import('./pages/SetupPage'));
const InterviewPage = lazy(() => import('./pages/InterviewPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));

export default function App() {
  const [page, setPage] = useState('landing');
  const [questions, setQuestions] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');

  return (
    <AuthProvider>
      {page === 'landing' && (
        <LandingPage onStart={() => setPage('setup')} onAnalytics={() => setPage('analytics')} />
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
          <AnalyticsPage onBack={() => setPage('landing')} />
        </Suspense>
      )}
    </AuthProvider>
  );
}
