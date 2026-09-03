import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  TextInput, ActivityIndicator, Alert 
} from 'react-native';
import { 
  Stethoscope, QrCode, LogOut, PlusCircle, 
  ShieldCheck, CheckCircle2, User, Building2 
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';
import { COLORS } from '../theme/colors';
import QRScannerModal from '../components/QRScannerModal';

export default function DoctorDashboard() {
  const { user, logout } = useAuth();
  const [showScanner, setShowScanner] = useState(false);
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);

  // New consultation state
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedPatientName, setSelectedPatientName] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatment, setTreatment] = useState('');
  const [prescriptions, setPrescriptions] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    setLoadingPatients(true);
    try {
      const data = await apiRequest('/users/patients');
      if (Array.isArray(data)) {
        setPatients(data);
      }
    } catch (err) {
      console.warn('Could not fetch patients:', err);
    } finally {
      setLoadingPatients(false);
    }
  };

  const handleQRScanned = (scannedData) => {
    if (scannedData?.patientId) {
      setSelectedPatientId(scannedData.patientId);
      setSelectedPatientName(scannedData.name || 'Scanned Patient');
      Alert.alert(
        'Patient Verified', 
        `Loaded attested passport for: ${scannedData.name}\nBlood Group: ${scannedData.bloodType || 'N/A'}`
      );
    } else if (scannedData?.rawHash) {
      Alert.alert('Raw QR Hash', `Scanned hash: ${scannedData.rawHash.substring(0, 20)}...`);
    }
  };

  const handleCreateRecord = async () => {
    if (!selectedPatientId || !diagnosis.trim()) {
      Alert.alert('Missing Details', 'Please select or scan a patient, and enter clinical findings.');
      return;
    }

    setSubmitting(true);
    try {
      const rxArray = prescriptions.trim() 
        ? prescriptions.split('\n').filter(Boolean) 
        : [];

      await apiRequest('/records', {
        method: 'POST',
        body: JSON.stringify({
          patient_id: selectedPatientId,
          diagnosis: diagnosis.trim(),
          treatment: treatment.trim(),
          prescriptions: rxArray,
          record_type: 'medical'
        })
      });

      Alert.alert('Record Sealed', 'Cryptographic encounter signed and mined into blockchain ledger.');
      setDiagnosis('');
      setTreatment('');
      setPrescriptions('');
      setSelectedPatientId('');
      setSelectedPatientName('');
    } catch (err) {
      Alert.alert('Submission Error', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <View>
          <Text style={styles.greeting}>Attending Practitioner</Text>
          <Text style={styles.userName}>Dr. {user?.name || 'Physician'}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <LogOut size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        {/* Hospital & Board License Badge */}
        <View style={styles.licenseCard}>
          <View style={styles.licenseRow}>
            <Building2 size={16} color={COLORS.accent} />
            <Text style={styles.licenseText}>
              Organization: {user?.organization_name || user?.organizationName || 'Attested Clinic'}
            </Text>
          </View>
          <View style={styles.licenseRow}>
            <CheckCircle2 size={16} color="#10b981" />
            <Text style={[styles.licenseText, { color: '#10b981', fontWeight: '600' }]}>
              Statutory Board: Verified & Active (KMPDC / NCK)
            </Text>
          </View>
        </View>

        {/* Triage QR Scanner Launcher Button */}
        <TouchableOpacity 
          style={styles.scanActionBtn}
          onPress={() => setShowScanner(true)}
          activeOpacity={0.85}
        >
          <View style={styles.scanIconBox}>
            <QrCode size={24} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.scanTitle}>Triage Camera QR Scanner</Text>
            <Text style={styles.scanSubtitle}>
              Scan patient's physical or digital QR Health Passport for instant verification.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Clinical Encounter Entry Form */}
        <View style={styles.formCard}>
          <View style={styles.formHeader}>
            <PlusCircle size={18} color={COLORS.primary} />
            <Text style={styles.formTitle}>New Blockchain Consultation</Text>
          </View>

          {/* Selected Patient Banner */}
          {selectedPatientId ? (
            <View style={styles.selectedPatientBanner}>
              <User size={16} color="#10b981" />
              <View style={{ flex: 1 }}>
                <Text style={styles.patientBannerName}>Patient: {selectedPatientName}</Text>
                <Text style={styles.patientBannerId}>ID: {selectedPatientId.substring(0, 18)}...</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedPatientId('')}>
                <Text style={{ color: COLORS.danger, fontSize: 12 }}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Select Patient</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
                {loadingPatients ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  patients.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.patientChip,
                        selectedPatientId === p.id && styles.activePatientChip
                      ]}
                      onPress={() => {
                        setSelectedPatientId(p.id);
                        setSelectedPatientName(p.name);
                      }}
                    >
                      <Text style={[
                        styles.patientChipText,
                        selectedPatientId === p.id && styles.activePatientChipText
                      ]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Clinical Diagnosis / Observations</Text>
            <TextInput
              style={[styles.textArea, { height: 75 }]}
              placeholder="e.g. Acute upper respiratory infection..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              value={diagnosis}
              onChangeText={setDiagnosis}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Treatment Plan</Text>
            <TextInput
              style={[styles.textArea, { height: 60 }]}
              placeholder="e.g. Hydration, rest, steam inhalation..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              value={treatment}
              onChangeText={setTreatment}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Prescriptions (One per line)</Text>
            <TextInput
              style={[styles.textArea, { height: 60 }]}
              placeholder="e.g. Amoxicillin 500mg TDS x 5 days"
              placeholderTextColor={COLORS.textMuted}
              multiline
              value={prescriptions}
              onChangeText={setPrescriptions}
            />
          </View>

          <TouchableOpacity 
            style={styles.submitRecordBtn}
            onPress={handleCreateRecord}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <ShieldCheck size={18} color="#fff" />
                <Text style={styles.submitRecordText}>Cryptographically Sign & Mine Block</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Native Camera QR Scanner Modal */}
      <QRScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onScanComplete={handleQRScanned}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 55,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder
  },
  greeting: {
    fontSize: 12,
    color: COLORS.textSecondary
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary
  },
  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  scrollBody: {
    padding: 20,
    paddingBottom: 40
  },
  licenseCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 8
  },
  licenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  licenseText: {
    fontSize: 12,
    color: COLORS.textSecondary
  },
  scanActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6
  },
  scanIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  scanTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700'
  },
  scanSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    marginTop: 2
  },
  formCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    borderRadius: 14,
    padding: 16,
    gap: 14
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    paddingBottom: 10
  },
  formTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  inputGroup: {
    gap: 6
  },
  inputLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600'
  },
  textArea: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    color: COLORS.textPrimary,
    fontSize: 13,
    padding: 10,
    textAlignVertical: 'top'
  },
  patientChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  activePatientChip: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary
  },
  patientChipText: {
    color: COLORS.textSecondary,
    fontSize: 12
  },
  activePatientChipText: {
    color: '#fff',
    fontWeight: '600'
  },
  selectedPatientBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 8,
    padding: 10
  },
  patientBannerName: {
    color: '#10b981',
    fontWeight: '700',
    fontSize: 13
  },
  patientBannerId: {
    color: COLORS.textMuted,
    fontSize: 11
  },
  submitRecordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 13,
    marginTop: 4
  },
  submitRecordText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700'
  }
});
