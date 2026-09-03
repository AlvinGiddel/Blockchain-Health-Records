import React, { createContext, useState, useEffect, useContext } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { apiRequest } from '../api/client';
import { 
  saveAuthToken, getAuthToken, 
  saveUserProfile, getUserProfile, 
  clearVault 
} from '../storage/secureVault';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);

  // Check hardware biometrics availability and restore session
  useEffect(() => {
    async function initSession() {
      try {
        const compatible = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        setIsBiometricSupported(compatible && enrolled);

        const token = await getAuthToken();
        const savedProfile = await getUserProfile();

        if (token && savedProfile) {
          setUser(savedProfile);
        }
      } catch (err) {
        console.error('[AuthContext] Init error:', err);
      } finally {
        setLoading(false);
      }
    }
    initSession();
  }, []);

  // Biometric prompt for quick unlock
  const authenticateBiometrics = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Blockchain Health Records',
        fallbackLabel: 'Enter Password'
      });
      return result.success;
    } catch (err) {
      console.warn('[AuthContext] Biometric error:', err);
      return false;
    }
  };

  const login = async (email, password) => {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), password })
    });

    if (res.token && res.user) {
      await saveAuthToken(res.token);
      await saveUserProfile(res.user);
      setUser(res.user);
      return res.user;
    } else {
      throw new Error(res.error || 'Login failed.');
    }
  };

  const register = async (userData) => {
    const res = await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });

    if (res.token && res.user) {
      await saveAuthToken(res.token);
      await saveUserProfile(res.user);
      setUser(res.user);
      return res.user;
    } else if (res.pendingReview) {
      return { pendingReview: true, message: res.message };
    } else {
      throw new Error(res.error || 'Registration failed.');
    }
  };

  const logout = async () => {
    await clearVault();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      register,
      logout,
      isBiometricSupported,
      authenticateBiometrics
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
