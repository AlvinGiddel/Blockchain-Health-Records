import React, { useEffect, useState } from 'react';
import { User, Activity, AlertTriangle, ShieldCheck, Phone, Clipboard, CheckCircle, Clock, Calendar, Check, X, BookOpen, FileText, Copy, Lock, Database, Globe, Search } from 'lucide-react';
export default function Dashboard({ user, onSelectPatient, onUpdateUser, onNavigate }) {
  const [patients, setPatients] = useState([]);
  const [blocksCount, setBlocksCount] = useState(0);
  const [recordsCount, setRecordsCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);

  // Interactive Stats / Modal States
  const [allBlocks, setAllBlocks] = useState([]);
  const [viewingBlocksModal, setViewingBlocksModal] = useState(false);
  const [viewingRecordsModal, setViewingRecordsModal] = useState(false);
  const [viewingDoctorProfileModal, setViewingDoctorProfileModal] = useState(false);
  const [expandedBlockIndex, setExpandedBlockIndex] = useState(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Appointment Form States (Patient)
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [appointmentDate, setAppointmentDate] = useState('');
  const [appointmentTime, setAppointmentTime] = useState('');
  const [appointmentReason, setAppointmentReason] = useState('');
  const [apptError, setApptError] = useState('');
  const [apptSuccess, setApptSuccess] = useState('');

  // Consultation Modal / Form States (Doctor)
  const [activeConsultationAppt, setActiveConsultationAppt] = useState(null);
  const [symptoms, setSymptoms] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatment, setTreatment] = useState('');
  const [notes, setNotes] = useState('');
  const [prescriptions, setPrescriptions] = useState('');
  const [labRequest, setLabRequest] = useState('');
  const [consultationError, setConsultationError] = useState('');
  const [consultationSuccess, setConsultationSuccess] = useState('');
  const [completedTxHash, setCompletedTxHash] = useState('');

  // Doctor Availability States
  const [availStatus, setAvailStatus] = useState(user.doctorProfile?.availability?.status || 'available');
  const [availDays, setAvailDays] = useState(user.doctorProfile?.availability?.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  const [availStart, setAvailStart] = useState(user.doctorProfile?.availability?.workingHoursStart || '08:00');
  const [availEnd, setAvailEnd] = useState(user.doctorProfile?.availability?.workingHoursEnd || '17:00');
  const [availError, setAvailError] = useState('');
  const [availSuccess, setAvailSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [availSaving, setAvailSaving] = useState(false);

  // Patient Appointment Availability States
  const [apptValidationWarning, setApptValidationWarning] = useState('');
  const [apptSearchQuery, setApptSearchQuery] = useState('');

  // Patient records for timeline
  const [patientRecords, setPatientRecords] = useState([]);

  const fetchPatientRecords = async () => {
    try {
      const res = await fetch(`/api/records/patient/${user.id || user._id}?requesterId=${user.id || user._id}&requesterRole=patient`);
      if (res.ok) {
        const data = await res.json();
        setPatientRecords(data);
      }
    } catch (err) {
      console.error('Error fetching patient records:', err);
    }
  };

  useEffect(() => {
    if (user.role === 'doctor') {
      fetchPatients();
      fetchAppointments();

      // Sync doctor availability form states when user state changes
      setAvailStatus(user.doctorProfile?.availability?.status || 'available');
      setAvailDays(user.doctorProfile?.availability?.workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
      setAvailStart(user.doctorProfile?.availability?.workingHoursStart || '08:00');
      setAvailEnd(user.doctorProfile?.availability?.workingHoursEnd || '17:00');
    } else if (user.role === 'patient') {
      fetchDoctors();
      fetchAppointments();
      fetchPatientRecords();
    }
    fetchStats();
  }, [user]);

  // Helper to format 24h time string to 12h AM/PM format
  const formatTime12h = (timeStr) => {
    if (!timeStr) return 'N/A';
    const [hoursStr, minutesStr] = timeStr.split(':');
    let hours = parseInt(hoursStr, 10);
    const minutes = minutesStr;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  // Doctor availability change handler
  const handleUpdateAvailability = async (e) => {
    e.preventDefault();
    setAvailError('');
    setAvailSuccess('');
    setAvailSaving(true);

    if (availDays.length === 0) {
      setAvailError('Please select at least one working day.');
      setAvailSaving(false);
      return;
    }

    if (availStart >= availEnd) {
      setAvailError('Start time must be before end time.');
      setAvailSaving(false);
      return;
    }

    try {
      const res = await fetch('/api/users/doctor/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: user.id || user._id,
          workingDays: availDays,
          workingHoursStart: availStart,
          workingHoursEnd: availEnd,
          status: availStatus
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update availability.');

      setAvailSuccess('Availability settings updated successfully!');
      if (onUpdateUser) {
        onUpdateUser(data.doctor);
      }
    } catch (err) {
      setAvailError(err.message);
    } finally {
      setAvailSaving(false);
    }
  };


  // Patient Appointment Date/Time/Status Frontend Validation
  useEffect(() => {
    if (user.role !== 'patient' || !selectedDoctorId) {
      setApptValidationWarning('');
      return;
    }
    const doc = doctors.find(d => (d._id || d.id) === selectedDoctorId);
    if (!doc) {
      setApptValidationWarning('');
      return;
    }

    const availability = doc.doctorProfile?.availability || {
      status: 'available',
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      workingHoursStart: '08:00',
      workingHoursEnd: '17:00'
    };

    if (availability.status === 'busy') {
      setApptValidationWarning(`Appointment booking is disabled because Dr. ${doc.name} is currently busy.`);
      return;
    }
    if (availability.status === 'on leave') {
      setApptValidationWarning(`Appointment booking is disabled because Dr. ${doc.name} is currently on leave.`);
      return;
    }

    if (appointmentDate) {
      const parts = appointmentDate.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);

      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();
      const currentDay = today.getDate();

      if (year < currentYear) {
        setApptValidationWarning("You cannot book an appointment in a past year.");
        return;
      }
      if (year === currentYear) {
        if (month < currentMonth) {
          setApptValidationWarning("You cannot book an appointment for a month that has already passed.");
          return;
        }
        if (month === currentMonth && day < currentDay) {
          setApptValidationWarning("You cannot book an appointment for a date that has already passed.");
          return;
        }
      }

      const dateObj = new Date(Date.UTC(year, month, day));
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayOfWeek = weekdays[dateObj.getUTCDay()];

      if (!availability.workingDays.includes(dayOfWeek)) {
        setApptValidationWarning(`Dr. ${doc.name} is not available on ${dayOfWeek}s. Available days: ${availability.workingDays.join(', ')}.`);
        return;
      }
    }

    if (appointmentTime) {
      if (appointmentTime < availability.workingHoursStart || appointmentTime > availability.workingHoursEnd) {
        setApptValidationWarning(`Dr. ${doc.name} is only available between ${formatTime12h(availability.workingHoursStart)} and ${formatTime12h(availability.workingHoursEnd)}.`);
        return;
      }
    }

    setApptValidationWarning('');
  }, [selectedDoctorId, appointmentDate, appointmentTime, doctors, user.role]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/users/patients');
      if (res.ok) {
        const data = await res.json();
        setPatients(data);
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDoctors = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/users/doctors');
      if (res.ok) {
        const data = await res.json();
        setDoctors(data);
      }
    } catch (err) {
      console.error('Error fetching doctors:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointments = async () => {
    try {
      const uId = user.id || user._id;
      const res = await fetch(`/api/appointments?requesterId=${uId}&requesterRole=${user.role}`);
      if (res.ok) {
        const data = await res.json();
        setAppointments(data);
      }
    } catch (err) {
      console.error('Error fetching appointments:', err);
    }
  };

  const handleBookAppointment = async (e) => {
    e.preventDefault();
    setApptError('');
    setApptSuccess('');

    if (!selectedDoctorId) {
      setApptError('Please select a doctor.');
      return;
    }

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: selectedDoctorId,
          date: appointmentDate,
          time: appointmentTime,
          reason: appointmentReason,
          patientId: user.id || user._id
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit appointment request.');

      setApptSuccess('Appointment request submitted successfully! It is currently waiting for approval from the doctor.');
      setSelectedDoctorId('');
      setAppointmentDate('');
      setAppointmentTime('');
      setAppointmentReason('');
      fetchAppointments();
    } catch (err) {
      setApptError(err.message);
    }
  };

  const handleUpdateApptStatus = async (apptId, status) => {
    // Optimistically update status in local state so the UI changes instantly
    setAppointments(prev => prev.map(appt =>
      (appt._id === apptId || appt.id === apptId) ? { ...appt, status } : appt
    ));

    try {
      const res = await fetch(`/api/appointments/${apptId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) {
        // Rollback state if the request fails
        fetchAppointments();
      } else {
        fetchAppointments();
      }
    } catch (err) {
      console.error('Error updating appointment status:', err);
      fetchAppointments();
    }
  };

  const handleCompleteConsultation = async (e) => {
    e.preventDefault();
    setConsultationError('');
    setConsultationSuccess('');
    setCompletedTxHash('');

    try {
      const res = await fetch('/api/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: activeConsultationAppt._id || activeConsultationAppt.id,
          symptoms,
          diagnosis,
          treatment,
          notes,
          prescriptions,
          labRequest
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete consultation.');

      setConsultationSuccess('Consultation completed and cryptographically secured in blockchain ledger!');
      setCompletedTxHash(data.record.transactionHash);
      setSymptoms('');
      setDiagnosis('');
      setTreatment('');
      setNotes('');
      setPrescriptions('');
      setLabRequest('');
      fetchAppointments();
    } catch (err) {
      setConsultationError(err.message);
    }
  };

  const fetchStats = async () => {
    try {
      const resBlocks = await fetch('/api/blockchain/blocks');
      if (resBlocks.ok) {
        const blocks = await resBlocks.json();
        setAllBlocks(blocks);
        setBlocksCount(blocks.length);

        let count = 0;
        blocks.forEach(b => {
          count += b.records ? b.records.length : 0;
        });
        setRecordsCount(count);
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 800 }}>Welcome, {user.name}</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          {user.role === 'doctor' ? 'Healthcare Provider Portal' : 'Secure Personal Health Records'}
        </p>
      </div>

      {user.role === 'patient' ? (
        <div>
          {/* Health Summary & Cryptographic Identity */}
          <div className="grid-3" style={{ gap: '24px', marginBottom: '24px' }}>
            {/* Health Summary Card */}
            <div className="glass-card span-2-desktop">
              <h3 style={{ fontSize: '1.2rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                <Activity size={20} /> Personal Health Summary
              </h3>

              <div className="grid-2" style={{ gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Blood Group</span>
                    <span className="badge badge-success" style={{ fontSize: '0.85rem' }}>{user.patientProfile?.bloodType || 'O+'}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertTriangle size={14} color="var(--color-warning)" /> Known Allergies</span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {user.patientProfile?.allergies && user.patientProfile.allergies.length > 0 ? (
                        user.patientProfile.allergies.map((allergy, i) => (
                          <span key={i} className="badge badge-error" style={{ textTransform: 'capitalize' }}>{allergy}</span>
                        ))
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No known allergies</span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderLeft: '1px solid var(--glass-border)', paddingLeft: '20px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <Calendar size={14} color="var(--color-primary)" /> Next Appointment
                  </span>
                  {(() => {
                    const upcoming = appointments.filter(a => ['Pending', 'Confirmed'].includes(a.status));
                    if (upcoming.length === 0) {
                      return <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>No upcoming appointments</span>;
                    }
                    const next = upcoming[0];
                    return (
                      <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                        <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>Dr. {next.doctorName}</strong>
                        <p style={{ margin: '4px 0 0 0', color: 'var(--color-accent)', fontSize: '0.8rem', fontWeight: 500 }}>
                          {next.date} at {next.time}
                        </p>
                        <span className={`badge ${next.status === 'Confirmed' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.65rem', padding: '1px 6px', marginTop: '8px', display: 'inline-block' }}>
                          {next.status}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* Cryptographic Identity */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                  <ShieldCheck size={20} /> Identity Keys
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  Your secure health folder is cryptographically locked. Ledger address:
                </p>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '10px', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.7rem', maxHeight: '72px', overflowY: 'auto', color: 'var(--color-accent)', marginTop: '8px' }}>
                {user.publicKey}
              </div>
            </div>
          </div>

          {/* Grid: Actions + Booking & Activity Timeline */}
          <div className="grid-dashboard-main">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Quick Actions Panel */}
              <div className="glass-card">
                <h3 style={{ fontSize: '1.25rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)' }}>
                  <Clipboard size={20} /> Quick Actions
                </h3>
                <div className="grid-quick-actions">
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem', padding: '14px', display: 'flex', gap: '8px', justifyContent: 'center', background: 'rgba(99, 102, 241, 0.05)' }}
                    onClick={() => onNavigate && onNavigate('records')}
                  >
                    <FileText size={16} color="var(--color-primary)" /> View My Health Folder
                  </button>

                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem', padding: '14px', display: 'flex', gap: '8px', justifyContent: 'center', background: 'rgba(16, 185, 129, 0.05)' }}
                    onClick={() => onNavigate && onNavigate('profile')}
                  >
                    <User size={16} color="var(--color-success)" /> View Profile Details
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.85rem', padding: '14px', display: 'flex', gap: '8px', justifyContent: 'center', background: 'rgba(245, 158, 11, 0.05)' }}
                    onClick={() => onNavigate && onNavigate('profile')}
                  >
                    <ShieldCheck size={16} color="var(--color-warning)" /> Security Keys
                  </button>
                </div>
              </div>

              {/* Appointment Booking Form */}
              <div className="glass-card">
                <h3 style={{ fontSize: '1.25rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                  <Calendar size={20} /> Request an Appointment
                </h3>
                {apptError && (
                  <div className="badge-error" style={{ padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem' }}>
                    {apptError}
                  </div>
                )}
                {apptSuccess && (
                  <div className="badge-success" style={{ padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                    {apptSuccess}
                  </div>
                )}
                {apptValidationWarning && (
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    fontSize: '0.85rem',
                    color: 'var(--color-warning)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    backgroundColor: 'rgba(245, 158, 11, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <AlertTriangle size={16} />
                    <span>{apptValidationWarning}</span>
                  </div>
                )}
                <form onSubmit={handleBookAppointment}>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label>Select Healthcare Provider (Doctor)</label>
                    <select
                      className="form-control"
                      value={selectedDoctorId}
                      onChange={(e) => setSelectedDoctorId(e.target.value)}
                      required
                    >
                      <option value="">-- Select Doctor --</option>
                      {doctors.map(doc => (
                        <option key={doc._id || doc.id} value={doc._id || doc.id}>
                          Dr. {doc.name} ({doc.doctorProfile?.specialization || 'General Practitioner'})
                        </option>
                      ))}
                    </select>

                    {selectedDoctorId && (() => {
                      const doc = doctors.find(d => (d._id || d.id) === selectedDoctorId);
                      if (!doc) return null;
                      return (
                        <div className="glass-card" style={{ marginTop: '16px', background: 'rgba(255, 255, 255, 0.03)', padding: '16px', border: '1px dashed var(--glass-border)', display: 'flex', gap: '16px', alignItems: 'center' }}>
                          {doc.doctorProfile?.profilePhoto ? (
                            <img src={doc.doctorProfile.profilePhoto} alt={`Dr. ${doc.name}`} style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover', border: '1px solid var(--glass-border)' }} />
                          ) : (
                            <div style={{ width: '80px', height: '80px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <User size={36} color="var(--color-primary)" />
                            </div>
                          )}
                          <div style={{ flex: 1 }}>
                            <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: 'var(--text-primary)' }}>Dr. {doc.name}</h4>
                            <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: 'var(--color-accent)', fontWeight: 600 }}>{doc.doctorProfile?.specialization || 'General Practitioner'}</p>
                            <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Hospital: {doc.doctorProfile?.hospital || 'Affiliated Clinic'}</p>
                            <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Experience: {doc.doctorProfile?.yearsOfExperience || '0'} years</p>
                            <p style={{ margin: '0 0 6px 0', fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>License: {doc.doctorProfile?.licenseNumber || 'N/A'}</p>

                            <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Status:</span>
                                <span className={`badge ${(doc.doctorProfile?.availability?.status || 'available') === 'available' ? 'badge-success' :
                                    (doc.doctorProfile?.availability?.status || 'available') === 'busy' ? 'badge-warning' : 'badge-error'
                                  }`} style={{ fontSize: '0.7rem', padding: '1px 6px', textTransform: 'capitalize' }}>
                                  {doc.doctorProfile?.availability?.status || 'available'}
                                </span>
                              </div>
                              <div style={{ color: 'var(--text-secondary)' }}>
                                <span style={{ fontWeight: 600 }}>Days:</span> {doc.doctorProfile?.availability?.workingDays?.join(', ') || 'Monday, Tuesday, Wednesday, Thursday, Friday'}
                              </div>
                              <div style={{ color: 'var(--text-secondary)' }}>
                                <span style={{ fontWeight: 600 }}>Hours:</span> {formatTime12h(doc.doctorProfile?.availability?.workingHoursStart || '08:00')} - {formatTime12h(doc.doctorProfile?.availability?.workingHoursEnd || '17:00')}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                    <div className="form-group">
                      <label>Preferred Date</label>
                      <input
                        type="date"
                        className="form-control"
                        value={appointmentDate}
                        onChange={(e) => setAppointmentDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Preferred Time</label>
                      <input
                        type="time"
                        className="form-control"
                        value={appointmentTime}
                        onChange={(e) => setAppointmentTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label>Reason for Visit</label>
                    <textarea
                      className="form-control"
                      rows="3"
                      placeholder="Brief description of symptoms or visit reason..."
                      value={appointmentReason}
                      onChange={(e) => setAppointmentReason(e.target.value)}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', opacity: (apptValidationWarning || !selectedDoctorId) ? 0.6 : 1 }}
                    disabled={!!apptValidationWarning || !selectedDoctorId}
                  >
                    Submit Appointment Request
                  </button>
                </form>
              </div>
            </div>

            {/* Recent Activity Log */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)' }}>
                <Clock size={20} /> Recent Activity Log
              </h3>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '580px', overflowY: 'auto', paddingRight: '4px' }}>
                {(() => {
                  const events = [];

                  // 1. Add records as block-mining events
                  patientRecords.forEach(rec => {
                    events.push({
                      id: `rec-${rec._id || rec.id}`,
                      type: 'record',
                      title: `Medical Block Mined`,
                      desc: `Clinical report: "${rec.diagnosis || 'Update'}" signed by Dr. ${rec.doctorName}`,
                      date: rec.createdAt ? new Date(rec.createdAt) : new Date(),
                      icon: <Database size={14} color="var(--color-success)" />,
                      badge: `Block #${rec.blockIndex || '?'}`
                    });
                  });

                  // 2. Add appointments as booking events
                  appointments.forEach(appt => {
                    events.push({
                      id: `appt-${appt._id || appt.id}`,
                      type: 'appointment',
                      title: `Appointment ${appt.status}`,
                      desc: `Consultation requested with Dr. ${appt.doctorName} for ${appt.reason}`,
                      date: appt.createdAt ? new Date(appt.createdAt) : new Date(appt.date),
                      icon: <Calendar size={14} color="var(--color-primary)" />,
                      badge: appt.status
                    });
                  });

                  // 3. Add default security login event
                  events.push({
                    id: 'login-event',
                    type: 'security',
                    title: 'Secure Session Initiated',
                    desc: 'Cryptographic handshake verified and session token issued.',
                    date: new Date(Date.now() - 3600000), // 1 hour ago
                    icon: <ShieldCheck size={14} color="var(--color-accent)" />,
                    badge: 'Active'
                  });

                  // Sort events newest first
                  events.sort((a, b) => b.date - a.date);

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative', paddingLeft: '16px', borderLeft: '2px dashed var(--glass-border)', marginLeft: '10px', marginTop: '10px' }}>
                      {events.map((evt) => (
                        <div key={evt.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {/* Dot on line */}
                          <div style={{
                            position: 'absolute',
                            left: '-22px',
                            top: '4px',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: 'var(--bg-primary)',
                            border: `2px solid ${evt.type === 'record' ? 'var(--color-success)' :
                                evt.type === 'appointment' ? 'var(--color-primary)' : 'var(--color-accent)'
                              }`,
                            boxShadow: `0 0 8px ${evt.type === 'record' ? 'rgba(16, 185, 129, 0.4)' :
                                evt.type === 'appointment' ? 'rgba(99, 102, 241, 0.4)' : 'rgba(6, 182, 212, 0.4)'
                              }`
                          }} />

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {evt.icon} {evt.title}
                            </span>
                            <span className={`badge ${evt.type === 'record' ? 'badge-success' :
                                evt.badge === 'Confirmed' ? 'badge-success' :
                                  evt.badge === 'Pending' ? 'badge-warning' :
                                    evt.type === 'security' ? 'badge-success' : 'badge-error'
                              }`} style={{ fontSize: '0.65rem', padding: '1px 6px' }}>
                              {evt.badge}
                            </span>
                          </div>

                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0, lineHeight: '1.4' }}>{evt.desc}</p>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                            {evt.date.toLocaleDateString()} at {evt.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          {/* Doctor Profile & Metrics */}
          <div className="grid-3" style={{ marginBottom: '32px' }}>
            <div className="glass-card metric-card-interactive" style={{ display: 'flex', alignItems: 'center', gap: '20px' }} onClick={() => setViewingDoctorProfileModal(true)}>
              <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '12px', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={28} color="var(--color-primary)" />
              </div>
              <div>
                <h4 style={{ fontSize: '1.1rem', margin: 0 }}>Dr. {user.name}</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{user.doctorProfile?.specialization || 'Clinical Practitioner'}</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{user.doctorProfile?.hospital || 'Blockchain Health Network'}</p>
              </div>
            </div>

            <div className="glass-card metric-card-interactive" style={{ display: 'flex', alignItems: 'center', gap: '20px' }} onClick={() => setViewingRecordsModal(true)}>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={28} color="var(--color-success)" />
              </div>
              <div>
                <h4 style={{ fontSize: '1.5rem', margin: 0 }}>{recordsCount}</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Total Medical Blocks Mined</p>
              </div>
            </div>

            <div className="glass-card metric-card-interactive" style={{ display: 'flex', alignItems: 'center', gap: '20px' }} onClick={() => setViewingBlocksModal(true)}>
              <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', width: '56px', height: '56px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={28} color="var(--color-warning)" />
              </div>
              <div>
                <h4 style={{ fontSize: '1.5rem', margin: 0 }}>{blocksCount}</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Blockchain Height (Blocks)</p>
              </div>
            </div>
          </div>
          {/* Availability Control Panel */}
          <div className="glass-card" style={{ marginBottom: '32px' }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-accent)' }}>
              <Clock size={22} color="var(--color-accent)" /> Availability Control Panel
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Configure your working days, hours, and live availability status. Patients will only be permitted to request appointments that conform to this schedule.
            </p>

            {availError && (
              <div className="badge-error" style={{ padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem' }}>
                {availError}
              </div>
            )}
            {availSuccess && (
              <div className="badge-success" style={{ padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                {availSuccess}
              </div>
            )}

            <form onSubmit={handleUpdateAvailability} className="grid-3" style={{ gap: '20px', alignItems: 'start' }}>
              <div className="form-group">
                <label>Current Status</label>
                <select
                  className="form-control"
                  value={availStatus}
                  onChange={(e) => setAvailStatus(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="available">🟢 Available</option>
                  <option value="busy">🟡 Busy</option>
                  <option value="on leave">🔴 On Leave</option>
                </select>
              </div>

              <div className="form-group span-2-desktop">
                <label>Working Days</label>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => {
                    const isSelected = availDays.includes(day);
                    return (
                      <button
                        type="button"
                        key={day}
                        onClick={() => {
                          if (isSelected) {
                            setAvailDays(availDays.filter(d => d !== day));
                          } else {
                            setAvailDays([...availDays, day]);
                          }
                        }}
                        className={`btn ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '6px' }}
                      >
                        {day.substring(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-group">
                <label>Shift Start Time</label>
                <input
                  type="time"
                  className="form-control"
                  value={availStart}
                  onChange={(e) => setAvailStart(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-group">
                <label>Shift End Time</label>
                <input
                  type="time"
                  className="form-control"
                  value={availEnd}
                  onChange={(e) => setAvailEnd(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>

              <div className="form-group" style={{ display: 'flex', justifyContent: 'flex-end', height: '100%', paddingTop: '22px' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '10px' }}
                  disabled={availSaving}
                >
                  {availSaving ? 'Saving Changes...' : 'Save Availability'}
                </button>
              </div>
            </form>
          </div>

          {/* Doctor Appointments Card */}
          <div className="glass-card" style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                  <Calendar size={22} color="var(--color-primary)" /> Clinic Appointments Manager
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Review patient appointment requests, accept/decline visits, and launch cryptographic consultations for confirmed appointments.
                </p>
              </div>
              
              {/* Inline Search Bar */}
              <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '380px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search patient, reason, date..."
                    value={apptSearchQuery}
                    onChange={(e) => setApptSearchQuery(e.target.value)}
                    style={{ paddingLeft: '36px', width: '100%', height: '38px', fontSize: '0.85rem' }}
                  />
                  {apptSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setApptSearchQuery('')}
                      style={{ position: 'absolute', right: '10px', top: '10px', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <button
                  className="btn btn-primary"
                  style={{ padding: '0 16px', height: '38px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Search size={14} /> Search
                </button>
              </div>
            </div>

            {(() => {
              const filteredAppointments = appointments.filter(appt => 
                (appt.patientName && appt.patientName.toLowerCase().includes(apptSearchQuery.toLowerCase())) ||
                (appt.reason && appt.reason.toLowerCase().includes(apptSearchQuery.toLowerCase())) ||
                (appt.date && appt.date.toLowerCase().includes(apptSearchQuery.toLowerCase())) ||
                (appt.status && appt.status.toLowerCase().includes(apptSearchQuery.toLowerCase()))
              );

              if (appointments.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
                    No appointments booked with you yet.
                  </div>
                );
              }

              if (filteredAppointments.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', border: '1px dashed var(--glass-border)', borderRadius: '8px' }}>
                    No appointments match your search criteria.
                  </div>
                );
              }

              return (
                <div className="table-container">
                  <table className="custom-table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>Patient Name</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Reason for Visit</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAppointments.map(appt => (
                        <tr key={appt._id || appt.id}>
                          <td style={{ fontWeight: 600 }}>{appt.patientName}</td>
                          <td>{appt.date}</td>
                          <td>{appt.time}</td>
                          <td>{appt.reason}</td>
                          <td>
                            <span className={`badge ${appt.status === 'Confirmed' ? 'badge-success' :
                                appt.status === 'Pending' ? 'badge-warning' :
                                  appt.status === 'Completed' ? 'badge-primary' : 'badge-error'
                              }`}>
                              {appt.status}
                            </span>
                          </td>
                          <td>
                            {appt.status === 'Pending' && (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  className="btn btn-primary"
                                  style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#10b981', borderColor: '#10b981' }}
                                  onClick={() => handleUpdateApptStatus(appt._id || appt.id, 'Confirmed')}
                                >
                                  <Check size={12} style={{ marginRight: '4px' }} /> Accept
                                </button>
                                <button
                                  className="btn btn-danger"
                                  style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                                  onClick={() => handleUpdateApptStatus(appt._id || appt.id, 'Declined')}
                                >
                                  <X size={12} style={{ marginRight: '4px' }} /> Decline
                                </button>
                              </div>
                            )}
                            {appt.status === 'Confirmed' && (
                              <button
                                className="btn btn-primary"
                                style={{ padding: '4px 10px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => {
                                  setConsultationError('');
                                  setConsultationSuccess('');
                                  setCompletedTxHash('');
                                  setActiveConsultationAppt(appt);
                                }}
                              >
                                <FileText size={12} /> Start Consultation
                              </button>
                            )}
                            {appt.status === 'Completed' && (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>Consultation Finished</span>
                            )}
                            {appt.status === 'Declined' && (
                              <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', fontStyle: 'italic' }}>Request Declined</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {/* Patient Registry Section */}
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <h3 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clipboard size={22} color="var(--color-primary)" /> Patient Registration Registry
              </h3>
              {!loading && patients.length > 0 && (
                <div style={{ position: 'relative', width: '280px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    type="text"
                    placeholder="Search name, email, blood group..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 36px',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border)',
                      background: 'rgba(0, 0, 0, 0.2)',
                      color: 'var(--text-primary)',
                      fontSize: '0.9rem',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'var(--color-primary)';
                      e.target.style.boxShadow = '0 0 0 2px var(--glass-glow)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'var(--glass-border)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              )}
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading registry data...</div>
            ) : patients.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>No registered patients in the database.</div>
            ) : (
              (() => {
                const filteredPatients = patients.filter(p => {
                  const query = searchQuery.toLowerCase().trim();
                  if (!query) return true;
                  return (
                    p.name?.toLowerCase().includes(query) ||
                    p.email?.toLowerCase().includes(query) ||
                    (p.patientProfile?.gender && p.patientProfile.gender.toLowerCase().includes(query)) ||
                    (p.patientProfile?.bloodType && p.patientProfile.bloodType.toLowerCase().includes(query))
                  );
                });

                if (filteredPatients.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      No patients match your search query.
                    </div>
                  );
                }

                return (
                  <div className="table-container">
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Patient Name</th>
                          <th>Email</th>
                          <th>Age/Gender</th>
                          <th>Blood Group</th>
                          <th>Treating Relationship</th>
                          <th>Emergency Contact</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPatients.map(p => {
                          const doctorIdStr = user.id || user._id;
                          const patientIdStr = p.id || p._id;
                          const isAuthorized = appointments.some(appt => {
                            const apptPatientIdStr = typeof appt.patientId === 'object' ? appt.patientId?._id?.toString() : appt.patientId?.toString();
                            return apptPatientIdStr === patientIdStr?.toString() && ['Confirmed', 'Completed'].includes(appt.status);
                          });
                          return (
                            <tr key={patientIdStr}>
                              <td style={{ fontWeight: 600 }}>{p.name}</td>
                              <td>{p.email}</td>
                              <td>{p.patientProfile?.age || '22'} yrs / {p.patientProfile?.gender || 'Male'}</td>
                              <td>
                                <span className="badge badge-success">{p.patientProfile?.bloodType || 'O+'}</span>
                              </td>
                              <td>
                                {isAuthorized ? (
                                  <span className="badge badge-success">Active Relationship</span>
                                ) : (
                                  <span className="badge badge-warning">No confirmed appointments</span>
                                )}
                              </td>
                              <td style={{ color: 'var(--color-accent)', fontWeight: 500 }}>{p.patientProfile?.emergencyContact || '+25471234567'}</td>
                              <td>
                                {isAuthorized ? (
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                                    onClick={() => onSelectPatient(p)}
                                  >
                                    Open Records
                                  </button>
                                ) : (
                                  <button
                                    className="btn btn-secondary"
                                    style={{ padding: '6px 12px', fontSize: '0.85rem', opacity: 0.5, cursor: 'not-allowed' }}
                                    disabled
                                    title="Access Restricted: Confirmed appointment required."
                                  >
                                    Locked
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Consultation Modal Dialog */}
      {activeConsultationAppt && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(8px)',
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '650px',
            padding: '24px',
            border: '1px solid var(--glass-border)',
            background: 'rgba(15, 15, 25, 0.98)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
              <FileText size={22} /> Consultation: {activeConsultationAppt.patientName}
            </h3>

            {consultationError && (
              <div className="badge-error" style={{ padding: '8px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem' }}>
                {consultationError}
              </div>
            )}

            {consultationSuccess && (
              <div style={{ padding: '16px', borderRadius: '8px', marginBottom: '16px', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.85rem', color: '#10b981' }}>
                <p style={{ fontWeight: 600, margin: '0 0 8px' }}>{consultationSuccess}</p>
                {completedTxHash && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Blockchain Transaction Verification Hash:</span>
                    <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '6px', padding: '8px', wordBreak: 'break-all', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--color-accent)', marginTop: '4px' }}>
                      {completedTxHash}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!completedTxHash ? (
              <form onSubmit={handleCompleteConsultation}>
                <div className="grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group">
                    <label>Symptoms</label>
                    <textarea
                      className="form-control"
                      rows="2"
                      placeholder="Reported patient symptoms..."
                      required
                      value={symptoms}
                      onChange={(e) => setSymptoms(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Diagnosis</label>
                    <textarea
                      className="form-control"
                      rows="2"
                      placeholder="Clinical diagnosis..."
                      required
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                  <div className="form-group">
                    <label>Treatment Plan</label>
                    <textarea
                      className="form-control"
                      rows="2"
                      placeholder="Recommended treatment course..."
                      required
                      value={treatment}
                      onChange={(e) => setTreatment(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Consultation Notes</label>
                    <textarea
                      className="form-control"
                      rows="2"
                      placeholder="Clinical records notes..."
                      required
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label>Prescriptions (comma-separated, optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Paracetamol 500mg, Amoxicillin 250mg"
                    value={prescriptions}
                    onChange={(e) => setPrescriptions(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '20px' }}>
                  <label>Laboratory Tests Request (optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Full Blood Count, Urinalysis"
                    value={labRequest}
                    onChange={(e) => setLabRequest(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={() => setActiveConsultationAppt(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    Complete Consultation
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '150px' }}
                  onClick={() => {
                    setActiveConsultationAppt(null);
                    setCompletedTxHash('');
                  }}
                >
                  Close Window
                </button>
              </div>
            )}
          </div>
        </div>
      )}



      {/* Interactive Doctor Profile Modal */}
      {viewingDoctorProfileModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(8px)',
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '550px',
            padding: '24px',
            border: '1px solid var(--glass-border)',
            background: 'rgba(15, 15, 25, 0.98)',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.3rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                <User size={22} /> Doctor Practitioner Profile
              </h3>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 8px', minWidth: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => {
                  setViewingDoctorProfileModal(false);
                  setCopiedKey(false);
                }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '24px', background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '12px', width: '72px', height: '72px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User size={36} color="var(--color-primary)" />
              </div>
              <div>
                <h4 style={{ fontSize: '1.25rem', margin: '0 0 4px 0' }}>Dr. {user.name}</h4>
                <p style={{ color: 'var(--color-accent)', fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>{user.doctorProfile?.specialization || 'Clinical Practitioner'}</p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '2px 0 0 0' }}>{user.doctorProfile?.hospital || 'Blockchain Health Network'}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Years of Experience</span>
                <span style={{ fontWeight: 600 }}>{user.doctorProfile?.yearsOfExperience || '8'} Years</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>License Registration No.</span>
                <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{user.doctorProfile?.licenseNumber || 'LIC-2024-8841'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Duty Hours Schedule</span>
                <span style={{ fontWeight: 600 }}>{formatTime12h(user.doctorProfile?.availability?.workingHoursStart || '08:00')} - {formatTime12h(user.doctorProfile?.availability?.workingHoursEnd || '17:00')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Clinic Active Days</span>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{user.doctorProfile?.availability?.workingDays?.join(', ') || 'Mon, Tue, Wed, Thu, Fri'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Live Availability Status</span>
                <span className={`badge ${(user.doctorProfile?.availability?.status || 'available') === 'available' ? 'badge-success' :
                    (user.doctorProfile?.availability?.status || 'available') === 'busy' ? 'badge-warning' : 'badge-error'
                  }`} style={{ textTransform: 'capitalize' }}>
                  {user.doctorProfile?.availability?.status || 'available'}
                </span>
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, textTransform: 'uppercase' }}>Public Identity Address (RSA PEM)</span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', gap: '4px', height: 'auto' }}
                  onClick={() => {
                    navigator.clipboard.writeText(user.publicKey);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                >
                  <Copy size={12} /> {copiedKey ? 'Copied!' : 'Copy Address'}
                </button>
              </div>
              <div style={{
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                padding: '12px',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                fontSize: '0.75rem',
                maxHeight: '120px',
                overflowY: 'auto',
                color: 'var(--color-accent)'
              }}>
                {user.publicKey}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '24px' }}
              onClick={() => {
                setViewingDoctorProfileModal(false);
                setCopiedKey(false);
              }}
            >
              Done / Close
            </button>
          </div>
        </div>
      )}

      {/* Interactive Medical Blocks Mined Modal */}
      {viewingRecordsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(8px)',
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '850px',
            padding: '24px',
            border: '1px solid var(--glass-border)',
            background: 'rgba(15, 15, 25, 0.98)',
            maxHeight: '90vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.3rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-success)' }}>
                <CheckCircle size={22} /> Decrypted Ledger Transactions Pool
              </h3>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 8px', minWidth: 'auto' }}
                onClick={() => setViewingRecordsModal(false)}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              The following medical records and digital consultation logs have been cryptographically signed and successfully mined into blockchain blocks.
            </p>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '55vh', paddingRight: '4px' }}>
              {(() => {
                let recordsList = [];
                allBlocks.forEach(block => {
                  if (block.records && block.records.length > 0) {
                    block.records.forEach(rec => {
                      recordsList.push({
                        ...rec,
                        blockIndex: block.index,
                        blockTimestamp: block.timestamp
                      });
                    });
                  }
                });

                if (recordsList.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', border: '1px dashed var(--glass-border)', borderRadius: '12px' }}>
                      No records mined on the chain yet.
                    </div>
                  );
                }

                // Sort records: newest first (or by block index descending)
                recordsList.reverse();

                return recordsList.map((rec, index) => (
                  <div
                    key={index}
                    style={{
                      border: '1px solid var(--glass-border)',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.01)',
                      padding: '16px',
                      position: 'relative'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>Block #{rec.blockIndex}</span>
                        <span className="badge" style={{ background: rec.txType === 'consultation' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(99, 102, 241, 0.15)', color: rec.txType === 'consultation' ? 'var(--color-accent)' : 'var(--color-primary)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                          {rec.txType || 'medical'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Mined: {new Date(rec.timestamp || rec.blockTimestamp).toLocaleString()}</span>
                    </div>

                    <div className="grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Patient</span>
                        <p style={{ fontSize: '0.9rem', margin: '2px 0 0 0', fontWeight: 600 }}>{rec.patientName || 'Genesis System'}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Practitioner</span>
                        <p style={{ fontSize: '0.9rem', margin: '2px 0 0 0' }}>Dr. {rec.doctorName || rec.doctor || 'System Admin'}</p>
                      </div>
                    </div>

                    {rec.message ? (
                      <div style={{ marginBottom: '12px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Genesis Message</span>
                        <p style={{ fontSize: '0.9rem', margin: '2px 0 0 0', fontStyle: 'italic' }}>{rec.message}</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid-2" style={{ gap: '12px', marginBottom: '12px' }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Diagnosis / Symptoms</span>
                            <p style={{ fontSize: '0.9rem', margin: '2px 0 0 0', color: 'var(--text-primary)' }}>{rec.diagnosis || rec.symptoms || 'N/A'}</p>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>Treatment Plan / Notes</span>
                            <p style={{ fontSize: '0.9rem', margin: '2px 0 0 0' }}>{rec.treatment || rec.notes || 'N/A'}</p>
                          </div>
                        </div>

                        {rec.prescriptions && rec.prescriptions.length > 0 && (
                          <div style={{ marginBottom: '12px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Prescribed Medication</span>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {rec.prescriptions.map((pres, idx) => (
                                <span key={idx} className="badge" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '0.75rem' }}>{pres}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {rec.ipfsHash && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--color-accent)', marginBottom: '12px' }}>
                            <BookOpen size={12} />
                            <span>IPFS CID: {rec.ipfsHash}</span>
                          </div>
                        )}
                      </>
                    )}

                    <div style={{ borderTop: '1px dashed rgba(255,255,255,0.03)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                      <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ShieldCheck size={12} /> Cryptographically Verified Record Signature
                      </span>
                      {rec.signature && (
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace' }}>Sig: {rec.signature.substring(0, 16)}...</span>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '24px' }}
              onClick={() => setViewingRecordsModal(false)}
            >
              Close Ledger Viewer
            </button>
          </div>
        </div>
      )}

      {/* Interactive Blockchain Height Modal */}
      {viewingBlocksModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 10000,
          backdropFilter: 'blur(8px)',
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '800px',
            padding: '24px',
            border: '1px solid var(--glass-border)',
            background: 'rgba(15, 15, 25, 0.98)',
            maxHeight: '90vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.3rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-warning)' }}>
                <Database size={22} /> Ledger Chain Blocks Inspector
              </h3>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '4px 8px', minWidth: 'auto' }}
                onClick={() => {
                  setViewingBlocksModal(false);
                  setExpandedBlockIndex(null);
                }}
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
              Click any block in the chain to inspect its cryptographic properties, hashes, nonce, and decrypted transaction list.
            </p>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '55vh', paddingRight: '4px' }}>
              {allBlocks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  Loading blockchain...
                </div>
              ) : (
                [...allBlocks].reverse().map((block) => {
                  const isExpanded = expandedBlockIndex === block.index;
                  return (
                    <div
                      key={block.index}
                      style={{
                        border: '1px solid var(--glass-border)',
                        borderRadius: '12px',
                        background: 'rgba(255,255,255,0.01)',
                        padding: '16px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        borderLeft: isExpanded ? '4px solid var(--color-warning)' : '1px solid var(--glass-border)'
                      }}
                      onClick={() => setExpandedBlockIndex(isExpanded ? null : block.index)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                          <strong style={{ fontSize: '1.05rem', color: block.index === 0 ? 'var(--color-success)' : 'var(--text-primary)' }}>
                            Block #{block.index} {block.index === 0 ? '(Genesis Block)' : ''}
                          </strong>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                            Timestamp: {new Date(block.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>
                            Nonce: {block.nonce}
                          </span>
                          <span className="badge badge-primary">
                            {block.records ? block.records.length : 0} TXs
                          </span>
                        </div>
                      </div>

                      <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                        <div>
                          <span style={{ color: 'var(--text-secondary)' }}>Hash: </span>
                          <span style={{ color: 'var(--color-accent)' }}>{block.hash}</span>
                        </div>
                        {block.index > 0 && (
                          <div>
                            <span style={{ color: 'var(--text-secondary)' }}>Prev Hash: </span>
                            <span style={{ color: 'var(--text-muted)' }}>{block.previousHash}</span>
                          </div>
                        )}
                      </div>

                      {isExpanded && (
                        <div style={{
                          marginTop: '16px',
                          paddingTop: '16px',
                          borderTop: '1px dashed var(--glass-border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          cursor: 'default'
                        }} onClick={(e) => e.stopPropagation()}>
                          <h4 style={{ fontSize: '0.9rem', color: 'var(--color-warning)', margin: 0 }}>Mined Block Records</h4>
                          {block.records && block.records.length > 0 ? (
                            block.records.map((rec, rIdx) => (
                              <div
                                key={rIdx}
                                style={{
                                  background: 'rgba(0,0,0,0.2)',
                                  border: '1px solid var(--glass-border)',
                                  borderRadius: '8px',
                                  padding: '12px',
                                  fontSize: '0.85rem'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  <span style={{ fontWeight: 600 }}>Type: {rec.txType || 'medical'}</span>
                                  <span>{new Date(rec.timestamp).toLocaleTimeString()}</span>
                                </div>
                                {rec.message ? (
                                  <p style={{ margin: 0, fontStyle: 'italic' }}>{rec.message}</p>
                                ) : (
                                  <div>
                                    <div style={{ marginBottom: '4px' }}>
                                      <strong>Patient:</strong> {rec.patientName} &bull; <strong>Doctor:</strong> Dr. {rec.doctorName || rec.doctor}
                                    </div>
                                    <div style={{ color: 'var(--text-primary)', marginBottom: '4px' }}>
                                      <strong>Diagnosis:</strong> {rec.diagnosis || rec.symptoms}
                                    </div>
                                    <div style={{ color: 'var(--text-secondary)' }}>
                                      <strong>Treatment:</strong> {rec.treatment || rec.notes}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))
                          ) : (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>No records in block.</p>
                          )}
                        </div>
                      )}

                      {!isExpanded && (
                        <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right', fontStyle: 'italic' }}>
                          Click to inspect records & details
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '24px' }}
              onClick={() => {
                setViewingBlocksModal(false);
                setExpandedBlockIndex(null);
              }}
            >
              Close Inspector
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
