import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, Activity, Heart, ShieldCheck, AlertTriangle, Edit3, Save, X, Stethoscope, Briefcase, FileText, Lock } from 'lucide-react';

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

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile.');
      
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
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <div className="user-avatar" style={{ width: '96px', height: '96px', borderRadius: '50%', fontSize: '2.25rem' }}>
              {getInitials(user.name)}
            </div>
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>{user.name}</h2>
          <span className="badge badge-success" style={{ textTransform: 'uppercase', padding: '4px 12px', fontSize: '0.75rem', letterSpacing: '0.5px' }}>
            {user.role}
          </span>
          
          <div style={{ marginTop: '24px', borderTop: '1px solid var(--glass-border)', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
              <Mail size={16} />
              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{user.email}</span>
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


    </div>
  );
}
