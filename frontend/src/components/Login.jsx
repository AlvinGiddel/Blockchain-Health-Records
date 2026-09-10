import React, { useState, useEffect, useRef } from 'react';
import { 
  Shield, 
  Lock, 
  Mail, 
  User, 
  Activity, 
  AlertCircle, 
  Heart, 
  Stethoscope, 
  ArrowLeft, 
  KeyRound, 
  Eye, 
  EyeOff, 
  Building2, 
  Clock, 
  CheckCircle2, 
  Loader2,
  Pill,
  Info
} from 'lucide-react';
import logoSvg from '../assets/logo.svg';
import { safeFetch } from '../utils/api';
import SearchableSelect from './SearchableSelect';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';

export default function Login({ onLoginSuccess, onNavigateHome, initialRegister = false, initialRole = null }) {
  const getInitialRole = () => {
    const params = new URLSearchParams(window.location.search);
    const regParam = params.get('register');
    if (regParam === 'clinic' || regParam === 'hospital') return 'clinic';
    if (regParam === 'pharmacy' || regParam === 'chemist') return 'pharmacy';
    if (regParam === 'doctor' || regParam === 'practitioner') return 'doctor';
    if (regParam === 'patient') return 'patient';
    return initialRole || 'patient';
  };

  const getInitialRegister = () => {
    if (initialRegister) return true;
    const params = new URLSearchParams(window.location.search);
    return params.has('register') || params.get('mode') === 'register';
  };

  const [isRegister, setIsRegister] = useState(getInitialRegister);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [pendingReview, setPendingReview] = useState(false);
  const [role, setRole] = useState(getInitialRole);
  const [clinicName, setClinicName] = useState('');
  const [pharmacyName, setPharmacyName] = useState('');
  const [ppbLicenseNumber, setPpbLicenseNumber] = useState('');
  const [pharmacyPhone, setPharmacyPhone] = useState('');
  const [pharmacyAddress, setPharmacyAddress] = useState('');
  // Sub-type toggle for the Facility tab ('clinic' | 'pharmacy')
  const [facilityType, setFacilityType] = useState('clinic');
  const [showPpbTooltip, setShowPpbTooltip] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [timeoutMessage, setTimeoutMessage] = useState(() => {
    return sessionStorage.getItem('sessionTimedOut') === 'true' ? 'Your session expired. Please sign in again.' : '';
  });
  const [suspensionNotice, setSuspensionNotice] = useState(() => {
    const notice = sessionStorage.getItem('suspensionNotice');
    if (notice) {
      sessionStorage.removeItem('suspensionNotice');
      return notice;
    }
    return '';
  });
  const [patientOrgId, setPatientOrgId] = useState('');
  const [doctorOrgId, setDoctorOrgId] = useState('');
  const [customHospitalName, setCustomHospitalName] = useState('');
  const [activeOrganizations, setActiveOrganizations] = useState([]);

  useEffect(() => {
    safeFetch('/api/organizations/active')
      .then(data => setActiveOrganizations(Array.isArray(data) ? data : []))
      .catch(err => console.error('Failed to load active hospitals:', err));
  }, []);

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const regParam = params.get('register');
      if (regParam === 'clinic' || regParam === 'hospital') {
        setRole('clinic');
        setIsRegister(true);
      } else if (regParam === 'pharmacy' || regParam === 'chemist') {
        setRole('pharmacy');
        setIsRegister(true);
      } else if (regParam === 'doctor' || regParam === 'practitioner') {
        setRole('doctor');
        setIsRegister(true);
      } else if (regParam === 'patient') {
        setRole('patient');
        setIsRegister(true);
      } else if (params.has('register') || params.get('mode') === 'register') {
        setIsRegister(true);
      } else {
        if (initialRole) setRole(initialRole);
        if (initialRegister !== undefined) setIsRegister(initialRegister);
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [initialRegister, initialRole]);

  // Patient profile fields
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState('');

  // Doctor profile fields
  const [specialization, setSpecialization] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [hospital, setHospital] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [cadre, setCadre] = useState('doctor');
  const [councilStatus, setCouncilStatus] = useState({ verifying: false, verified: false, error: '', record: null, regulator: '' });
  const latestLicenseRef = useRef('');
  const debounceTimerRef = useRef(null);

  const checkPractitionerLicense = async (licVal, docName, currentCadre = cadre) => {
    const trimmed = (licVal || '').trim();
    latestLicenseRef.current = trimmed;

    const minLen = (currentCadre === 'nurse' || currentCadre === 'midwife') ? 5 : 4;
    if (!trimmed || trimmed.length < minLen) {
      setCouncilStatus({ verifying: false, verified: false, error: '', record: null, regulator: '' });
      return;
    }

    setCouncilStatus({ verifying: true, verified: false, error: '', record: null, regulator: '' });

    try {
      const url = `/api/practitioner/verify?license=${encodeURIComponent(trimmed)}&cadre=${encodeURIComponent(currentCadre)}${docName ? `&name=${encodeURIComponent(docName.trim())}` : ''}`;
      const data = await safeFetch(url);

      if (latestLicenseRef.current.toUpperCase() !== trimmed.toUpperCase()) {
        return;
      }

      if (data.valid) {
        setCouncilStatus({
          verifying: false,
          verified: true,
          error: '',
          record: data.practitioner,
          regulator: data.regulator
        });
        if (data.practitioner?.specialization && !specialization) {
          setSpecialization(data.practitioner.specialization);
        }
        
        // Auto-fill healthcare facility:
        // When organizationId exists, link directly to that organization record without fragile string matching
        if (data.practitioner?.organizationId) {
          setDoctorOrgId(data.practitioner.organizationId);
          const matchedOrg = activeOrganizations.find(o => o.id === data.practitioner.organizationId);
          if (matchedOrg) {
            setHospital(matchedOrg.name);
          } else if (data.practitioner?.facility) {
            setHospital(data.practitioner.facility);
          }
          setCustomHospitalName('');
        } else if (data.practitioner?.facility && !hospital) {
          // If organizationId is null ("Other / Not yet on platform"), fall back to the current text-based behavior as-is
          setHospital(data.practitioner.facility);
        }
      } else {
        setCouncilStatus({
          verifying: false,
          verified: false,
          error: data.error || 'Statutory license verification failed.',
          record: null,
          regulator: data.regulator || ''
        });
      }
    } catch (err) {
      if (latestLicenseRef.current.toUpperCase() !== trimmed.toUpperCase()) {
        return;
      }
      setCouncilStatus({
        verifying: false,
        verified: false,
        error: err.message || 'Failed to verify license with statutory registry.',
        record: null,
        regulator: ''
      });
    }
  };

  const debouncedCheckLicense = (licVal, docName, currentCadre = cadre) => {
    const trimmed = (licVal || '').trim();
    latestLicenseRef.current = trimmed;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    const minLen = (currentCadre === 'nurse' || currentCadre === 'midwife') ? 5 : 4;
    if (trimmed.length < minLen) {
      setCouncilStatus({ verifying: false, verified: false, error: '', record: null, regulator: '' });
      return;
    }
    setCouncilStatus(prev => ({ ...prev, verifying: true, error: '' }));
    debounceTimerRef.current = setTimeout(() => {
      checkPractitionerLicense(trimmed, docName, currentCadre);
    }, 600);
  };

  const checkPhoneAvailability = async (phoneVal) => {
    const digitsOnly = (phoneVal || '').replace(/[^0-9]/g, '');
    if (!digitsOnly || digitsOnly.length < 5) {
      setPhoneError('');
      return;
    }

    try {
      const data = await safeFetch(`/api/auth/check-phone?phone=${encodeURIComponent(phoneVal)}`);
      if (data.exists) {
        setPhoneError('This phone number is already registered to another account.');
      } else {
        setPhoneError('');
      }
    } catch (err) {
      console.error('Phone verification failed:', err);
    }
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePhoto(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const data = await safeFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      setSuccessMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');
    setTimeoutMessage('');
    sessionStorage.removeItem('sessionTimedOut');
    setLoading(true);

    if (isRegister && role === 'admin') {
      setError('Direct registration as Administrator is not permitted.');
      setLoading(false);
      return;
    }

    if (isRegister && phoneError) {
      setError(phoneError);
      setLoading(false);
      return;
    }

    if (isRegister && role === 'clinic') {
      if (!clinicName.trim()) {
        setError('Please enter your hospital or clinic facility name.');
        setLoading(false);
        return;
      }
      try {
        const data = await safeFetch('/api/auth/register-clinic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationName: clinicName.trim(),
            adminName: name.trim(),
            email: email.toLowerCase().trim(),
            password
          })
        });

        if (data.pendingApproval || !data.token) {
          setPendingReview(true);
          setLoading(false);
          return;
        }

        if (data.token) {
          onLoginSuccess(data);
          return;
        }
      } catch (err) {
        setError(err.message || 'Failed to register clinic.');
        setLoading(false);
        return;
      }
    }

    if (isRegister && role === 'pharmacy') {
      if (!pharmacyName.trim()) {
        setError('Please enter your pharmacy facility name.');
        setLoading(false);
        return;
      }
      if (!ppbLicenseNumber.trim()) {
        setError('Please enter your PPB Premises License Number.');
        setLoading(false);
        return;
      }
      try {
        const data = await safeFetch('/api/auth/register-pharmacy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pharmacyName: pharmacyName.trim(),
            adminName: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            ppbLicenseNumber: ppbLicenseNumber.trim(),
            phone: pharmacyPhone.trim() || undefined,
            physicalAddress: pharmacyAddress.trim() || undefined
          })
        });

        if (data.pendingApproval || !data.token) {
          setPendingReview(true);
          setLoading(false);
          return;
        }

        if (data.token) {
          onLoginSuccess(data);
          return;
        }
      } catch (err) {
        setError(err.message || 'Failed to register pharmacy.');
        setLoading(false);
        return;
      }
    }

    const url = isRegister ? '/api/auth/register' : '/api/auth/login';
    const body = { email, password };

    if (isRegister) {
      body.name = name;
      body.role = role;

      if (role === 'patient') {
        if (!patientOrgId) {
          setError('Please select your primary hospital or clinic facility.');
          setLoading(false);
          return;
        }
        body.organizationId = patientOrgId;
        body.profile = {
          age: parseInt(age) || null,
          gender,
          bloodType,
          allergies: allergies.split(',').map(a => a.trim()).filter(a => a !== ''),
          phone
        };
      } else if (role === 'doctor') {
        if (!doctorOrgId) {
          setError('Please select your affiliated hospital facility or select "Facility not listed".');
          setLoading(false);
          return;
        }
        if (doctorOrgId === 'other' && !customHospitalName.trim()) {
          setError('Please enter the name of your healthcare facility.');
          setLoading(false);
          return;
        }

        const selectedFacilityName = doctorOrgId === 'other'
          ? customHospitalName.trim()
          : (activeOrganizations.find(o => o.id === doctorOrgId)?.name || hospital);

        body.organizationId = doctorOrgId === 'other' ? null : doctorOrgId;
        body.profile = {
          cadre,
          specialization: specialization || (cadre === 'nurse' ? 'Registered Nursing' : cadre === 'midwife' ? 'Midwifery' : 'General Practice'),
          licenseNumber,
          hospital: selectedFacilityName,
          yearsOfExperience: parseInt(yearsOfExperience) || 0,
          profilePhoto,
          phone
        };
      }
    }

    try {
      const data = await safeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (data.token) {
        onLoginSuccess(data);
      } else {
        setSuccessMessage(data.message || 'Registration submitted successfully! Pending verification.');
        setIsRegister(false);
        setEmail('');
        setPassword('');
        setName('');
        setAge('');
        setGender('');
        setBloodType('');
        setAllergies('');
        setSpecialization('');
        setLicenseNumber('');
        setHospital('');
        setYearsOfExperience('');
        setProfilePhoto('');
        setPhone('');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password View
  if (isForgotPassword) {
    return (
      <div className="w-full flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-[#0F243E] border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-sm dark:shadow-2xl rounded-2xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-[#112239] border border-slate-200 dark:border-[#1E3A5F] flex items-center justify-center mx-auto mb-3 text-[#0B2545] dark:text-white">
              <KeyRound className="w-6 h-6 text-[#0F766E] dark:text-[#14B8A6]" />
            </div>
            <h2 className="text-xl font-bold text-[#0B2545] dark:text-white">Reset Access Password</h2>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1">
              Enter your registered clinical email to receive a secure recovery link.
            </p>
          </div>

          {successMessage && (
            <div className="bg-[#E8F7F2] border border-[#A3E3CD] text-[#1D9E75] rounded-lg p-3 text-xs mb-4 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <strong className="block font-semibold">Verification Link Dispatched</strong>
                {successMessage}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reset-email" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Email Address</Label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-[#94A3B8]" />
                <Input
                  type="email"
                  id="reset-email"
                  className="pl-9"
                  placeholder="e.g. practitioner@hospital.org"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-10 font-semibold"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Sending Link...
                </span>
              ) : (
                'Send Recovery Link'
              )}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#E2E8F0] dark:border-[#1E3A5F] text-center">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline"
              onClick={() => {
                setIsForgotPassword(false);
                setError('');
                setSuccessMessage('');
                setTimeoutMessage('');
              }}
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Pending Institutional Review View
  if (pendingReview) {
    return (
      <div className="w-full flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white dark:bg-[#0F243E] border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-sm dark:shadow-2xl rounded-2xl p-6 sm:p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-[#112239] border border-slate-200 dark:border-[#1E3A5F] flex items-center justify-center mx-auto mb-4">
            <Clock className="w-7 h-7 text-[#0F766E] dark:text-[#14B8A6]" />
          </div>

          <h3 className="text-xl font-bold text-[#0B2545] dark:text-white mb-2">
            Institutional Registration Submitted
          </h3>

          <div className="bg-slate-50 dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-xl p-4 mb-4">
            <p className="text-sm font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
              Verification & Compliance Review in Progress
            </p>
            <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1">
              Statutory verification and cryptographic ledger provisioning are underway for your healthcare facility.
            </p>
          </div>

          <p className="text-xs text-[#475569] dark:text-slate-300 leading-relaxed mb-6 max-w-sm mx-auto">
            Platform Super Administrators verify clinical institutions and licensed pharmacies for credentialing compliance before activating the network ledger node. You will receive an activation email once approved.
          </p>

          <Button
            type="button"
            variant="outline"
            className="w-full max-w-xs"
            onClick={() => {
              setPendingReview(false);
              setIsRegister(false);
              setRole('patient');
              setEmail('');
              setPassword('');
              setName('');
              setClinicName('');
              setPharmacyName('');
              setPpbLicenseNumber('');
              setPharmacyPhone('');
              setPharmacyAddress('');
              setError('');
              setSuccessMessage('');
            }}
          >
            Back to Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex items-center justify-center p-4 sm:p-6">
      <div className={`w-full ${isRegister ? 'max-w-2xl' : 'max-w-md'} bg-white dark:bg-[#0F243E] border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-sm dark:shadow-2xl rounded-2xl p-6 sm:p-8 transition-all duration-300 relative`}>
        
        {/* Back to Home Navigation Link */}
        {onNavigateHome && (
          <div className="mb-4">
            <button
              type="button"
              onClick={onNavigateHome}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Home</span>
            </button>
          </div>
        )}

        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 dark:bg-[#112239] border border-slate-200/80 dark:border-[#1E3A5F] flex items-center justify-center mx-auto mb-3.5 shadow-none">
            <img src={logoSvg} alt="BHC Logo" className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-[#0B2545] dark:text-white">
            {isRegister ? 'Create Clinical Account' : 'Clinical Sign In'}
          </h2>
          <p className="text-xs text-[#475569] dark:text-[#94A3B8] mt-1">
            {isRegister
              ? 'Register credentials for patient access or regulated healthcare practice'
              : 'Enter verified credentials to access medical records and clinical ledgers'}
          </p>
        </div>

        {/* Status Alerts */}
        {suspensionNotice && (
          <div className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-lg p-3 text-xs mb-4 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{suspensionNotice}</span>
          </div>
        )}

        {timeoutMessage && (
          <div className="bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 rounded-lg p-3 text-xs mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 shrink-0" />
            <span>{timeoutMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="bg-[#E8F7F2] dark:bg-[#064E3B]/50 border border-[#A3E3CD] dark:border-[#065F46] text-[#1D9E75] dark:text-[#34D399] rounded-lg p-3 text-xs mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-lg p-3 text-xs mb-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          
          {/* Registration Role Selector Tabs — 3 primary tabs */}
          {isRegister && (
            <div className="space-y-2 pb-2 border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
              <Label className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Registration Category</Label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                    role === 'patient'
                      ? 'bg-[#0F766E] text-white border-[#0F766E] shadow-sm'
                      : 'bg-white dark:bg-[#112239] text-slate-700 dark:text-slate-200 border-[#E2E8F0] dark:border-[#1E3A5F] hover:bg-slate-50 dark:hover:bg-[#1B314F]'
                  }`}
                  onClick={() => setRole('patient')}
                >
                  <Heart className="w-3.5 h-3.5" /> Patient
                </button>
                <button
                  type="button"
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                    role === 'doctor'
                      ? 'bg-[#0F766E] text-white border-[#0F766E] shadow-sm'
                      : 'bg-white dark:bg-[#112239] text-slate-700 dark:text-slate-200 border-[#E2E8F0] dark:border-[#1E3A5F] hover:bg-slate-50 dark:hover:bg-[#1B314F]'
                  }`}
                  onClick={() => setRole('doctor')}
                >
                  <Stethoscope className="w-3.5 h-3.5" /> Practitioner
                </button>
                {/* "Facility" tab is active when either clinic or pharmacy sub-type is selected */}
                <button
                  type="button"
                  className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                    (role === 'clinic' || role === 'pharmacy')
                      ? 'bg-[#0F766E] text-white border-[#0F766E] shadow-sm'
                      : 'bg-white dark:bg-[#112239] text-slate-700 dark:text-slate-200 border-[#E2E8F0] dark:border-[#1E3A5F] hover:bg-slate-50 dark:hover:bg-[#1B314F]'
                  }`}
                  onClick={() => {
                    // Restore whichever sub-type was last selected; default to 'clinic'
                    setRole(facilityType);
                  }}
                >
                  <Building2 className="w-3.5 h-3.5" /> Facility
                </button>
              </div>

              {/* Facility sub-type selector — only shown when Facility tab is active */}
              {(role === 'clinic' || role === 'pharmacy') && (
                <div className="mt-2">
                  <p className="text-[11px] text-[#475569] dark:text-slate-400 mb-1.5">I'm registering a:</p>
                  <div className="inline-flex rounded-lg border border-[#E2E8F0] dark:border-[#1E3A5F] overflow-hidden">
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 py-1.5 px-4 text-xs font-semibold transition-colors ${
                        role === 'clinic'
                          ? 'bg-[#0B2545] dark:bg-[#0F766E] text-white'
                          : 'bg-white dark:bg-[#112239] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1B314F]'
                      }`}
                      onClick={() => { setRole('clinic'); setFacilityType('clinic'); }}
                    >
                      <Building2 className="w-3 h-3" /> Clinic / Hospital
                    </button>
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 py-1.5 px-4 text-xs font-semibold border-l border-[#E2E8F0] dark:border-[#1E3A5F] transition-colors ${
                        role === 'pharmacy'
                          ? 'bg-[#0B2545] dark:bg-[#0F766E] text-white'
                          : 'bg-white dark:bg-[#112239] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1B314F]'
                      }`}
                      onClick={() => { setRole('pharmacy'); setFacilityType('pharmacy'); }}
                    >
                      <Pill className="w-3 h-3" /> Pharmacy
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Hospital/Clinic Name Field */}
          {isRegister && role === 'clinic' && (
            <div className="space-y-1.5">
              <Label htmlFor="clinicName" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Hospital or Clinic Facility Name</Label>
              <div className="relative">
                <Building2 className="w-4 h-4 absolute left-3 top-3 text-[#94A3B8]" />
                <Input
                  type="text"
                  id="clinicName"
                  className="pl-9"
                  placeholder="e.g. St. Jude Memorial Hospital"
                  required
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                />
              </div>
              <span className="text-[11px] text-[#0F766E] dark:text-[#2DD4BF] flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-[#1D9E75]" /> Institutional credentialing evaluated prior to ledger node provisioning.
              </span>
            </div>
          )}

          {/* Pharmacy Name & Regulatory Fields */}
          {isRegister && role === 'pharmacy' && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pharmacyName" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Pharmacy Premises Name</Label>
                <div className="relative">
                  <Pill className="w-4 h-4 absolute left-3 top-3 text-[#94A3B8]" />
                  <Input
                    type="text"
                    id="pharmacyName"
                    className="pl-9"
                    placeholder="e.g. Nairobi Apex Chemists Ltd"
                    required
                    value={pharmacyName}
                    onChange={(e) => setPharmacyName(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="ppbLicenseNumber" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">
                      PPB Premises License Number
                    </Label>
                    {/* Inline info tooltip — replaces the full paragraph disclosure banner */}
                    <div className="relative inline-flex">
                      <button
                        type="button"
                        className="text-[#94A3B8] hover:text-[#0F766E] dark:hover:text-[#2DD4BF] transition-colors"
                        aria-label="PPB license information"
                        onMouseEnter={() => setShowPpbTooltip(true)}
                        onMouseLeave={() => setShowPpbTooltip(false)}
                        onFocus={() => setShowPpbTooltip(true)}
                        onBlur={() => setShowPpbTooltip(false)}
                        onClick={() => setShowPpbTooltip(v => !v)}
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                      {showPpbTooltip && (
                        <div className="absolute left-5 top-0 z-20 w-64 rounded-lg border border-[#E2E8F0] dark:border-[#1E3A5F] bg-white dark:bg-[#0F243E] shadow-lg p-2.5 text-[11px] text-[#475569] dark:text-slate-300 leading-relaxed">
                          Statutory Pharmacy and Poisons Board (PPB) Premises Registration Number. Self-reported credentials are cross-referenced during administrative verification.
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-mono border-amber-300 text-amber-800 dark:text-amber-300 dark:border-amber-800">
                    Kenya PPB
                  </Badge>
                </div>
                <div className="relative">
                  <Shield className="w-4 h-4 absolute left-3 top-3 text-[#94A3B8]" />
                  <Input
                    type="text"
                    id="ppbLicenseNumber"
                    className="pl-9 font-mono"
                    placeholder="e.g. PPB/PREM/2026/0842"
                    required
                    value={ppbLicenseNumber}
                    onChange={(e) => setPpbLicenseNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pharmacyPhone" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">
                    Contact Phone Number
                  </Label>
                  <Input
                    type="tel"
                    id="pharmacyPhone"
                    placeholder="+254 700 000000"
                    value={pharmacyPhone}
                    onChange={(e) => setPharmacyPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pharmacyAddress" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">
                    Physical Location / Address
                  </Label>
                  <Input
                    type="text"
                    id="pharmacyAddress"
                    placeholder="e.g. Kimathi St, Nairobi CBD"
                    value={pharmacyAddress}
                    onChange={(e) => setPharmacyAddress(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Primary Fields Grid */}
          <div className={`grid gap-4 ${isRegister ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
            
            {/* Full Name */}
            {isRegister && (
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">
                  {role === 'clinic' ? 'Admin Full Name' : (role === 'pharmacy' ? 'Superintendent Pharmacist Name' : 'Full Name')}
                </Label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-[#94A3B8]" />
                  <Input
                    type="text"
                    id="name"
                    className="pl-9"
                    placeholder={role === 'clinic' ? 'e.g. Dr. Jane Doe (Lead Admin)' : (role === 'pharmacy' ? 'e.g. Pharm. Mary Wanjiku' : 'e.g. John Doe')}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Email Address */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Email Address</Label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-3 text-[#94A3B8]" />
                <Input
                  type="email"
                  id="email"
                  className="pl-9"
                  placeholder="e.g. user@domain.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Password */}
            <div className={`space-y-1.5 ${isRegister ? 'sm:col-span-2' : ''}`}>
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Password</Label>
                {!isRegister && (
                  <button
                    type="button"
                    className="text-xs font-medium text-[#0F766E] dark:text-[#2DD4BF] hover:underline"
                    onClick={() => {
                      setIsForgotPassword(true);
                      setError('');
                      setSuccessMessage('');
                      setTimeoutMessage('');
                    }}
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-[#94A3B8]" />
                <Input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  className="pl-9 pr-10"
                  placeholder="••••••••"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-[#94A3B8] hover:text-[#0F172A] dark:hover:text-[#F8FAFC] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

          </div>

          {/* Role-Specific Details Section (Register Mode) */}
          {isRegister && (
            <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E3A5F] space-y-4">
              
              {/* Patient Fields */}
              {role === 'patient' && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="patientHospital" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-[#0F766E]" />
                      Primary Healthcare Facility <span className="text-red-500">*</span>
                    </Label>
                    <SearchableSelect
                      id="patientHospital"
                      className="form-control"
                      value={patientOrgId}
                      onChange={(e) => setPatientOrgId(e.target.value)}
                      required
                      placeholder="-- Select Hospital Facility --"
                    >
                      <option value="">-- Select Hospital Facility --</option>
                      {activeOrganizations.map(org => (
                        <option key={org.id} value={org.id}>
                          🏥 {org.name}
                        </option>
                      ))}
                    </SearchableSelect>
                    <span className="text-[11px] text-[#475569] dark:text-slate-300 block">
                      Establishes your primary cryptographic clinical record anchor.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="age" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Age</Label>
                      <Input
                        type="number"
                        id="age"
                        placeholder="e.g. 35"
                        required
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="gender" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Gender</Label>
                      <SearchableSelect 
                        id="gender" 
                        className="form-control" 
                        value={gender} 
                        onChange={(e) => setGender(e.target.value)} 
                        required
                        placeholder="-- Select Gender --"
                      >
                        <option value="">-- Select Gender --</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                      </SearchableSelect>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="bloodType" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Blood Group</Label>
                      <SearchableSelect 
                        id="bloodType" 
                        className="form-control" 
                        value={bloodType} 
                        onChange={(e) => setBloodType(e.target.value)} 
                        required
                        placeholder="-- Select Blood Group --"
                      >
                        <option value="">-- Select Blood Group --</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </SearchableSelect>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="patientPhone" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Contact Phone</Label>
                      <Input
                        type="tel"
                        id="patientPhone"
                        placeholder="e.g. +254 700 111222"
                        required
                        value={phone}
                        className={phoneError ? 'border-red-500' : ''}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          checkPhoneAvailability(e.target.value);
                        }}
                        onBlur={(e) => checkPhoneAvailability(e.target.value)}
                      />
                      {phoneError && (
                        <div className="text-red-600 text-[11px] flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3" /> {phoneError}
                        </div>
                      )}
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <Label htmlFor="allergies" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Allergies / Critical Contraindications</Label>
                      <Input
                        type="text"
                        id="allergies"
                        placeholder="e.g. Penicillin, Sulfonamides, Peanuts, Latex"
                        value={allergies}
                        onChange={(e) => setAllergies(e.target.value)}
                      />
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 flex items-start gap-1 mt-1 leading-snug">
                        <span className="mt-px">⚠</span>
                        <span>Use specific names (e.g. <em>Penicillin</em>, not <em>Antibiotics</em>). The prescription safety engine matches allergens against medication ingredients — vague categories like <em>"Proteins"</em> or <em>"Chemicals"</em> won't trigger contraindication alerts.</span>
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Practitioner Fields */}
              {role === 'doctor' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-[#0B2545] dark:text-slate-200 flex items-center justify-between">
                      <span>Statutory Council & Professional Cadre</span>
                      <span className="text-red-500">*</span>
                    </Label>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'doctor', label: 'Doctor', regulator: 'KMPDC' },
                        { id: 'dentist', label: 'Dentist', regulator: 'KMPDC' },
                        { id: 'nurse', label: 'Nurse', regulator: 'NCK' },
                        { id: 'midwife', label: 'Midwife', regulator: 'NCK' }
                      ].map(item => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setCadre(item.id);
                            setCouncilStatus({ verifying: false, verified: false, error: '', record: null, regulator: '' });
                            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                            if (licenseNumber && licenseNumber.trim().length >= 4) {
                              checkPractitionerLicense(licenseNumber, name, item.id);
                            }
                          }}
                          className={`p-2 rounded-lg text-xs font-medium border text-center transition-colors ${
                            cadre === item.id
                              ? 'bg-[#0B2545] dark:bg-[#0F766E] text-white border-[#0B2545] dark:border-[#0F766E] shadow-sm'
                              : 'bg-white dark:bg-[#112239] text-slate-700 dark:text-slate-200 border-[#E2E8F0] dark:border-[#1E3A5F] hover:bg-slate-50 dark:hover:bg-[#1B314F]'
                          }`}
                        >
                          <div className="font-semibold">{item.label}</div>
                          <div className={`text-[10px] ${cadre === item.id ? 'text-teal-200' : 'text-[#475569] dark:text-slate-300'}`}>
                            {item.regulator} Regulated
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Statutory License Number with Verification Status */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="license" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">
                        {cadre === 'nurse' || cadre === 'midwife'
                          ? 'Nursing Council Index / License Number (NCK)'
                          : 'Medical Practitioners License Number (KMPDC)'}
                      </Label>
                      {councilStatus.verified && (
                        <Badge variant="verified" className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-[#1D9E75]" /> Verified Active
                        </Badge>
                      )}
                    </div>
                    <Input
                      type="text"
                      id="license"
                      placeholder={cadre === 'nurse' || cadre === 'midwife' ? 'e.g. 594079 or KRCHN-12345' : 'e.g. A12345 (Medical) or B10234 (Dental)'}
                      required
                      value={licenseNumber}
                      className={councilStatus.error ? 'border-red-500' : councilStatus.verified ? 'border-[#1D9E75]' : ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setLicenseNumber(val);
                        debouncedCheckLicense(val, name, cadre);
                      }}
                      onBlur={(e) => {
                        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                        checkPractitionerLicense(e.target.value, name, cadre);
                      }}
                    />

                    {councilStatus.verifying && (
                      <div className="text-xs text-[#475569] dark:text-slate-300 flex items-center gap-1.5 mt-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0F766E]" />
                        <span>Verifying credentials against {cadre === 'nurse' || cadre === 'midwife' ? 'NCK Registry' : 'KMPDC Register'}...</span>
                      </div>
                    )}

                    {councilStatus.verified && councilStatus.record && (
                      <div className="bg-[#E8F7F2] dark:bg-[#064E3B]/40 border border-[#A3E3CD] dark:border-[#065F46] text-[#1D9E75] dark:text-[#34D399] rounded-lg p-2.5 text-xs mt-1 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                        <div>
                          <strong>{councilStatus.regulator} Verified Practitioner:</strong> {councilStatus.record.fullName}
                          <div className="text-[11px] opacity-90">{councilStatus.record.facility || 'Licensed Practice'}</div>
                        </div>
                      </div>
                    )}

                    {councilStatus.error && (
                      <div className="text-red-600 text-xs flex items-center gap-1 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {councilStatus.error}
                      </div>
                    )}
                  </div>

                  {/* Specialization & Hospital */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="specialization" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Department / Specialty</Label>
                      <Input
                        type="text"
                        id="specialization"
                        placeholder={cadre === 'nurse' ? 'e.g. Critical Care' : 'e.g. Cardiology'}
                        required
                        value={specialization}
                        onChange={(e) => setSpecialization(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="yearsOfExperience" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Years of Practice</Label>
                      <Input
                        type="number"
                        id="yearsOfExperience"
                        placeholder="e.g. 8"
                        required
                        min="0"
                        value={yearsOfExperience}
                        onChange={(e) => setYearsOfExperience(e.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-2 space-y-1">
                      <Label htmlFor="doctorHospital" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[#0F766E]" />
                        Affiliated Healthcare Facility <span className="text-red-500">*</span>
                      </Label>
                      <SearchableSelect
                        id="doctorHospital"
                        className="form-control"
                        value={doctorOrgId}
                        placeholder="-- Choose Hospital Facility --"
                        onChange={(e) => {
                          const val = e.target.value;
                          setDoctorOrgId(val);
                          if (val && val !== 'other') {
                            const found = activeOrganizations.find(o => o.id === val);
                            if (found) setHospital(found.name);
                          } else if (val === 'other') {
                            setHospital(customHospitalName);
                          } else {
                            setHospital('');
                          }
                        }}
                        required
                      >
                        <option value="">-- Choose Hospital Facility --</option>
                        {activeOrganizations.map(org => (
                          <option key={org.id} value={org.id}>
                            🏥 {org.name}
                          </option>
                        ))}
                        <option value="other">➕ Facility not listed (External Clinic)</option>
                      </SearchableSelect>
                    </div>

                    {doctorOrgId === 'other' && (
                      <div className="sm:col-span-2 space-y-1">
                        <Label htmlFor="customHospital" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Facility Name <span className="text-red-500">*</span></Label>
                        <Input
                          type="text"
                          id="customHospital"
                          placeholder="e.g. Sunrise Specialist Care"
                          required
                          value={customHospitalName}
                          onChange={(e) => {
                            setCustomHospitalName(e.target.value);
                            setHospital(e.target.value);
                          }}
                        />
                      </div>
                    )}

                    <div className="space-y-1">
                      <Label htmlFor="docPhone" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Contact Phone</Label>
                      <Input
                        type="tel"
                        id="docPhone"
                        placeholder="e.g. +254 700 111222"
                        required
                        value={phone}
                        className={phoneError ? 'border-red-500' : ''}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          checkPhoneAvailability(e.target.value);
                        }}
                        onBlur={(e) => checkPhoneAvailability(e.target.value)}
                      />
                      {phoneError && (
                        <div className="text-red-600 text-[11px] flex items-center gap-1 mt-1">
                          <AlertCircle className="w-3 h-3" /> {phoneError}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="profilePhoto" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">Profile Photo (Optional)</Label>
                      <Input
                        type="file"
                        id="profilePhoto"
                        accept="image/*"
                        className="text-xs file:py-1 file:px-2.5 file:rounded-md file:border-0 file:bg-slate-100 dark:file:bg-[#1B314F] file:text-slate-800 dark:file:text-slate-100"
                        onChange={handlePhotoChange}
                      />
                      {profilePhoto && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <img src={profilePhoto} alt="Preview" className="w-8 h-8 rounded-full object-cover border border-[#E2E8F0] dark:border-[#1E3A5F]" />
                          <span className="text-[11px] text-[#475569] dark:text-slate-300">Photo attached</span>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

            </div>
          )}

          {/* Submit Action */}
          <Button
            type="submit"
            className="w-full h-11 text-base font-semibold shadow-sm mt-4"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Processing Request...
              </span>
            ) : isRegister ? (
              'Create Clinical Account'
            ) : (
              'Secure Sign In'
            )}
          </Button>
        </form>

        {/* Toggle Login/Register */}
        <div className="mt-6 pt-4 border-t border-[#E2E8F0] dark:border-[#1E3A5F] text-center text-xs text-[#475569] dark:text-[#94A3B8]">
          <span>
            {isRegister ? 'Already have an authorized account?' : 'Need to establish authorized clinical access?'}
          </span>{' '}
          <button
            type="button"
            className="font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline"
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
              setSuccessMessage('');
              setTimeoutMessage('');
              sessionStorage.removeItem('sessionTimedOut');
            }}
          >
            {isRegister ? 'Sign In' : 'Create Account'}
          </button>
        </div>

      </div>
    </div>
  );
}
