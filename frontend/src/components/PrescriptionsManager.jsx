import React, { useState, useEffect, useRef } from 'react';
import { 
  Pill, Plus, Search, CheckCircle2, Clock, AlertCircle, 
  Printer, QrCode, ArrowRight, ExternalLink, X, Trash2, 
  AlertTriangle, ShieldCheck, User, Building2, Calendar, Loader2 
} from 'lucide-react';
import QRCode from 'qrcode';
import { safeFetch } from '../utils/api';
import SearchableSelect from './SearchableSelect';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';

export default function PrescriptionsManager({ user, onSelectPrescriptionForVerification }) {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Creation Modal States
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedPatientProfile, setSelectedPatientProfile] = useState(null);
  const [instructions, setInstructions] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [items, setItems] = useState([
    { medicationName: '', rxnormCode: '', dosage: '', frequency: 'Twice daily', duration: '7 days', quantityPrescribed: 14 }
  ]);
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueError, setIssueError] = useState('');
  const [allergyWarnings, setAllergyWarnings] = useState([]);
  const [overrideJustification, setOverrideJustification] = useState('');

  // Drug Autocomplete States
  const [drugSearchResults, setDrugSearchResults] = useState({});
  const [drugSearchLoading, setDrugSearchLoading] = useState({});
  const searchTimers = useRef({});

  // Dispensing Modal States
  const [dispenseRx, setDispenseRx] = useState(null);
  const [dispenseInputs, setDispenseInputs] = useState({});
  const [dispenseNotes, setDispenseNotes] = useState('');
  const [dispenseLoading, setDispenseLoading] = useState(false);
  const [dispenseError, setDispenseError] = useState('');

  // QR Modal States
  const [qrModalRx, setQrModalRx] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Fetch prescriptions list
  const loadPrescriptions = async () => {
    try {
      setLoading(true);
      const data = await safeFetch('/api/prescriptions');
      setPrescriptions(data.prescriptions || []);
    } catch (err) {
      console.error('Failed to load prescriptions:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch patients list for doctors/clinics
  const loadPatients = async () => {
    if (user.role === 'patient') return;
    try {
      const data = await safeFetch('/api/users/patients');
      setPatients(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load patients for prescriptions:', err);
    }
  };

  useEffect(() => {
    loadPrescriptions();
    loadPatients();
  }, [user]);

  // Update selected patient profile & check allergies
  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedPatientProfile(null);
      return;
    }
    const found = patients.find(p => (p.id || p._id) === selectedPatientId);
    setSelectedPatientProfile(found || null);
  }, [selectedPatientId, patients]);

  // Dynamic Drug Autocomplete Search
  const handleDrugSearch = (index, text) => {
    const newItems = [...items];
    newItems[index].medicationName = text;
    setItems(newItems);

    if (searchTimers.current[index]) {
      clearTimeout(searchTimers.current[index]);
    }

    if (!text || text.trim().length < 2) {
      setDrugSearchResults(prev => ({ ...prev, [index]: [] }));
      return;
    }

    setDrugSearchLoading(prev => ({ ...prev, [index]: true }));

    searchTimers.current[index] = setTimeout(async () => {
      try {
        const data = await safeFetch(`/api/prescriptions/drugs/search?q=${encodeURIComponent(text.trim())}`);
        setDrugSearchResults(prev => ({ ...prev, [index]: data.results || [] }));
      } catch (err) {
        console.error('Drug search error:', err);
      } finally {
        setDrugSearchLoading(prev => ({ ...prev, [index]: false }));
      }
    }, 300);
  };

  const handleSelectDrug = (index, drug) => {
    const newItems = [...items];
    newItems[index].medicationName = drug.name;
    newItems[index].rxnormCode = drug.rxnormCode || '';
    if (drug.commonDosages && drug.commonDosages.length > 0) {
      newItems[index].dosage = drug.commonDosages[0];
    }
    if (drug.standardFrequency) {
      newItems[index].frequency = drug.standardFrequency;
    }
    setItems(newItems);
    setDrugSearchResults(prev => ({ ...prev, [index]: [] }));

    // Check allergy contraindications
    if (selectedPatientProfile && selectedPatientProfile.patient_profile?.allergies) {
      const allergies = selectedPatientProfile.patient_profile.allergies;
      const allergyArr = Array.isArray(allergies) ? allergies : String(allergies).split(',');
      const drugLower = drug.name.toLowerCase();
      
      const foundWarnings = [];
      for (const a of allergyArr) {
        const aClean = String(a).toLowerCase().trim();
        if (aClean && (drugLower.includes(aClean) || (aClean.includes('penicillin') && (drugLower.includes('amox') || drugLower.includes('augmentin'))))) {
          foundWarnings.push(`Caution: Patient has documented allergy to "${a}". Confirm safety before prescribing.`);
        }
      }
      setAllergyWarnings(foundWarnings);
    }
  };

  const handleAddItem = () => {
    setItems([
      ...items,
      { medicationName: '', rxnormCode: '', dosage: '', frequency: 'Twice daily', duration: '7 days', quantityPrescribed: 14 }
    ]);
  };

  const handleRemoveItem = (index) => {
    if (items.length <= 1) return;
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const handleIssueSubmit = async (e) => {
    e.preventDefault();
    if (!selectedPatientId) {
      setIssueError('Please select a patient.');
      return;
    }

    for (const item of items) {
      if (!item.medicationName || !item.dosage || !item.quantityPrescribed) {
        setIssueError('Each medication must have a name, dosage, and prescribed quantity.');
        return;
      }
    }

    if (allergyWarnings.length > 0 && (!overrideJustification || overrideJustification.trim().length < 10)) {
      setIssueError('Clinical Safety Block: Documented allergy contraindication detected. You must provide a clinical override justification (min. 10 characters) to proceed.');
      return;
    }

    setIssueLoading(true);
    setIssueError('');

    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiresInDays || 30, 10));

      const res = await safeFetch('/api/prescriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: selectedPatientId,
          instructions,
          expiresAt: expiresAt.toISOString(),
          overrideJustification: overrideJustification.trim(),
          items: items.map(i => ({
            ...i,
            quantityPrescribed: parseInt(i.quantityPrescribed, 10)
          }))
        })
      });

      setShowIssueModal(false);
      // Reset form
      setSelectedPatientId('');
      setInstructions('');
      setItems([{ medicationName: '', rxnormCode: '', dosage: '', frequency: 'Twice daily', duration: '7 days', quantityPrescribed: 14 }]);
      setAllergyWarnings([]);
      setOverrideJustification('');
      loadPrescriptions();

      // Show QR modal for the newly issued prescription
      if (res.prescription) {
        handleOpenQr(res.prescription);
      }
    } catch (err) {
      setIssueError(err.message || 'Failed to issue prescription.');
    } finally {
      setIssueLoading(false);
    }
  };

  // Open QR modal
  const handleOpenQr = (rx) => {
    setQrModalRx(rx);
    const verifyUrl = `${window.location.origin}/?verifyPrescription=${encodeURIComponent(rx.qr_token)}`;
    QRCode.toDataURL(verifyUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#0b2545', light: '#ffffff' }
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error(err));
  };

  // Open Dispense Modal
  const handleOpenDispense = (rx) => {
    setDispenseRx(rx);
    const initialInputs = {};
    (rx.items || []).forEach(item => {
      const remaining = item.quantity_prescribed - item.quantity_dispensed;
      initialInputs[item.id] = remaining > 0 ? remaining : 0;
    });
    setDispenseInputs(initialInputs);
    setDispenseNotes('');
    setDispenseError('');
  };

  const handleDispenseSubmit = async (e) => {
    e.preventDefault();
    if (!dispenseRx) return;

    const itemDispenses = Object.entries(dispenseInputs)
      .map(([itemId, qty]) => ({
        itemId,
        quantityDispensed: parseInt(qty, 10) || 0
      }))
      .filter(i => i.quantityDispensed > 0);

    if (itemDispenses.length === 0) {
      setDispenseError('Enter at least 1 quantity to dispense.');
      return;
    }

    setDispenseLoading(true);
    setDispenseError('');

    try {
      await safeFetch(`/api/prescriptions/${dispenseRx.id}/dispense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemDispenses,
          notes: dispenseNotes
        })
      });

      setDispenseRx(null);
      loadPrescriptions();
    } catch (err) {
      setDispenseError(err.message || 'Failed to dispense medication.');
    } finally {
      setDispenseLoading(false);
    }
  };

  // Filtered prescriptions list
  const filteredPrescriptions = prescriptions.filter(p => {
    if (filterStatus !== 'ALL' && p.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchPatient = (p.patient_name || '').toLowerCase().includes(q);
      const matchToken = (p.qr_token || '').toLowerCase().includes(q);
      const matchDrug = (p.items || []).some(i => i.medication_name.toLowerCase().includes(q));
      return matchPatient || matchToken || matchDrug;
    }
    return true;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ISSUED':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800">Active / Issued</Badge>;
      case 'PARTIALLY_FILLED':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-800">Partially Filled</Badge>;
      case 'FILLED':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-300 dark:border-blue-800">Fully Filled</Badge>;
      case 'EXPIRED':
        return <Badge variant="outline" className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400 border-slate-300">Expired</Badge>;
      case 'CANCELLED':
        return <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-300">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Header & Quick Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl p-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-[#0B2545] border border-teal-200 dark:border-teal-900/60 flex items-center justify-center text-[#0F766E] dark:text-[#14B8A6]">
              <Pill className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0B2545] dark:text-white">Clinical Prescriptions & Dispensing</h1>
              <p className="text-xs text-[#475569] dark:text-slate-300">
                Multi-tenant cryptographic prescription issuance, real-time RxNorm lookup, and dispensary audit tracking.
              </p>
            </div>
          </div>
        </div>

        {user.role === 'doctor' && (
          <Button
            onClick={() => setShowIssueModal(true)}
            className="flex items-center gap-2 bg-[#0F766E] hover:bg-[#0D655E] text-white shadow-sm font-semibold"
          >
            <Plus className="w-4 h-4" /> Issue New Prescription
          </Button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1">
          {['ALL', 'ISSUED', 'PARTIALLY_FILLED', 'FILLED', 'EXPIRED'].map(st => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                filterStatus === st
                  ? 'bg-[#0F766E] text-white shadow-xs'
                  : 'bg-white dark:bg-[#112239] text-slate-600 dark:text-slate-300 border border-[#E2E8F0] dark:border-[#1E3A5F] hover:bg-slate-50 dark:hover:bg-[#1B314F]'
              }`}
            >
              {st === 'ALL' ? 'All Records' : st.replace('_', ' ')}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <Input
            type="text"
            placeholder="Search drug, patient, token..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      </div>

      {/* Prescriptions List Table / Cards */}
      {loading ? (
        <div className="bg-white dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl p-12 text-center">
          <Loader2 className="w-8 h-8 text-[#0F766E] animate-spin mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading prescription ledger...</p>
        </div>
      ) : filteredPrescriptions.length === 0 ? (
        <div className="bg-white dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl p-12 text-center">
          <Pill className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#0B2545] dark:text-white mb-1">No Prescriptions Found</h3>
          <p className="text-xs text-[#475569] dark:text-slate-400 max-w-sm mx-auto mb-4">
            {user.role === 'doctor'
              ? 'No prescriptions have been issued matching your active filter. Use the button above to create a new verified prescription.'
              : 'You have no prescriptions on this clinical ledger matching the selected criteria.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] bg-white dark:bg-[#112239] shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#1B314F]/50 border-b border-[#E2E8F0] dark:border-[#1E3A5F] text-[#0B2545] dark:text-slate-200">
                <th className="p-4 font-semibold">Date Issued</th>
                <th className="p-4 font-semibold">Patient</th>
                <th className="p-4 font-semibold">Doctor & Facility</th>
                <th className="p-4 font-semibold">Medications</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E3A5F] text-[#334155] dark:text-slate-300">
              {filteredPrescriptions.map(rx => (
                <tr key={rx.id} className="hover:bg-slate-50/60 dark:hover:bg-[#1B314F]/40 transition-colors">
                  <td className="p-4 whitespace-nowrap">
                    <div className="font-semibold text-[#0F172A] dark:text-white">
                      {new Date(rx.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Exp: {new Date(rx.expires_at).toLocaleDateString()}
                    </div>
                  </td>

                  <td className="p-4">
                    <div className="font-semibold text-[#0F172A] dark:text-white">{rx.patient_name}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{rx.patient_email}</div>
                  </td>

                  <td className="p-4">
                    <div className="font-semibold">{rx.doctor_name}</div>
                    <div className="text-[11px] text-slate-400">{rx.organization_name}</div>
                  </td>

                  <td className="p-4">
                    <div className="space-y-1">
                      {(rx.items || []).map((item, idx) => (
                        <div key={item.id || idx} className="flex items-center gap-2">
                          <span className="font-medium text-[#0F172A] dark:text-slate-100">{item.medication_name}</span>
                          <span className="text-[11px] text-slate-400">({item.dosage})</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                            item.quantity_dispensed >= item.quantity_prescribed
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}>
                            {item.quantity_dispensed}/{item.quantity_prescribed}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>

                  <td className="p-4 whitespace-nowrap">
                    {getStatusBadge(rx.status)}
                  </td>

                  <td className="p-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* View & QR Code button */}
                      <button
                        onClick={() => handleOpenQr(rx)}
                        title="View QR Code & Passport"
                        className="p-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#1E3A5F] bg-white dark:bg-[#0F243E] hover:bg-slate-50 dark:hover:bg-[#1B314F] text-[#0F766E] dark:text-[#2DD4BF] transition-colors cursor-pointer"
                      >
                        <QrCode className="w-4 h-4" />
                      </button>

                      {/* Direct Verification Link */}
                      <button
                        onClick={() => {
                          if (onSelectPrescriptionForVerification) {
                            onSelectPrescriptionForVerification(rx.qr_token);
                          } else {
                            window.open(`/?verifyPrescription=${encodeURIComponent(rx.qr_token)}`, '_blank');
                          }
                        }}
                        title="Print / Verify Passport View"
                        className="p-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#1E3A5F] bg-white dark:bg-[#0F243E] hover:bg-slate-50 dark:hover:bg-[#1B314F] text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {/* Dispense Action (For Doctors, Clinics, Admins) */}
                      {user.role !== 'patient' && rx.status !== 'FILLED' && rx.status !== 'CANCELLED' && rx.status !== 'EXPIRED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOpenDispense(rx)}
                          className="h-8 text-xs font-semibold text-[#0F766E] border-teal-600/30 hover:bg-teal-50 dark:hover:bg-teal-950/40"
                        >
                          Dispense
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: ISSUE PRESCRIPTION (DOCTOR ONLY)
          ========================================================================= */}
      {showIssueModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#0F243E] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl my-8 relative">
            <button
              onClick={() => setShowIssueModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-[#0B2545] border border-teal-200 dark:border-teal-900/60 flex items-center justify-center text-[#0F766E] dark:text-[#14B8A6]">
                <Pill className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#0B2545] dark:text-white">Issue Digital Clinical Prescription</h2>
                <p className="text-xs text-[#475569] dark:text-slate-300">Creates a cryptographically anchored verifiable prescription token.</p>
              </div>
            </div>

            {issueError && (
              <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-lg p-3 text-xs mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{issueError}</span>
              </div>
            )}

            {allergyWarnings.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/50 border-2 border-red-400 dark:border-red-700 text-red-900 dark:text-red-200 rounded-xl p-4 text-xs mb-4 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 mt-0.5 text-red-600 dark:text-red-400 shrink-0" />
                  <div>
                    <strong className="block font-bold text-red-800 dark:text-red-300 text-sm">
                      CRITICAL CLINICAL ALLERGY HARD BLOCK
                    </strong>
                    <p className="mt-1 text-red-700 dark:text-red-300">
                      The patient has documented contraindications to one or more selected medications:
                    </p>
                    <ul className="list-disc list-inside mt-1 space-y-0.5 font-medium">
                      {allergyWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-2 border-t border-red-200 dark:border-red-800">
                  <Label htmlFor="rx-override-rationale" className="font-bold text-red-900 dark:text-red-200 block mb-1">
                    Mandatory Clinical Override Justification <span className="text-red-600">*</span>
                  </Label>
                  <p className="text-[11px] text-red-700 dark:text-red-300 mb-1.5">
                    This action will be permanently recorded on the immutable clinical audit trail. Document therapeutic rationale, desensitization protocol, or lack of alternatives.
                  </p>
                  <textarea
                    id="rx-override-rationale"
                    rows={2}
                    className="form-control w-full text-xs border-red-300 focus:border-red-500 bg-white dark:bg-[#112239]"
                    placeholder="e.g. Desensitization protocol initiated; antihistamine prophylaxis administered; no therapeutic alternative available..."
                    value={overrideJustification}
                    onChange={(e) => setOverrideJustification(e.target.value)}
                    required
                  />
                  {overrideJustification.trim().length > 0 && overrideJustification.trim().length < 10 && (
                    <span className="text-[10px] text-red-600 dark:text-red-400 mt-1 block">
                      Minimum 10 characters required ({overrideJustification.trim().length}/10).
                    </span>
                  )}
                </div>
              </div>
            )}

            <form onSubmit={handleIssueSubmit} className="space-y-4">
              
              {/* Patient Selection & Expiry Days */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">
                    Target Patient <span className="text-red-500">*</span>
                  </Label>
                  <SearchableSelect
                    id="rx-patient-select"
                    className="form-control"
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    required
                    placeholder="-- Select Patient --"
                  >
                    <option value="">-- Select Patient --</option>
                    {patients.map(p => (
                      <option key={p.id || p._id} value={p.id || p._id}>
                        👤 {p.name} ({p.email})
                      </option>
                    ))}
                  </SearchableSelect>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="rx-expiry" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">
                    Validity (Days)
                  </Label>
                  <Input
                    type="number"
                    id="rx-expiry"
                    min="1"
                    max="180"
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Medication Items Builder */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-[#0B2545] dark:text-slate-200 uppercase tracking-wider">
                    Medication Items & Regimens
                  </Label>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Medication
                  </button>
                </div>

                {items.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-xl space-y-2.5 relative">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="absolute right-2 top-2 text-slate-400 hover:text-red-500 p-1"
                        title="Remove medication"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Drug Name with Autocomplete */}
                    <div className="relative">
                      <Label className="text-[11px] font-semibold text-[#0B2545] dark:text-slate-200">
                        Medication Name & RxNorm Lookup <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        type="text"
                        placeholder="Type medication name (e.g. Amoxicillin, Metformin...)"
                        value={item.medicationName}
                        onChange={(e) => handleDrugSearch(idx, e.target.value)}
                        required
                        className="text-xs"
                      />

                      {/* Autocomplete Dropdown */}
                      {drugSearchResults[idx] && drugSearchResults[idx].length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-[#162B48] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                          {drugSearchResults[idx].map((drug, dIdx) => (
                            <div
                              key={dIdx}
                              onClick={() => handleSelectDrug(idx, drug)}
                              className="p-2.5 hover:bg-slate-100 dark:hover:bg-[#1B314F] cursor-pointer text-xs flex items-center justify-between border-b border-slate-100 dark:border-slate-800 last:border-0"
                            >
                              <div>
                                <span className="font-semibold text-[#0B2545] dark:text-white">{drug.name}</span>
                                <span className="text-[10px] text-slate-400 block">{drug.category}</span>
                              </div>
                              {drug.rxnormCode && (
                                <span className="text-[10px] font-mono bg-slate-100 dark:bg-[#112239] px-1.5 py-0.5 rounded text-slate-500">
                                  RxNorm #{drug.rxnormCode}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Dosage, Frequency, Duration, Quantity */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <Label className="text-[10px] text-slate-500 dark:text-slate-400">Dosage</Label>
                        <Input
                          type="text"
                          placeholder="e.g. 500mg"
                          value={item.dosage}
                          onChange={(e) => handleItemChange(idx, 'dosage', e.target.value)}
                          required
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-500 dark:text-slate-400">Frequency</Label>
                        <Input
                          type="text"
                          placeholder="e.g. 3x daily"
                          value={item.frequency}
                          onChange={(e) => handleItemChange(idx, 'frequency', e.target.value)}
                          required
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-500 dark:text-slate-400">Duration</Label>
                        <Input
                          type="text"
                          placeholder="e.g. 7 days"
                          value={item.duration}
                          onChange={(e) => handleItemChange(idx, 'duration', e.target.value)}
                          required
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-500 dark:text-slate-400">Total Qty</Label>
                        <Input
                          type="number"
                          min="1"
                          placeholder="Qty"
                          value={item.quantityPrescribed}
                          onChange={(e) => handleItemChange(idx, 'quantityPrescribed', e.target.value)}
                          required
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                  </div>
                ))}
              </div>

              {/* Instructions */}
              <div className="space-y-1">
                <Label htmlFor="rx-instructions" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">
                  Prescriber Clinical Notes & Warnings
                </Label>
                <textarea
                  id="rx-instructions"
                  rows={2}
                  className="form-control w-full text-xs"
                  placeholder="e.g. Take with food. Do not stop antibiotic course prematurely."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowIssueModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={issueLoading || (allergyWarnings.length > 0 && overrideJustification.trim().length < 10)}
                  className="bg-[#0F766E] hover:bg-[#0D655E] text-white font-semibold"
                >
                  {issueLoading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Provisioning Ledger Token...
                    </span>
                  ) : (
                    'Issue & Generate QR Passport'
                  )}
                </Button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: DISPENSE MEDICATION (PHARMACY / CLINIC)
          ========================================================================= */}
      {dispenseRx && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#0F243E] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl my-8 relative">
            <button
              onClick={() => setDispenseRx(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-[#0B2545] border border-teal-200 dark:border-teal-900/60 flex items-center justify-center text-[#0F766E] dark:text-[#14B8A6]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#0B2545] dark:text-white">Pharmacy Dispensing Fulfillment</h2>
                <p className="text-xs text-[#475569] dark:text-slate-300">
                  Patient: <strong className="text-[#0B2545] dark:text-white">{dispenseRx.patient_name}</strong>
                </p>
              </div>
            </div>

            {dispenseError && (
              <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-lg p-3 text-xs mb-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{dispenseError}</span>
              </div>
            )}

            <form onSubmit={handleDispenseSubmit} className="space-y-4 text-xs">
              <div className="space-y-3">
                {(dispenseRx.items || []).map(item => {
                  const remaining = item.quantity_prescribed - item.quantity_dispensed;
                  return (
                    <div key={item.id} className="p-3 bg-slate-50 dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-xl flex items-center justify-between gap-3">
                      <div>
                        <span className="font-bold text-[#0B2545] dark:text-white block">{item.medication_name}</span>
                        <span className="text-[11px] text-slate-400">
                          Prescribed: {item.quantity_prescribed} | Dispensed: {item.quantity_dispensed} | Remaining: {remaining}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Label className="text-[11px] font-medium text-slate-500">Dispense:</Label>
                        <Input
                          type="number"
                          min="0"
                          max={remaining}
                          value={dispenseInputs[item.id] || 0}
                          onChange={(e) => setDispenseInputs({ ...dispenseInputs, [item.id]: e.target.value })}
                          className="w-20 h-8 text-xs text-center"
                          disabled={remaining <= 0}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1">
                <Label htmlFor="dispense-notes" className="text-xs font-semibold text-[#0B2545] dark:text-slate-200">
                  Dispensation Audit Notes
                </Label>
                <Input
                  id="dispense-notes"
                  type="text"
                  placeholder="e.g. Brand dispensed, batch number, pharmacist initials"
                  value={dispenseNotes}
                  onChange={(e) => setDispenseNotes(e.target.value)}
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDispenseRx(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={dispenseLoading}
                  className="bg-[#0F766E] hover:bg-[#0D655E] text-white font-semibold"
                >
                  {dispenseLoading ? 'Processing...' : 'Confirm Dispensation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: QR CODE & DIGITAL PASSPORT PREVIEW
          ========================================================================= */}
      {qrModalRx && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0F243E] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl text-center relative">
            <button
              onClick={() => setQrModalRx(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-[#0B2545] border border-teal-200 dark:border-teal-900/60 flex items-center justify-center text-[#0F766E] dark:text-[#14B8A6] mx-auto mb-3">
              <QrCode className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-[#0B2545] dark:text-white">Verifiable Prescription QR Passport</h3>
            <p className="text-xs text-[#475569] dark:text-slate-300 mt-1 mb-4">
              Patient: <strong className="text-[#0B2545] dark:text-white">{qrModalRx.patient_name}</strong>
            </p>

            {qrDataUrl && (
              <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-xs inline-block mb-4">
                <img src={qrDataUrl} alt="Prescription QR" className="w-48 h-48 mx-auto" />
              </div>
            )}

            <div className="bg-slate-50 dark:bg-[#112239] rounded-xl p-3 border border-[#E2E8F0] dark:border-[#1E3A5F] text-xs font-mono text-slate-600 dark:text-slate-300 mb-6 break-all select-all">
              {qrModalRx.qr_token}
            </div>

            <div className="flex gap-2 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  const url = `${window.location.origin}/?verifyPrescription=${encodeURIComponent(qrModalRx.qr_token)}`;
                  navigator.clipboard.writeText(url);
                  alert('Verification link copied to clipboard!');
                }}
              >
                Copy Public Link
              </Button>
              <Button
                onClick={() => {
                  window.open(`/?verifyPrescription=${encodeURIComponent(qrModalRx.qr_token)}`, '_blank');
                }}
                className="bg-[#0F766E] hover:bg-[#0D655E] text-white"
              >
                <Printer className="w-4 h-4 mr-1.5" /> View / Print Passport
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
