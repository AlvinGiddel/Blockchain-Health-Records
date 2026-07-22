import React, { useState } from 'react';
import { Shield, Lock, Mail, User, Activity, AlertCircle, Heart, Stethoscope, ArrowLeft, KeyRound, Eye, EyeOff } from 'lucide-react';
import logoSvg from '../assets/logo.svg';
export default function Login({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [role, setRole] = useState('patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [developerLink, setDeveloperLink] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [timeoutMessage, setTimeoutMessage] = useState(() => {
    return sessionStorage.getItem('sessionTimedOut') === 'true' ? 'your login session timed out please login again' : '';
  });

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

  const checkPhoneAvailability = async (phoneVal) => {
    const digitsOnly = (phoneVal || '').replace(/[^0-9]/g, '');
    if (!digitsOnly || digitsOnly.length < 5) {
      setPhoneError('');
      return;
    }

    try {
      const res = await fetch(`/api/auth/check-phone?phone=${encodeURIComponent(phoneVal)}`);
      const data = await res.json();
      if (data.exists) {
        setPhoneError('This phone number is already registered to another account. Duplicate phone numbers are not allowed.');
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
    setDeveloperLink('');
    setPreviewUrl('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Password reset request failed.');
      }

      setSuccessMessage(data.message);
      if (data.resetUrl) {
        setDeveloperLink(data.resetUrl);
      }
      if (data.previewUrl) {
        setPreviewUrl(data.previewUrl);
      }
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
      setError('Registration as Administrator is not permitted.');
      setLoading(false);
      return;
    }

    if (isRegister && phoneError) {
      setError(phoneError);
      setLoading(false);
      return;
    }

    const url = isRegister ? '/api/auth/register' : '/api/auth/login';

    // Construct request body
    const body = { email, password };
    if (isRegister) {
      body.name = name;
      body.role = role;

      if (role === 'patient') {
        body.profile = {
          age: parseInt(age),
          gender,
          bloodType,
          allergies: allergies.split(',').map(a => a.trim()).filter(a => a !== ''),
          phone
        };
      } else if (role === 'doctor') {
        body.profile = {
          specialization,
          licenseNumber,
          hospital,
          yearsOfExperience: parseInt(yearsOfExperience) || 0,
          profilePhoto,
          phone
        };
      }
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed. Please check your credentials.');
      }

      if (data.token) {
        onLoginSuccess(data);
      } else {
        // Pending admin registration
        setSuccessMessage(data.message || 'Registration successful! Pending admin approval.');
        setIsRegister(false);
        // Clear all fields
        setEmail('');
        setPassword('');
        setName('');
        setAge('');
        setGender('');
        setBloodType('');
        setAllergies('');
        setEmergencyContact('');
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

  if (isForgotPassword) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', padding: '20px' }}>
        <div className="glass-card" style={{ width: '100%', maxWidth: '450px' }}>
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ background: 'var(--glass-glow)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <KeyRound size={32} color="var(--color-primary)" />
            </div>
            <h2 style={{ fontSize: '1.75rem', marginBottom: '6px' }}>Reset Password</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Enter your email address and we will dispatch a secure reset link.
            </p>
          </div>

          {successMessage && (
            <div className="badge-success" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px', borderRadius: '8px', marginBottom: '20px', width: '100%', fontSize: '0.9rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}>
                <Shield size={18} />
                <span>Success</span>
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#10b981', opacity: 0.95 }}>{successMessage}</p>
            </div>
          )}

          {error && (
            <div className="badge-error" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', borderRadius: '8px', marginBottom: '20px', width: '100%', fontSize: '0.9rem' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleForgotPasswordSubmit}>
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label htmlFor="reset-email">Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  id="reset-email"
                  className="form-control"
                  style={{ paddingLeft: '36px', width: '100%' }}
                  placeholder="e.g. jane.doe@example.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
              disabled={loading}
            >
              {loading ? 'Sending Request...' : 'Send Reset Link'}
            </button>
          </form>

          {/* Developer Link Preview */}
          {developerLink && (
            <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(99, 102, 241, 0.08)', border: '1px dashed rgba(99, 102, 241, 0.3)', borderRadius: '10px', fontSize: '0.85rem' }}>
              <p style={{ color: 'var(--color-accent)', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🔧 Developer Testing Sandbox
              </p>
              <p style={{ marginBottom: '8px', color: 'var(--text-secondary)' }}>You can click the link below to reset the password immediately without checking an email client:</p>
              <a href={developerLink} className="btn btn-primary" style={{ display: 'block', textDecoration: 'none', padding: '8px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '0.85rem', marginBottom: '8px', border: '1px solid rgba(99,102,241,0.5)' }}>
                Reset Link (Direct Access)
              </a>
              {previewUrl && (
                <div style={{ marginTop: '12px' }}>
                  <p style={{ marginBottom: '8px', color: 'var(--text-secondary)' }}>View fully formatted HTML mail sandbox:</p>
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ display: 'block', textDecoration: 'none', padding: '8px 12px', borderRadius: '6px', textAlign: 'center', fontSize: '0.85rem' }}>
                    Open Ethereal Mail Inbox 📥
                  </a>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.9rem', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              onClick={() => {
                setIsForgotPassword(false);
                setError('');
                setSuccessMessage('');
                setTimeoutMessage('');
                sessionStorage.removeItem('sessionTimedOut');
                setDeveloperLink('');
                setPreviewUrl('');
              }}
            >
              <ArrowLeft size={16} /> Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh', padding: '20px' }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: isRegister ? '650px' : '450px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ background: 'var(--glass-glow)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <img src={logoSvg} alt="Logo" style={{ width: '32px', height: '32px' }} className="rotate-slow" />
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '6px' }}>
            {isRegister ? 'Create Account' : 'Secure Login'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {isRegister ? 'Register as Patient or Healthcare Provider' : 'Enter your credentials to access health records'}
          </p>
        </div>

        {timeoutMessage && (
          <div className="badge-warning" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', borderRadius: '8px', marginBottom: '20px', width: '100%', fontSize: '0.9rem', backgroundColor: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#f59e0b' }}>
            <AlertCircle size={18} />
            <span>{timeoutMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="badge-success" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', borderRadius: '8px', marginBottom: '20px', width: '100%', fontSize: '0.9rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10b981' }}>
            <Shield size={18} />
            <span>{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="badge-error" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', borderRadius: '8px', marginBottom: '20px', width: '100%', fontSize: '0.9rem' }}>
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', gap: '8px' }}>Role Selection</label>
              <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
                <button
                  type="button"
                  className={`btn ${role === 'patient' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setRole('patient')}
                >
                  <Heart size={16} /> Patient
                </button>
                <button
                  type="button"
                  className={`btn ${role === 'doctor' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                  onClick={() => setRole('doctor')}
                >
                  <Stethoscope size={16} /> Doctor
                </button>
              </div>
            </div>
          )}

          <div className={isRegister ? 'grid-login-fields register' : 'grid-login-fields'}>
            <div>
              {isRegister && (
                <div className="form-group">
                  <label htmlFor="name">Full Name</label>
                  <div style={{ position: 'relative' }}>
                    <User size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      id="name"
                      className="form-control"
                      style={{ paddingLeft: '36px', width: '100%' }}
                      placeholder="e.g. Jane Doe"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-muted)' }} />
                  <input
                    type="email"
                    id="email"
                    className="form-control"
                    style={{ paddingLeft: '36px', width: '100%' }}
                    placeholder="e.g. jane.doe@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">Password</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={16} style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-muted)' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    className="form-control"
                    style={{ paddingLeft: '36px', paddingRight: '40px', width: '100%' }}
                    placeholder="••••••••"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      top: '12px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: '0',
                      transition: 'color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {!isRegister && (
                  <div style={{ textAlign: 'right', marginTop: '6px' }}>
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        padding: '2px 4px',
                        transition: 'color 0.2s'
                      }}
                      onClick={() => {
                        setIsForgotPassword(true);
                        setError('');
                        setSuccessMessage('');
                        setTimeoutMessage('');
                        sessionStorage.removeItem('sessionTimedOut');
                        setDeveloperLink('');
                        setPreviewUrl('');
                      }}
                      onMouseEnter={(e) => e.target.style.color = 'var(--color-primary)'}
                      onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}
              </div>
            </div>

            {isRegister && (
              <div className="login-register-details">
                {role === 'patient' && (
                  <>
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--color-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Activity size={16} /> Patient Health Vitals
                    </h4>
                    <div className="form-group">
                      <label htmlFor="age">Age</label>
                      <input
                        type="number"
                        id="age"
                        className="form-control"
                        placeholder="e.g. 35"
                        required
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="gender">Gender</label>
                      <select id="gender" className="form-control" value={gender} onChange={(e) => setGender(e.target.value)} required>
                        <option value="">-- Select Gender --</option>
                        <option>Male</option>
                        <option>Female</option>
                        <option>Prefer not to say</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="bloodType">Blood Group</label>
                      <select id="bloodType" className="form-control" value={bloodType} onChange={(e) => setBloodType(e.target.value)} required>
                        <option value="">-- Select Blood Group --</option>
                        <option>A+</option>
                        <option>A-</option>
                        <option>B+</option>
                        <option>B-</option>
                        <option>AB+</option>
                        <option>AB-</option>
                        <option>O+</option>
                        <option>O-</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="allergies">Allergies (comma separated)</label>
                      <input
                        type="text"
                        id="allergies"
                        className="form-control"
                        placeholder="e.g. Penicillin, Peanuts (or leave empty)"
                        value={allergies}
                        onChange={(e) => setAllergies(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="patientPhone">Contact Phone Number</label>
                      <input
                        type="tel"
                        id="patientPhone"
                        className="form-control"
                        placeholder="e.g. +254 700 111222"
                        required
                        value={phone}
                        style={phoneError ? { borderColor: '#ef4444', boxShadow: '0 0 8px rgba(239, 68, 68, 0.3)' } : {}}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          checkPhoneAvailability(e.target.value);
                        }}
                        onBlur={(e) => checkPhoneAvailability(e.target.value)}
                      />
                      {phoneError && (
                        <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <AlertCircle size={14} /> {phoneError}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {role === 'doctor' && (
                  <>
                    <h4 style={{ fontSize: '0.9rem', color: 'var(--color-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Stethoscope size={16} /> Clinical Qualifications
                    </h4>
                    <div className="form-group">
                      <label htmlFor="specialization">Specialization</label>
                      <input
                        type="text"
                        id="specialization"
                        className="form-control"
                        placeholder="e.g. Cardiologist / General Practitioner"
                        required
                        value={specialization}
                        onChange={(e) => setSpecialization(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="license">Medical License Number</label>
                      <input
                        type="text"
                        id="license"
                        className="form-control"
                        placeholder="e.g. KMPDB-12345"
                        required
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="hospital">Affiliated Hospital</label>
                      <input
                        type="text"
                        id="hospital"
                        className="form-control"
                        placeholder="e.g. Princeton-Plainsboro"
                        required
                        value={hospital}
                        onChange={(e) => setHospital(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="yearsOfExperience">Years of Experience</label>
                      <input
                        type="number"
                        id="yearsOfExperience"
                        className="form-control"
                        placeholder="e.g. 8"
                        required
                        min="0"
                        value={yearsOfExperience}
                        onChange={(e) => setYearsOfExperience(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="docPhone">Contact Phone Number</label>
                      <input
                        type="tel"
                        id="docPhone"
                        className="form-control"
                        placeholder="e.g. +254 700 111222"
                        required
                        value={phone}
                        style={phoneError ? { borderColor: '#ef4444', boxShadow: '0 0 8px rgba(239, 68, 68, 0.3)' } : {}}
                        onChange={(e) => {
                          setPhone(e.target.value);
                          checkPhoneAvailability(e.target.value, false);
                        }}
                        onBlur={(e) => checkPhoneAvailability(e.target.value, false)}
                      />
                      {phoneError && (
                        <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <AlertCircle size={14} /> {phoneError}
                        </div>
                      )}
                    </div>
                    <div className="form-group">
                      <label htmlFor="profilePhoto">Profile Photo (Optional)</label>
                      <input
                        type="file"
                        id="profilePhoto"
                        accept="image/*"
                        className="form-control"
                        style={{ padding: '6px' }}
                        onChange={handlePhotoChange}
                      />
                      {profilePhoto && (
                        <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <img src={profilePhoto} alt="Preview" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--glass-border)' }} />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Image loaded successfully</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {role === 'admin' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '20px 10px' }}>
                    <img src={logoSvg} alt="Logo" style={{ width: '48px', height: '48px', marginBottom: '16px' }} className="rotate-slow" />
                    <h4 style={{ fontSize: '1rem', color: 'var(--text-primary)', marginBottom: '8px' }}>Security Admin Node</h4>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                      Administrator accounts are initialized with full network monitoring capability, ledger verification logs, and database repair validation modules.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '24px', padding: '12px' }}
            disabled={loading}
          >
            {loading ? 'Processing...' : isRegister ? 'Create Account & Generate Keys' : 'Secure Login'}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.9rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            {isRegister ? 'Already have an account?' : "Don't have an account?"}
          </span>{' '}
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontWeight: '600' }}
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
              setSuccessMessage('');
              setTimeoutMessage('');
              sessionStorage.removeItem('sessionTimedOut');
            }}
          >
            {isRegister ? 'Login Here' : 'Register Here'}
          </button>
        </div>
      </div>
    </div>
  );
}
