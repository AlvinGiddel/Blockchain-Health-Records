import React, { useState, useEffect, useRef } from 'react';
import { User, Mail, Phone, Activity, Heart, ShieldCheck, AlertTriangle, Edit3, Save, X, Stethoscope, Briefcase, FileText, Lock, Camera, Upload, Trash2 } from 'lucide-react';
import { safeFetch } from '../utils/api';
import { compressImage } from '../utils/imageUtils';

export default function Profile({ user, onUpdateUser }) {
  const [isEditing, setIsEditing] = useState(false);
  
  // Patient fields
  const [editName, setEditName] = useState(user.name || '');
  const [editAge, setEditAge] = useState(user.patientProfile?.age || '');
  const [editGender, setEditGender] = useState(user.patientProfile?.gender || '');
  const [editBloodType, setEditBloodType] = useState(user.patientProfile?.bloodType || '');
  const [editPhone, setEditPhone] = useState(user.patientProfile?.phone || user.doctorProfile?.phone || '');
  const formatAllergiesStr = (alg) => Array.isArray(alg) ? alg.join(', ') : (typeof alg === 'string' ? alg : '');
  const [editAllergies, setEditAllergies] = useState(formatAllergiesStr(user.patientProfile?.allergies));

  // Doctor fields
  const [editSpecialization, setEditSpecialization] = useState(user.doctorProfile?.specialization || '');
  const [editHospital, setEditHospital] = useState(user.doctorProfile?.hospital || '');
  const [editYearsOfExperience, setEditYearsOfExperience] = useState(user.doctorProfile?.yearsOfExperience || '');
  const [editLicenseNumber, setEditLicenseNumber] = useState(user.doctorProfile?.licenseNumber || '');
  
  // Status feedback
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);

  // Photo management state
  const photoInputRef = useRef(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMsg, setPhotoMsg] = useState('');

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    setPhotoMsg('');
    try {
      const compressedDataUrl = await compressImage(file, 320, 320, 0.85);
      const data = await safeFetch('/api/users/update-profile-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id || user._id,
          profilePhoto: compressedDataUrl
        })
      });
      if (onUpdateUser && data.user) {
        onUpdateUser(data.user);
      }
      setPhotoMsg('Profile picture updated successfully!');
      setTimeout(() => setPhotoMsg(''), 3000);
    } catch (err) {
      setPhotoMsg(err.message || 'Failed to update photo.');
      setTimeout(() => setPhotoMsg(''), 4000);
    } finally {
      setPhotoUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = async () => {
    if (!window.confirm('Are you sure you want to remove your profile picture?')) return;
    setPhotoUploading(true);
    try {
      const data = await safeFetch('/api/users/update-profile-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id || user._id,
          profilePhoto: null
        })
      });
      if (onUpdateUser && data.user) {
        onUpdateUser(data.user);
      }
      setPhotoMsg('Profile picture removed.');
      setTimeout(() => setPhotoMsg(''), 3000);
    } catch (err) {
      setPhotoMsg(err.message || 'Failed to remove photo.');
      setTimeout(() => setPhotoMsg(''), 4000);
    } finally {
      setPhotoUploading(false);
    }
  };

  // Email update modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');

    const cleanNewEmail = newEmail.toLowerCase().trim();
    if (!cleanNewEmail) {
      setEmailError('Please enter a new email address.');
      return;
    }

    if (cleanNewEmail === (user.email || '').toLowerCase().trim()) {
      setEmailError('New email must be different from your current email address.');
      return;
    }

    setEmailLoading(true);
    try {
      const data = await safeFetch('/api/auth/update-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id || user._id,
          newEmail: cleanNewEmail,
          currentPassword: emailPassword
        })
      });

      setEmailSuccess(data.message || 'Email address updated successfully!');
      setNewEmail('');
      setEmailPassword('');
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
      if (onUpdateUser && data.user) {
        onUpdateUser(data.user);
      }
      setTimeout(() => {
        setShowEmailModal(false);
        setEmailSuccess('');
      }, 1400);
    } catch (err) {
      setEmailError(err.message || 'Failed to update email address.');
    } finally {
      setEmailLoading(false);
    }
  };

  // Sync edits when user updates
  useEffect(() => {
    setEditName(user.name || '');
    if (user.role === 'patient') {
      setEditAge(user.patientProfile?.age || '');
      setEditGender(user.patientProfile?.gender || '');
      setEditBloodType(user.patientProfile?.bloodType || '');
      setEditPhone(user.patientProfile?.phone || '');
      setEditAllergies(formatAllergiesStr(user.patientProfile?.allergies));
    } else if (user.role === 'doctor') {
      setEditPhone(user.doctorProfile?.phone || '');
      setEditSpecialization(user.doctorProfile?.specialization || '');
      setEditHospital(user.doctorProfile?.hospital || '');
      setEditYearsOfExperience(user.doctorProfile?.yearsOfExperience || '');
      setEditLicenseNumber(user.doctorProfile?.licenseNumber || '');
    }
  }, [user]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setSaving(true);

    try {
      const endpoint = user.role === 'patient' ? '/api/users/patient/profile' : '/api/users/doctor/profile';
      const bodyPayload = user.role === 'patient' ? {
        userId: user.id || user._id,
        name: editName,
        age: parseInt(editAge) || undefined,
        gender: editGender,
        bloodType: editBloodType,
        allergies: editAllergies,
        phone: editPhone
      } : {
        userId: user.id || user._id,
        name: editName,
        specialization: editSpecialization,
        hospital: editHospital,
        yearsOfExperience: parseInt(editYearsOfExperience) || 0,
        licenseNumber: editLicenseNumber,
        phone: editPhone
      };

      const data = await safeFetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      
      setSuccessMsg('Profile updated successfully!');
      if (onUpdateUser) {
        onUpdateUser(data.user);
      }
      setTimeout(() => {
        setIsEditing(false);
        setSuccessMsg('');
      }, 1200);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>My Account & Profile</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Manage your personal details, secure contacts, and identity credentials</p>
      </div>

      <div className="grid-3" style={{ gap: '24px', alignItems: 'start' }}>
        {/* Profile Card Summary */}
        <div className="glass-card" style={{ textAlign: 'center', padding: '32px 24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '20px' }}>
            <div 
              style={{ position: 'relative', width: '104px', height: '104px', cursor: 'pointer' }}
              onClick={() => photoInputRef.current?.click()}
              title="Click to change profile picture"
            >
              <div 
                className="user-avatar" 
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  borderRadius: '50%', 
                  fontSize: '2.5rem', 
                  overflow: 'hidden', 
                  border: '3px solid var(--glass-border)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {user.profilePhoto ? (
                  <img src={user.profilePhoto} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  getInitials(user.name)
                )}
              </div>
              
              {/* Camera Icon Overlay button */}
              <div 
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  background: 'var(--color-primary)',
                  color: '#fff',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                  border: '2px solid var(--bg-card)'
                }}
                title="Upload new photo"
              >
                <Camera size={16} />
              </div>
            </div>

            <input 
              type="file" 
              ref={photoInputRef} 
              style={{ display: 'none' }} 
              accept="image/png, image/jpeg, image/webp" 
              onChange={handlePhotoSelect} 
            />

            {/* Quick photo actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                onClick={() => photoInputRef.current?.click()}
                disabled={photoUploading}
              >
                <Upload size={12} /> {photoUploading ? 'Uploading...' : 'Change Photo'}
              </button>
              {user.profilePhoto && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--color-error)' }}
                  onClick={handleRemovePhoto}
                  disabled={photoUploading}
                  title="Remove profile photo"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>

            {photoMsg && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', marginTop: '8px', fontWeight: 600 }}>
                {photoMsg}
              </span>
            )}
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>{user.name}</h2>
          <span className="badge badge-success" style={{ textTransform: 'uppercase', padding: '4px 12px', fontSize: '0.75rem', letterSpacing: '0.5px' }}>
            {user.role}
          </span>
          
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                <Mail size={16} style={{ flexShrink: 0 }} />
                <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{user.email}</span>
              </div>
              <button 
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowEmailModal(true);
                  setEmailError('');
                  setEmailSuccess('');
                  setNewEmail('');
                  setEmailPassword('');
                }}
                style={{ padding: '2px 8px', fontSize: '0.72rem', flexShrink: 0 }}
                title="Change account email"
              >
                Change
              </button>
            </div>
            {(user.patientProfile?.phone || user.doctorProfile?.phone) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                <Phone size={16} />
                <span>{user.patientProfile?.phone || user.doctorProfile?.phone}</span>
              </div>
            )}
          </div>
        </div>

        {/* Details Card */}
        <div className="glass-card span-2-desktop">
          {!isEditing ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <User size={20} /> Personal Profile Details
                </h3>
                {user.role === 'patient' && (
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', gap: '6px' }}
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit3 size={14} /> Edit Profile
                  </button>
                )}
                {user.role === 'doctor' && (
                  user.doctorProfile?.hasEditedProfile ? (
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-error)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239, 68, 68, 0.05)', padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                      <Lock size={14} /> Profile Locked (One-Time Update Completed)
                    </span>
                  ) : (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', gap: '6px' }}
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit3 size={14} /> Edit Profile
                    </button>
                  )
                )}
              </div>

              {/* Patient Profile view */}
              {user.role === 'patient' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="grid-2" style={{ gap: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Full Name</span>
                        <span style={{ fontWeight: 600 }}>{user.name}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Age</span>
                        <span style={{ fontWeight: 600 }}>{user.patientProfile?.age ? `${user.patientProfile.age} years` : 'Not provided'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Gender</span>
                        <span style={{ fontWeight: 600 }}>{user.patientProfile?.gender || 'Not provided'}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Blood Group</span>
                        <span className="badge badge-success" style={{ fontSize: '0.8rem' }}>{user.patientProfile?.bloodType || 'O+'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Contact Phone Number</span>
                        <span style={{ fontWeight: 600 }}>{user.patientProfile?.phone || 'Not provided'}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                    <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertTriangle size={14} color="var(--color-warning)" /> Known Allergies
                    </span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {user.patientProfile?.allergies && user.patientProfile.allergies.length > 0 ? (
                        user.patientProfile.allergies.map((allergy, i) => (
                          <span key={i} className="badge badge-error" style={{ textTransform: 'capitalize' }}>{allergy}</span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No known allergies</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Doctor Profile view */}
              {user.role === 'doctor' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Specialization</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{user.doctorProfile?.specialization || 'Clinical Practitioner'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>License Number</span>
                    <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{user.doctorProfile?.licenseNumber || 'N/A'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Hospital</span>
                    <span style={{ fontWeight: 600 }}>{user.doctorProfile?.hospital || 'Hospital Node'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Years of Experience</span>
                    <span style={{ fontWeight: 600 }}>{user.doctorProfile?.yearsOfExperience || '0'} years</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Phone Number</span>
                    <span style={{ fontWeight: 600 }}>{user.doctorProfile?.phone || 'Not provided'}</span>
                  </div>
                </div>
              )}

              {/* Admin Profile view */}
              {user.role === 'admin' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>System Role</span>
                    <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>Full System Administrator</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Account Status</span>
                    <span className="badge badge-success">Approved / Secure</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Editing Profile mode */
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Edit3 size={20} /> Edit Profile details
                </h3>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                  onClick={() => setIsEditing(false)}
                >
                  <X size={14} /> Cancel
                </button>
              </div>

              {errorMsg && (
                <div className="badge-error" style={{ padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem' }}>
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div className="badge-success" style={{ padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                  {successMsg}
                </div>
              )}

              <form onSubmit={handleSaveProfile}>
                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="edit-name">Full Name</label>
                  <input
                    type="text"
                    id="edit-name"
                    className="form-control"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </div>

                {user.role === 'patient' ? (
                  <>
                    <div className="grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                      <div className="form-group">
                        <label htmlFor="edit-age">Age</label>
                        <input
                          type="number"
                          id="edit-age"
                          className="form-control"
                          required
                          value={editAge}
                          onChange={(e) => setEditAge(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="edit-gender">Gender</label>
                        <select
                          id="edit-gender"
                          className="form-control"
                          required
                          value={editGender}
                          onChange={(e) => setEditGender(e.target.value)}
                        >
                          <option value="">-- Select Gender --</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Prefer not to say">Prefer not to say</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                      <div className="form-group">
                        <label htmlFor="edit-bloodType">Blood Group</label>
                        <select
                          id="edit-bloodType"
                          className="form-control"
                          required
                          value={editBloodType}
                          onChange={(e) => setEditBloodType(e.target.value)}
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
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="edit-phone">Phone Number</label>
                        <input
                          type="text"
                          id="edit-phone"
                          className="form-control"
                          required
                          placeholder="+254 700 000000"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '20px' }}>
                      <label htmlFor="edit-allergies">Known Allergies (comma-separated)</label>
                      <input
                        type="text"
                        id="edit-allergies"
                        className="form-control"
                        placeholder="e.g. Penicillin, Peanuts (or leave empty)"
                        value={editAllergies}
                        onChange={(e) => setEditAllergies(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                      <div className="form-group">
                        <label htmlFor="edit-specialization">Specialization</label>
                        <input
                          type="text"
                          id="edit-specialization"
                          className="form-control"
                          required
                          value={editSpecialization}
                          onChange={(e) => setEditSpecialization(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="edit-licenseNumber">License Number</label>
                        <input
                          type="text"
                          id="edit-licenseNumber"
                          className="form-control"
                          required
                          value={editLicenseNumber}
                          onChange={(e) => setEditLicenseNumber(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                      <div className="form-group">
                        <label htmlFor="edit-hospital">Affiliated Hospital</label>
                        <input
                          type="text"
                          id="edit-hospital"
                          className="form-control"
                          required
                          value={editHospital}
                          onChange={(e) => setEditHospital(e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="edit-yearsOfExperience">Years of Experience</label>
                        <input
                          type="number"
                          id="edit-yearsOfExperience"
                          className="form-control"
                          required
                          value={editYearsOfExperience}
                          onChange={(e) => setEditYearsOfExperience(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '20px' }}>
                      <label htmlFor="edit-phone">Contact Phone Number</label>
                      <input
                        type="text"
                        id="edit-phone"
                        className="form-control"
                        required
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                      />
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    disabled={saving}
                    onClick={() => setIsEditing(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>


      {/* Change Email Modal */}
      {showEmailModal && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setShowEmailModal(false)}
        >
          <div 
            className="glass-card" 
            style={{ width: '100%', maxWidth: '440px', padding: '28px', border: '1px solid var(--glass-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                <Mail size={20} /> Update Email Address
              </h3>
              <button 
                type="button" 
                onClick={() => setShowEmailModal(false)}
                className="btn btn-secondary"
                style={{ padding: '4px 8px', fontSize: '0.8rem' }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Enter your new email address and current password to verify your identity.
            </p>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Current:</span>
              <strong style={{ color: 'var(--color-primary)', fontFamily: 'monospace' }}>{user.email}</strong>
            </div>

            {emailError && (
              <div className="badge-error" style={{ padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem' }}>
                {emailError}
              </div>
            )}
            {emailSuccess && (
              <div className="badge-success" style={{ padding: '8px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                {emailSuccess}
              </div>
            )}

            <form onSubmit={handleUpdateEmail}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>New Email Address</label>
                <input
                  type="email"
                  className="form-control"
                  required
                  placeholder="e.g. new.email@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem' }}>Current Password</label>
                <input
                  type="password"
                  className="form-control"
                  required
                  placeholder="Enter your current password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '10px' }}
                  onClick={() => setShowEmailModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '10px' }}
                  disabled={emailLoading}
                >
                  {emailLoading ? 'Updating...' : 'Save Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
