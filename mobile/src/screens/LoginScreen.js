import React, { useState, useEffect } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, 
  StyleSheet, ScrollView, ActivityIndicator, Alert 
} from 'react-native';
import { 
  Shield, Mail, Lock, User, Heart, 
  Stethoscope, Building2, Fingerprint, ChevronRight, CheckCircle2 
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';
import { COLORS } from '../theme/colors';

export default function LoginScreen() {
  const { login, register, isBiometricSupported, authenticateBiometrics } = useAuth();

  const [isRegister, setIsRegister] = useState(false);
  const [role, setRole] = useState('patient'); // patient, doctor, clinic
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [clinicName, setClinicName] = useState('');
  const [loading, setLoading] = useState(false);

  // Patient vitals
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Male');
  const [bloodType, setBloodType] = useState('O+');
  const [phone, setPhone] = useState('');

  // Doctor specifics
  const [cadre, setCadre] = useState('doctor');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [specialization, setSpecialization] = useState('');

  // Active hospitals
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');

  useEffect(() => {
    apiRequest('/organizations/active')
      .then(data => {
        if (Array.isArray(data)) {
          setOrganizations(data);
          if (data.length > 0) setSelectedOrgId(data[0].id);
        }
      })
      .catch(err => console.warn('Could not load organizations:', err));
  }, []);

  const handleBiometricLogin = async () => {
    const success = await authenticateBiometrics();
    if (success) {
      // Biometrics succeeded
      Alert.alert('Unlocked', 'Biometric identity verified.');
    }
  };

  const handleSubmit = async () => {
    if (!email || !password) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      if (isRegister) {
        if (role === 'clinic') {
          await register({
            name: name || clinicName,
            email,
            password,
            role: 'clinic',
            clinicName
          });
        } else if (role === 'doctor') {
          const res = await register({
            name,
            email,
            password,
            role: 'doctor',
            organizationId: selectedOrgId,
            doctorProfile: {
              specialization,
              licenseNumber,
              cadre
            }
          });
          if (res?.pendingReview) {
            Alert.alert('Registration Submitted', res.message || 'Credentials under regulatory review.');
            setIsRegister(false);
            setLoading(false);
            return;
          }
        } else {
          // Patient
          await register({
            name,
            email,
            password,
            role: 'patient',
            organizationId: selectedOrgId,
            patientProfile: {
              age,
              gender,
              bloodType,
              phone
            }
          });
        }
      } else {
        await login(email, password);
      }
    } catch (err) {
      Alert.alert('Authentication Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* App Logo & Header */}
      <View style={styles.header}>
        <View style={styles.logoBadge}>
          <Shield size={32} color="#fff" />
        </View>
        <Text style={styles.appTitle}>BLOCKCHAIN HEALTH RECORDS</Text>
        <Text style={styles.appSubtitle}>
          {isRegister ? 'Create Decentralized Medical Identity' : 'Multi-Clinic Health & Ledger Portal'}
        </Text>
      </View>

      {/* Mode Switcher Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, !isRegister && styles.activeTab]}
          onPress={() => setIsRegister(false)}
        >
          <Text style={[styles.tabText, !isRegister && styles.activeTabText]}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, isRegister && styles.activeTab]}
          onPress={() => setIsRegister(true)}
        >
          <Text style={[styles.tabText, isRegister && styles.activeTabText]}>Register</Text>
        </TouchableOpacity>
      </View>

      {/* Role Picker (During Registration) */}
      {isRegister && (
        <View style={styles.rolePicker}>
          <TouchableOpacity
            style={[styles.roleBtn, role === 'patient' && styles.activeRoleBtn]}
            onPress={() => setRole('patient')}
          >
            <Heart size={14} color={role === 'patient' ? '#fff' : COLORS.textSecondary} />
            <Text style={[styles.roleBtnText, role === 'patient' && styles.activeRoleText]}>Patient</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleBtn, role === 'doctor' && styles.activeRoleBtn]}
            onPress={() => setRole('doctor')}
          >
            <Stethoscope size={14} color={role === 'doctor' ? '#fff' : COLORS.textSecondary} />
            <Text style={[styles.roleBtnText, role === 'doctor' && styles.activeRoleText]}>Doctor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleBtn, role === 'clinic' && styles.activeRoleBtn]}
            onPress={() => setRole('clinic')}
          >
            <Building2 size={14} color={role === 'clinic' ? '#fff' : COLORS.textSecondary} />
            <Text style={[styles.roleBtnText, role === 'clinic' && styles.activeRoleText]}>Clinic</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Form Fields */}
      <View style={styles.form}>
        {isRegister && role === 'clinic' && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Clinic / Hospital Name</Text>
            <View style={styles.inputWrapper}>
              <Building2 size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Nairobi Health Centre"
                placeholderTextColor={COLORS.textMuted}
                value={clinicName}
                onChangeText={setClinicName}
              />
            </View>
          </View>
        )}

        {isRegister && (
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>{role === 'clinic' ? 'Admin Full Name' : 'Full Name'}</Text>
            <View style={styles.inputWrapper}>
              <User size={18} color={COLORS.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="e.g. Jane Doe"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
              />
            </View>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Email Address</Text>
          <View style={styles.inputWrapper}>
            <Mail size={18} color={COLORS.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="e.g. jane.doe@example.com"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.inputWrapper}>
            <Lock size={18} color={COLORS.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={COLORS.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>
        </View>

        {/* Doctor specific registration fields */}
        {isRegister && role === 'doctor' && (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Medical Board License Number</Text>
              <View style={styles.inputWrapper}>
                <Stethoscope size={18} color={COLORS.textMuted} />
                <TextInput
                  style={styles.input}
                  placeholder="e.g. A12345 (KMPDC) or 594079 (NCK)"
                  placeholderTextColor={COLORS.textMuted}
                  value={licenseNumber}
                  onChangeText={setLicenseNumber}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Specialization</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. General Practice / Cardiology"
                  placeholderTextColor={COLORS.textMuted}
                  value={specialization}
                  onChangeText={setSpecialization}
                />
              </View>
            </View>
          </>
        )}

        {/* Patient specific registration fields */}
        {isRegister && role === 'patient' && (
          <>
            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
                <Text style={styles.inputLabel}>Age</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. 32"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="numeric"
                    value={age}
                    onChangeText={setAge}
                  />
                </View>
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
                <Text style={styles.inputLabel}>Blood Group</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. O+, A-, B+"
                    placeholderTextColor={COLORS.textMuted}
                    value={bloodType}
                    onChangeText={setBloodType}
                  />
                </View>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Phone Number</Text>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. +254 700 000000"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>
            </View>
          </>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>
                {isRegister ? 'Complete Registration' : 'Sign In with Blockchain'}
              </Text>
              <ChevronRight size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>

        {/* Biometrics Option */}
        {!isRegister && isBiometricSupported && (
          <TouchableOpacity
            style={styles.biometricButton}
            onPress={handleBiometricLogin}
          >
            <Fingerprint size={20} color={COLORS.accent} />
            <Text style={styles.biometricText}>Quick Unlock with Face ID / Touch ID</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  content: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40
  },
  header: {
    alignItems: 'center',
    marginBottom: 28
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8
  },
  appTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 1,
    textAlign: 'center'
  },
  appSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'center'
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8
  },
  activeTab: {
    backgroundColor: COLORS.primary
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary
  },
  activeTabText: {
    color: '#fff'
  },
  rolePicker: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    paddingVertical: 9,
    borderRadius: 8
  },
  activeRoleBtn: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary
  },
  roleBtnText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600'
  },
  activeRoleText: {
    color: '#fff'
  },
  form: {
    gap: 16
  },
  inputGroup: {
    gap: 6
  },
  rowInputs: {
    flexDirection: 'row'
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 10,
    minHeight: 46
  },
  input: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
    paddingVertical: 10
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.accentGlow,
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
    borderRadius: 10,
    paddingVertical: 12
  },
  biometricText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600'
  }
});
