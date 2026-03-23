import { useAuth } from '../contexts/AuthContext';

// Client-side admin check — just controls UI visibility.
// Actual authorization is enforced server-side by requireAdmin().
const ADMIN_UIDS = new Set([
  'hG1iPcM4Y4afU2BZJebNVlezRgH3',
]);

export function useAdminStatus() {
  const { user } = useAuth();
  return ADMIN_UIDS.has(user?.uid);
}
