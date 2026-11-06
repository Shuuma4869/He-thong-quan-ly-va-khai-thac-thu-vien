import { AppProviders } from '../providers/AppProviders';
import { AppearanceProvider } from '../../features/appearance/AppearanceProvider';
import { useAuth } from '../../features/auth/auth-context';
import { UnsavedChangesProvider } from '../../shared/navigation/UnsavedChangesProvider';
import { AppRouter } from './AppRouter';

function SessionRoutes() {
  const { user } = useAuth();
  return <UnsavedChangesProvider key={user?.id ?? 'guest'} enabled={!!user}>
    <AppRouter/>
  </UnsavedChangesProvider>;
}

export function Application() {
  return <AppProviders><AppearanceProvider><SessionRoutes/></AppearanceProvider></AppProviders>;
}
