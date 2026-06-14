import { useEffect } from 'react';
import LoginScreen from './login';
import { useAuthStore } from '../../store/authStore';

export default function LockScreen() {
  const { checkSetup } = useAuthStore();
  
  useEffect(() => {
    checkSetup();
  }, []);
  
  return <LoginScreen />;
}