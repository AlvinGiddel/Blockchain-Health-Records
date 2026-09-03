import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  ActivityIndicator, RefreshControl, Alert 
} from 'react-native';
import { 
  ShieldCheck, QrCode, LogOut, FileText, 
  Heart, Calendar, Stethoscope, AlertTriangle, Pill 
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';
import { COLORS } from '../theme/colors';
import QRHealthPassportModal from '../components/QRHealthPassportModal';

export default function PatientDashboard() {
  const { user, logout } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPassport, setShowPassport] = useState(false);

  const fetchRecords = async () => {
    try {
      const data = await apiRequest('/records/patient');
      if (Array.isArray(data)) {
        setRecords(data);
      }
    } catch (err) {
      console.warn('Error fetching patient records:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecords();
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout }
    ]);
  };

  return (
    <View style={styles.container}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name || 'Patient'}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <LogOut size={18} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollBody}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
      >
        {/* QR Health Passport Action Card */}
        <TouchableOpacity 
          style={styles.passportCard}
          onPress={() => setShowPassport(true)}
          activeOpacity={0.85}
        >
          <View style={styles.passportContent}>
            <View style={styles.passportIconBox}>
              <QrCode size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.passportTitle}>Universal Health Passport</Text>
              <Text style={styles.passportSubtitle}>
                Tap to present cryptographically sealed offline QR code for doctor or airport triage.
              </Text>
            </View>
          </View>
          <View style={styles.passportFooter}>
            <ShieldCheck size={14} color="#10b981" />
            <Text style={styles.passportFooterText}>ECDSA Block Sealed • Proof-of-Work Attested</Text>
          </View>
        </TouchableOpacity>

        {/* Patient Vitals Pill Bar */}
        <View style={styles.vitalsRow}>
          <View style={styles.vitalCard}>
            <Heart size={16} color="#ef4444" />
            <Text style={styles.vitalLabel}>Blood Group</Text>
            <Text style={[styles.vitalVal, { color: '#ef4444' }]}>
              {user?.patientProfile?.bloodType || 'O+'}
            </Text>
          </View>

          <View style={styles.vitalCard}>
            <FileText size={16} color={COLORS.accent} />
            <Text style={styles.vitalLabel}>Records</Text>
            <Text style={styles.vitalVal}>{records.length}</Text>
          </View>

          <View style={styles.vitalCard}>
            <AlertTriangle size={16} color={COLORS.warning} />
            <Text style={styles.vitalLabel}>Allergies</Text>
            <Text style={styles.vitalVal} numberOfLines={1}>
              {Array.isArray(user?.patientProfile?.allergies) 
                ? user.patientProfile.allergies.join(', ') 
                : (user?.patientProfile?.allergies || 'None')}
            </Text>
          </View>
        </View>

        {/* Medical History Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Immutable Medical Records</Text>
          <Text style={styles.recordCount}>{records.length} Verified Entries</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginTop: 30 }} />
        ) : records.length === 0 ? (
          <View style={styles.emptyState}>
            <FileText size={36} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>No medical records yet.</Text>
            <Text style={styles.emptySubtext}>
              When your doctor creates an encrypted consultation, it will be sealed into the blockchain here.
            </Text>
          </View>
        ) : (
          records.map((rec, index) => (
            <View key={rec.id || index} style={styles.recordCard}>
              <View style={styles.recordHeader}>
                <View style={styles.doctorInfo}>
                  <Stethoscope size={16} color={COLORS.primary} />
                  <Text style={styles.doctorName}>Dr. {rec.doctor_name || rec.doctorName || 'Attending Physician'}</Text>
                </View>
                <View style={styles.dateInfo}>
                  <Calendar size={13} color={COLORS.textMuted} />
                  <Text style={styles.recordDate}>{rec.timestamp ? new Date(rec.timestamp).toLocaleDateString() : 'Recent'}</Text>
                </View>
              </View>

              <View style={styles.diagnosisBox}>
                <Text style={styles.diagLabel}>Diagnosis / Findings:</Text>
                <Text style={styles.diagText}>{rec.diagnosis || 'Clinical evaluation performed'}</Text>
              </View>

              {rec.treatment && (
                <View style={styles.treatmentBox}>
                  <Text style={styles.diagLabel}>Treatment Plan:</Text>
                  <Text style={styles.treatmentText}>{rec.treatment}</Text>
                </View>
              )}

              {Array.isArray(rec.prescriptions) && rec.prescriptions.length > 0 && (
                <View style={styles.prescriptionsBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Pill size={14} color="#10b981" />
                    <Text style={styles.diagLabel}>Prescriptions:</Text>
                  </View>
                  {rec.prescriptions.map((p, i) => (
                    <Text key={i} style={styles.rxItem}>• {typeof p === 'object' ? `${p.medication} (${p.dosage})` : p}</Text>
                  ))}
                </View>
              )}

              <View style={styles.blockchainSeal}>
                <ShieldCheck size={13} color="#10b981" />
                <Text style={styles.sealText} numberOfLines={1}>
                  Block #{rec.block_index ?? 1} • Tx: {rec.transaction_hash ? rec.transaction_hash.substring(0, 16) + '...' : 'Attested'}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* QR Passport Modal */}
      <QRHealthPassportModal
        visible={showPassport}
        onClose={() => setShowPassport(false)}
        user={user}
        latestRecord={records[0]}
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
  passportCard: {
    backgroundColor: COLORS.primary,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8
  },
  passportContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14
  },
  passportIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  passportTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  passportSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16
  },
  passportFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)'
  },
  passportFooterText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '600'
  },
  vitalsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24
  },
  vitalCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    gap: 4
  },
  vitalLabel: {
    fontSize: 11,
    color: COLORS.textMuted
  },
  vitalVal: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary
  },
  recordCount: {
    fontSize: 12,
    color: COLORS.accent
  },
  recordCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 10
  },
  recordHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  doctorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  doctorName: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600'
  },
  dateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  recordDate: {
    color: COLORS.textMuted,
    fontSize: 11
  },
  diagnosisBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: 10,
    borderRadius: 8
  },
  diagLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginBottom: 2
  },
  diagText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 18
  },
  treatmentBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    padding: 10,
    borderRadius: 8
  },
  treatmentText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 16
  },
  prescriptionsBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    padding: 10,
    borderRadius: 8
  },
  rxItem: {
    color: COLORS.textPrimary,
    fontSize: 12
  },
  blockchainSeal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4
  },
  sealText: {
    fontSize: 10,
    color: '#10b981',
    fontWeight: '600'
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
    gap: 10
  },
  emptyText: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '600'
  },
  emptySubtext: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18
  }
});
