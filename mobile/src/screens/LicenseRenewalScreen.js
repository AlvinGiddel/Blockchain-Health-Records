import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  ActivityIndicator, Linking, Alert 
} from 'react-native';
import { 
  Building2, CreditCard, CheckCircle2, 
  AlertCircle, ShieldCheck, LogOut, Clock 
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiRequest } from '../api/client';
import { COLORS } from '../theme/colors';

export default function LicenseRenewalScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [licenseData, setLicenseData] = useState(null);
  const [plans, setPlans] = useState([
    { id: 'plan_1m', name: 'Standard Monthly Renewal', days: 30, amountKES: 20000 },
    { id: 'plan_3m', name: 'Quarterly Clinic Plan', days: 90, amountKES: 54000 },
    { id: 'plan_1y', name: 'Annual Medical License', days: 365, amountKES: 192000 }
  ]);
  const [selectedPlanId, setSelectedPlanId] = useState('plan_1m');
  const [loading, setLoading] = useState(true);
  const [initiating, setInitiating] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchLicenseStatus();
  }, []);

  const fetchLicenseStatus = async () => {
    try {
      const data = await apiRequest('/payments/clinic-license');
      if (data?.organization) {
        setLicenseData(data.organization);
        setErrorMessage('');
      }
    } catch (err) {
      setErrorMessage(err.message || 'No clinic organization associated with user.');
    } finally {
      setLoading(false);
    }
  };

  const handleInitiatePaystack = async () => {
    setInitiating(true);
    try {
      const initRes = await apiRequest('/payments/initialize', {
        method: 'POST',
        body: JSON.stringify({
          planId: selectedPlanId,
          email: user?.email
        })
      });

      if (initRes?.authorization_url) {
        // Open Paystack Checkout in phone's default browser (Safari on iOS)
        const supported = await Linking.canOpenURL(initRes.authorization_url);
        if (supported) {
          await Linking.openURL(initRes.authorization_url);
        } else {
          Alert.alert('Paystack Checkout', `Please visit checkout: ${initRes.authorization_url}`);
        }
      } else {
        throw new Error('No checkout authorization URL returned by server.');
      }
    } catch (err) {
      Alert.alert('Payment Initialization Failed', err.message);
    } finally {
      setInitiating(false);
    }
  };

  const selectedPlan = plans.find(p => p.id === selectedPlanId) || plans[0];

  return (
    <View style={styles.container}>
      {/* App Bar with Safe Area */}
      <View style={[styles.appBar, { paddingTop: Math.max(insets.top + 8, 48) }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Clinic Administrator</Text>
          <Text style={styles.userName}>{user?.organization_name || user?.name || 'Clinic'}</Text>
        </View>
        <TouchableOpacity 
          onPress={logout} 
          style={styles.logoutBtn}
          activeOpacity={0.7}
        >
          <LogOut size={15} color="#ef4444" />
          <Text style={styles.logoutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        {/* Current License Status Card */}
        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <Building2 size={20} color={COLORS.primary} />
            <Text style={styles.statusTitle}>Organization License Status</Text>
          </View>

          {loading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />
          ) : errorMessage ? (
            <View style={{ marginTop: 10, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={16} color={COLORS.warning} />
                <Text style={{ color: COLORS.warning, fontSize: 13, fontWeight: '600' }}>
                  No Clinic Organization Linked
                </Text>
              </View>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, lineHeight: 16 }}>
                This user account is not currently assigned to a hospital facility. Log in as a patient or registered practitioner, or assign this admin to an organization.
              </Text>
            </View>
          ) : (
            <View style={styles.statusBody}>
              <View style={styles.countdownRow}>
                <Clock size={16} color={COLORS.accent} />
                <Text style={styles.countdownLabel}>Current Status:</Text>
                <View style={[
                  styles.statusBadge, 
                  licenseData?.status === 'active' ? styles.activeBadge : styles.trialBadge
                ]}>
                  <Text style={styles.statusBadgeText}>
                    {(licenseData?.status || 'Active').toUpperCase()}
                  </Text>
                </View>
              </View>

              {licenseData?.license_expires_at && (
                <Text style={styles.expiryDateText}>
                  Expires on: {new Date(licenseData.license_expires_at).toLocaleDateString()}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Subscription Plan Picker */}
        <Text style={styles.sectionTitle}>Select License Plan</Text>

        <View style={styles.plansContainer}>
          {plans.map(plan => {
            const isSelected = selectedPlanId === plan.id;
            return (
              <TouchableOpacity
                key={plan.id}
                style={[styles.planCard, isSelected && styles.selectedPlanCard]}
                onPress={() => setSelectedPlanId(plan.id)}
                activeOpacity={0.8}
              >
                <View style={styles.planInfo}>
                  <Text style={[styles.planName, isSelected && styles.selectedPlanText]}>
                    {plan.name}
                  </Text>
                  <Text style={styles.planDays}>{plan.days} Days Full Operational License</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.planPrice}>KES {plan.amountKES.toLocaleString()}</Text>
                  <Text style={styles.planMonthly}>
                    KES {Math.round(plan.days === 365 ? plan.amountKES / 12 : plan.amountKES / (plan.days / 30)).toLocaleString()}/mo
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Paystack Checkout Button */}
        <TouchableOpacity
          style={styles.payBtn}
          onPress={handleInitiatePaystack}
          disabled={initiating}
        >
          {initiating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <CreditCard size={18} color="#fff" />
              <Text style={styles.payBtnText}>
                Renew License with Paystack (M-Pesa / Card)
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.guaranteeBox}>
          <ShieldCheck size={14} color="#10b981" />
          <Text style={styles.guaranteeText}>
            Early renewals append 30/90/365 days to your existing expiry date without losing remaining days.
          </Text>
        </View>

        {/* Prominent Bottom Sign Out Button */}
        <TouchableOpacity 
          style={styles.bottomLogoutBtn} 
          onPress={logout}
          activeOpacity={0.7}
        >
          <LogOut size={16} color="#ef4444" />
          <Text style={styles.bottomLogoutText}>Sign Out / Switch Account</Text>
        </TouchableOpacity>
      </ScrollView>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  logoutBtnText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700'
  },
  bottomLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)'
  },
  bottomLogoutText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700'
  },
  scrollBody: {
    padding: 20,
    paddingBottom: 40
  },
  statusCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)'
  },
  statusTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700'
  },
  statusBody: {
    marginTop: 12,
    gap: 8
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  countdownLabel: {
    color: COLORS.textSecondary,
    fontSize: 13
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  activeBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)'
  },
  trialBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)'
  },
  statusBadgeText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700'
  },
  expiryDateText: {
    color: COLORS.textMuted,
    fontSize: 12
  },
  sectionTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12
  },
  plansContainer: {
    gap: 10,
    marginBottom: 24
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    borderRadius: 12,
    padding: 16
  },
  selectedPlanCard: {
    borderColor: COLORS.primary,
    backgroundColor: 'rgba(99, 102, 241, 0.1)'
  },
  planInfo: {
    flex: 1
  },
  planName: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '600'
  },
  selectedPlanText: {
    color: COLORS.primary
  },
  planDays: {
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 2
  },
  planPrice: {
    color: COLORS.accent,
    fontSize: 14,
    fontWeight: '700'
  },
  planMonthly: {
    color: COLORS.textMuted,
    fontSize: 10,
    marginTop: 2
  },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6
  },
  payBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700'
  },
  guaranteeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 8
  },
  guaranteeText: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 16
  }
});
