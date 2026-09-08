import React, { useEffect, useState } from 'react';
import { ShieldCheck, AlertCircle, Clock, CheckCircle2, Building2, User, Printer, ArrowLeft, Pill, XCircle, RefreshCw } from 'lucide-react';
import QRCode from 'qrcode';
import logoSvg from '../assets/logo.svg';
import { safeFetch } from '../utils/api';

export default function PrescriptionVerificationView({ qrToken, onDismiss }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [unlockLoading, setUnlockLoading] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  const fetchVerification = (code = '') => {
    setLoading(true);
    setError('');

    const queryParam = code ? `?dobYear=${encodeURIComponent(code)}` : '';
    safeFetch(`/api/prescriptions/verify/${encodeURIComponent(qrToken)}${queryParam}`)
      .then(res => {
        setData(res);
        const currentUrl = window.location.href;
        QRCode.toDataURL(currentUrl, {
          width: 220,
          margin: 2,
          color: { dark: '#0b2545', light: '#ffffff' }
        })
          .then(url => setQrDataUrl(url))
          .catch(err => console.error('Failed to generate QR code data URL:', err));
      })
      .catch(err => {
        setError(err.message || 'Prescription could not be verified or has been revoked.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!qrToken) {
      setError('No prescription verification token provided.');
      setLoading(false);
      return;
    }
    fetchVerification();
  }, [qrToken]);

  const handleUnlock = async (e) => {
    if (e) e.preventDefault();
    if (!verifyCode.trim()) return;
    setUnlockLoading(true);
    setUnlockError('');
    try {
      const res = await safeFetch(`/api/prescriptions/verify/${encodeURIComponent(qrToken)}?dobYear=${encodeURIComponent(verifyCode.trim())}`);
      if (res.medicationsRestricted) {
        setUnlockError('Verification code mismatch. Please confirm the patient birth year (YYYY) or phone.');
      } else {
        setData(res);
      }
    } catch (err) {
      setUnlockError(err.message || 'Failed to unlock medication details.');
    } finally {
      setUnlockLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B192C] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#112239] border border-slate-200 dark:border-[#1E3A5F] rounded-2xl p-8 max-w-md w-full text-center shadow-lg">
          <RefreshCw className="w-8 h-8 text-[#0F766E] dark:text-[#14B8A6] animate-spin mx-auto mb-3" />
          <h3 className="text-lg font-bold text-[#0B2545] dark:text-white">Verifying Prescription Token...</h3>
          <p className="text-xs text-[#475569] dark:text-slate-300 mt-1">Connecting to Block Health Chain cryptographic verification ledger.</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B192C] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#112239] border border-red-200 dark:border-red-900/60 rounded-2xl p-8 max-w-md w-full text-center shadow-lg">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto mb-3">
            <XCircle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-red-700 dark:text-red-300">Verification Unsuccessful</h3>
          <p className="text-xs text-[#475569] dark:text-slate-300 mt-2 mb-6">
            {error || 'This prescription token was not found on the active ledger. It may have expired or been revoked by the issuing clinic.'}
          </p>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Return to Platform
            </button>
          )}
        </div>
      </div>
    );
  }

  const getStatusBadge = () => {
    switch (data.status) {
      case 'ISSUED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Valid & Ready to Fill
          </span>
        );
      case 'PARTIALLY_FILLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
            <Clock className="w-3.5 h-3.5" /> Partially Dispensed
          </span>
        );
      case 'FILLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Fully Fulfilled
          </span>
        );
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <Clock className="w-3.5 h-3.5" /> Expired
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-700">
            <AlertCircle className="w-3.5 h-3.5" /> Cancelled by Prescriber
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#07182D] text-[#0F172A] dark:text-[#F8FAFC] p-4 sm:p-8 flex flex-col items-center">
      
      {/* Non-Printable Top Navigation & Actions */}
      <div className="w-full max-w-3xl flex items-center justify-between mb-4 print:hidden">
        {onDismiss ? (
          <button
            onClick={onDismiss}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Return to Platform
          </button>
        ) : <div />}

        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 bg-[#0F766E] text-white hover:bg-[#0D655E] px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
        >
          <Printer className="w-4 h-4" /> Print / Save Prescription
        </button>
      </div>

      {/* Printable Clinical Prescription Sheet */}
      <div className="w-full max-w-3xl bg-white dark:bg-[#0F243E] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl shadow-sm dark:shadow-2xl p-6 sm:p-10 print:border-none print:shadow-none print:p-0 print:bg-white print:text-black">
        
        {/* Prescription Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 border-b border-[#E2E8F0] dark:border-[#1E3A5F] gap-4">
          <div className="flex items-center gap-3">
            <img src={logoSvg} alt="Logo" className="w-10 h-10 rounded-lg" />
            <div>
              <h1 className="text-xl font-bold text-[#0B2545] dark:text-white print:text-black">BLOCK HEALTH CHAIN</h1>
              <div className="flex items-center gap-2 text-xs text-[#0F766E] dark:text-[#2DD4BF] font-medium print:text-slate-600">
                <ShieldCheck className="w-3.5 h-3.5" /> Cryptographically Verified Digital Prescription
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-1">
            {getStatusBadge()}
            <span className="text-[11px] font-mono text-[#475569] dark:text-slate-400 mt-1">
              Token: {data.qrToken}
            </span>
          </div>
        </div>

        {/* Clinical Attribution Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-6 border-b border-[#E2E8F0] dark:border-[#1E3A5F] text-xs">
          
          {/* Patient Details */}
          <div className="bg-slate-50 dark:bg-[#112239] rounded-xl p-4 border border-[#E2E8F0] dark:border-[#1E3A5F] print:bg-slate-50">
            <div className="flex items-center gap-1.5 font-bold text-[#0B2545] dark:text-white mb-2 print:text-black">
              <User className="w-4 h-4 text-[#0F766E]" /> Patient Identification
            </div>
            <div className="space-y-1 text-[#334155] dark:text-slate-300 print:text-slate-800">
              <div><span className="font-semibold">Name:</span> {data.patientMaskedName}</div>
              <div><span className="font-semibold">Issued:</span> {new Date(data.issuedAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
              <div><span className="font-semibold">Expires:</span> {new Date(data.expiresAt).toLocaleDateString(undefined, { dateStyle: 'long' })}</div>
            </div>
          </div>

          {/* Prescriber & Facility Details */}
          <div className="bg-slate-50 dark:bg-[#112239] rounded-xl p-4 border border-[#E2E8F0] dark:border-[#1E3A5F] print:bg-slate-50">
            <div className="flex items-center gap-1.5 font-bold text-[#0B2545] dark:text-white mb-2 print:text-black">
              <Building2 className="w-4 h-4 text-[#0F766E]" /> Issuing Healthcare Facility
            </div>
            <div className="space-y-1 text-[#334155] dark:text-slate-300 print:text-slate-800">
              <div><span className="font-semibold">Facility:</span> {data.issuingFacility?.name || 'Healthcare Node'}</div>
              <div><span className="font-semibold">Doctor:</span> {data.issuingDoctor?.name}</div>
              <div><span className="font-semibold">Cadre:</span> {data.issuingDoctor?.cadre} ({data.issuingDoctor?.specialization})</div>
            </div>
          </div>

        </div>

        {/* Zero-Knowledge Privacy Challenge Banner (When Restricted) */}
        {data.medicationsRestricted ? (
          <div className="py-6 border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
            <div className="bg-amber-50 dark:bg-[#122846] border border-amber-300 dark:border-amber-700/60 rounded-2xl p-6 text-xs text-amber-950 dark:text-amber-200">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="flex-1 space-y-2">
                  <h3 className="text-sm font-bold text-[#0B2545] dark:text-white">
                    Clinical Posology Privacy Safeguard Active (Zero-Knowledge Verification)
                  </h3>
                  <p className="text-[#334155] dark:text-slate-300 leading-relaxed">
                    Digital passport authenticity, issuing facility, and doctor credentials are cryptographically verified. Specific medication names and posology instructions are protected to prevent unauthorized disclosure of sensitive health conditions.
                  </p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                    External Dispensing Pharmacists & Patients: Enter Patient Year of Birth (YYYY) or last 4 digits of phone number to unlock full posology.
                  </p>

                  <form onSubmit={handleUnlock} className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                    <input
                      type="text"
                      placeholder="e.g. 1995"
                      value={verifyCode}
                      onChange={(e) => { setVerifyCode(e.target.value); setUnlockError(''); }}
                      maxLength={6}
                      className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#07182D] text-[#0B2545] dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#0F766E] w-full sm:w-48 font-mono"
                      required
                    />
                    <button
                      type="submit"
                      disabled={unlockLoading || !verifyCode.trim()}
                      className="w-full sm:w-auto px-4 py-2 bg-[#0F766E] hover:bg-[#0D655E] disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {unlockLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Unlock Clinical Posology'}
                    </button>
                  </form>
                  {unlockError && (
                    <div className="text-red-600 dark:text-red-400 font-semibold text-[11px] pt-1">
                      {unlockError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Unlocked Clinical Posology View */
          <div className="py-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Pill className="w-4 h-4 text-[#0F766E]" />
                <h2 className="text-sm font-bold text-[#0B2545] dark:text-white uppercase tracking-wider print:text-black">
                  Prescribed Medications & Posology (Unlocked)
                </h2>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Patient Identity Verified
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[#E2E8F0] dark:border-[#1E3A5F]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 dark:bg-[#112239] border-b border-[#E2E8F0] dark:border-[#1E3A5F] text-[#0B2545] dark:text-slate-200 print:bg-slate-200">
                    <th className="p-3 font-bold">Medication Name</th>
                    <th className="p-3 font-bold">Dosage</th>
                    <th className="p-3 font-bold">Frequency</th>
                    <th className="p-3 font-bold">Duration</th>
                    <th className="p-3 font-bold text-center">Prescribed</th>
                    <th className="p-3 font-bold text-center">Dispensed</th>
                    <th className="p-3 font-bold text-right">Fulfillment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-[#1E3A5F] text-[#334155] dark:text-slate-300 print:text-slate-800">
                  {(data.items || []).map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-[#1B314F]/40">
                      <td className="p-3 font-semibold text-[#0F172A] dark:text-white print:text-black">
                        {item.medicationName}
                      </td>
                      <td className="p-3">{item.dosage}</td>
                      <td className="p-3">{item.frequency}</td>
                      <td className="p-3">{item.duration}</td>
                      <td className="p-3 text-center font-bold">{item.quantityPrescribed}</td>
                      <td className="p-3 text-center font-bold text-[#0F766E] dark:text-[#2DD4BF]">
                        {item.quantityDispensed}
                      </td>
                      <td className="p-3 text-right">
                        {item.isFullyDispensed ? (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Complete</span>
                        ) : item.quantityDispensed > 0 ? (
                          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                            {item.quantityPrescribed - item.quantityDispensed} remaining
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-500">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Clinical Allergy Override Disclosure (if recorded) */}
        {data.overrideJustification && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl p-3 text-xs mb-4">
            <strong className="block font-bold text-amber-800 dark:text-amber-300 mb-0.5">
              Prescriber Clinical Allergy Override Justification:
            </strong>
            <p className="text-amber-900 dark:text-amber-200 font-mono text-[11px]">
              {data.overrideJustification}
            </p>
          </div>
        )}

        {/* Clinical Instructions / Dispenser Notes */}
        {data.instructions && (
          <div className="bg-slate-50 dark:bg-[#112239] rounded-xl p-4 border border-[#E2E8F0] dark:border-[#1E3A5F] text-xs mb-6">
            <strong className="block font-bold text-[#0B2545] dark:text-white mb-1 print:text-black">
              Prescriber Instructions / Notes:
            </strong>
            <p className="text-[#334155] dark:text-slate-300 whitespace-pre-line leading-relaxed">
              {data.instructions}
            </p>
          </div>
        )}

        {/* Verification QR Code & Cryptographic Ledger Footer */}
        <div className="pt-6 border-t border-[#E2E8F0] dark:border-[#1E3A5F] flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="text-xs text-[#475569] dark:text-slate-400 max-w-sm">
            <div className="font-semibold text-[#0B2545] dark:text-white mb-1 print:text-black">
              Digital Healthcare Authentication
            </div>
            <p className="leading-relaxed text-[11px]">
              This prescription is recorded on the Block Health Chain multi-tenant medical ledger. Pharmacists may scan this QR code with any standard camera to verify statutory authenticity and update fulfillment records.
            </p>
          </div>

          {qrDataUrl && (
            <div className="flex flex-col items-center">
              <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-xs">
                <img src={qrDataUrl} alt="Prescription Verification QR Code" className="w-28 h-28" />
              </div>
              <span className="text-[10px] font-mono text-slate-500 mt-1 uppercase tracking-wider">Scan to Verify</span>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
