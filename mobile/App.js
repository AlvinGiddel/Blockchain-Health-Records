import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { COLORS } from './src/theme/colors';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import PatientDashboard from './src/screens/PatientDashboard';
import DoctorDashboard from './src/screens/DoctorDashboard';
import LicenseRenewalScreen from './src/screens/LicenseRenewalScreen';

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Not authenticated -> show Login / Register
  if (!user) {
    return <LoginScreen />;
  }

  // Authenticated -> Role-based navigation
  switch (user.role) {
    case 'doctor':
      return <DoctorDashboard />;
    case 'admin':
    case 'clinic':
    case 'super_admin':
      return <LicenseRenewalScreen />;
    case 'patient':
    default:
      return <PatientDashboard />;
  }
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
