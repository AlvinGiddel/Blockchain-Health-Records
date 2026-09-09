import React, { useState, useEffect } from 'react';
import { 
  Pill, 
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Clock, 
  Search, 
  Calendar, 
  Hash, 
  Building2, 
  User, 
  FileText, 
  ArrowRight, 
  RefreshCw, 
  Check, 
  X, 
  ShieldAlert, 
  Sparkles, 
  CreditCard,
  History,
  QrCode
} from 'lucide-react';
import { safeFetch } from '../utils/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';

export default function PharmacyDashboard({ user, onShowPaystack }) {
  const [metrics, setMetrics] = useState({
    total_prescriptions_served: 0,
    total_dispensations: 0,
    total_units_dispensed: 0,
    prescriptions_served_today: 0
  });
  const [orgInfo, setOrgInfo] = useState(null);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  // QR Lookup & Prescription State
  const [searchToken, setSearchToken] = useState('');
  const [searching, setSearching] = useState(false);
  const [activePrescription, setActivePrescription] = useState(null);
  const [lookupError, setLookupError] = useState('');

  // Dispensing Form State
  const [dispenseItemsState, setDispenseItemsState] = useState({});
  const [dispenseNotes, setDispenseNotes] = useState('');
  const [dispensing, setDispensing] = useState(false);
  const [dispenseSuccess, setDispenseSuccess] = useState('');
  const [dispenseError, setDispenseError] = useState('');

  // History State
  const [dispensations, setDispensations] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Load pharmacy metrics & dispensations history
  const loadData = async () => {
    try {
      setLoadingMetrics(true);
      const metricsData = await safeFetch('/api/pharmacy/metrics');
      if (metricsData) {
        setMetrics(metricsData.metrics || {});
        setOrgInfo(metricsData.organization || {});
      }
    } catch (err) {
      console.error('Failed to load pharmacy metrics:', err);
    } finally {
      setLoadingMetrics(false);
    }

    try {
      setLoadingHistory(true);
      const histData = await safeFetch('/api/pharmacy/dispensations');
      setDispensations(histData?.dispensations || []);
    } catch (err) {
      console.error('Failed to load dispensations history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Handle Prescription Lookup by QR Token
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const tokenToSearch = searchToken.trim();
    if (!tokenToSearch) {
      setLookupError('Please enter or scan a prescription QR token.');
      return;
    }

    setSearching(true);
    setLookupError('');
    setActivePrescription(null);
    setDispenseSuccess('');
    setDispenseError('');

    try {
      const rx = await safeFetch(`/api/prescriptions/verify/${encodeURIComponent(tokenToSearch)}`);
      if (!rx || !rx.verified) {
        setLookupError(rx?.error || 'Invalid or cancelled prescription token.');
      } else {
        setActivePrescription(rx);
        // Initialize item dispensation inputs
        const initialItemState = {};
        (rx.items || []).forEach(item => {
          const remaining = Math.max(0, item.quantityPrescribed - (item.quantityDispensed || 0));
          initialItemState[item.id] = {
            quantity: remaining > 0 ? remaining : 0,
            batchNumber: '',
            expiryDate: ''
          };
        });
        setDispenseItemsState(initialItemState);
      }
    } catch (err) {
      setLookupError(err.message || 'Prescription not found or invalid token.');
    } finally {
      setSearching(false);
    }
  };

  // Handle Dispense Submit
  const handleDispense = async (e) => {
    e.preventDefault();
    if (!activePrescription) return;

    setDispensing(true);
    setDispenseError('');
    setDispenseSuccess('');

    // Prepare item dispensations payload
    const itemsToDispense = [];
    for (const item of (activePrescription.items || [])) {
      const state = dispenseItemsState[item.id];
      if (state && state.quantity > 0) {
        itemsToDispense.push({
          itemId: item.id,
          quantityDispensed: parseInt(state.quantity, 10),
          batchNumber: (state.batchNumber || '').trim(),
          expiryDate: state.expiryDate || null
        });
      }
    }

    if (itemsToDispense.length === 0) {
      setDispenseError('Please specify at least 1 unit to dispense with a valid batch number.');
      setDispensing(false);
      return;
    }

    try {
      // Find prescription UUID (from activePrescription or lookup response)
      // Since verify returns qrToken, we can look up by ID or token:
      const rxDetails = await safeFetch(`/api/prescriptions/${activePrescription.qrToken}`);
      const targetId = rxDetails?.id || activePrescription.qrToken;

      const res = await safeFetch(`/api/prescriptions/${targetId}/dispense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemDispenses: itemsToDispense,
          notes: dispenseNotes.trim()
        })
      });

      setDispenseSuccess('Medication dispensed and logged to immutable audit trail successfully!');
      setDispenseNotes('');
      // Reload metrics and history
      loadData();
      // Refresh active prescription view
      handleSearch();
    } catch (err) {
      if (err.status === 409 || (err.message && err.message.toLowerCase().includes('conflict'))) {
        setDispenseError(`Rival Dispensing Conflict: ${err.message}. This item has already been filled elsewhere or remaining quota was exceeded.`);
      } else if (err.status === 403 && (err.message && err.message.toLowerCase().includes('expired'))) {
        setDispenseError(`License Expired: Your pharmacy subscription has lapsed. Please renew your license to fulfill prescriptions.`);
      } else {
        setDispenseError(err.message || 'Failed to dispense medication.');
      }
    } finally {
      setDispensing(false);
    }
  };

  // Trial / License calculations
  const licenseExpiresAt = orgInfo?.license_expires_at ? new Date(orgInfo.license_expires_at) : null;
  const isExpired = orgInfo?.status === 'expired' || (licenseExpiresAt && licenseExpiresAt < new Date());
  const daysRemaining = licenseExpiresAt ? Math.max(0, Math.ceil((licenseExpiresAt - new Date()) / (1000 * 60 * 60 * 24))) : 0;

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4 sm:p-6 pb-20">
      
      {/* Top Banner: Pharmacy Header & License Status */}
      <div className="bg-white dark:bg-[#0F243E] border border-slate-200 dark:border-[#1E3A5F] rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center shrink-0">
              <Pill className="w-6 h-6 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {orgInfo?.name || user.organizationName || 'Licensed Pharmacy Portal'}
                </h1>
                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 text-xs">
                  PPB Registered Premise
                </Badge>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                <span><strong>PPB License:</strong> {orgInfo?.ppb_license_number || 'PPB/PREM/VERIFIED'}</span>
                <span>&bull;</span>
                <span><strong>Superintendent:</strong> {user.name}</span>
                {orgInfo?.physical_address && (
                  <>
                    <span>&bull;</span>
                    <span>{orgInfo.physical_address}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* License Status Badge & Renew CTA */}
          <div className="flex items-center gap-3 self-start md:self-auto bg-slate-50 dark:bg-[#132A4A] p-3 rounded-xl border border-slate-200 dark:border-[#1E3A5F]">
            <div>
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Subscription Tier
              </div>
              <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                {isExpired ? (
                  <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" /> Expired (Read-Only)
                  </span>
                ) : (
                  <span className="text-teal-700 dark:text-teal-300 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    {orgInfo?.status === 'trial' ? `Trial (${daysRemaining}d left)` : 'Monthly Active'}
                  </span>
                )}
              </div>
            </div>
            {onShowPaystack && (
              <Button
                size="sm"
                onClick={onShowPaystack}
                className="bg-teal-600 hover:bg-teal-700 text-white text-xs gap-1.5 ml-2 shadow-sm"
              >
                <CreditCard className="w-3.5 h-3.5" />
                {isExpired ? 'Renew License' : 'Upgrade Plan'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#0F243E] border border-slate-200 dark:border-[#1E3A5F] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Prescriptions Today</span>
            <Calendar className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {loadingMetrics ? '...' : metrics.prescriptions_served_today}
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">Verified & filled today</span>
        </div>

        <div className="bg-white dark:bg-[#0F243E] border border-slate-200 dark:border-[#1E3A5F] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Units Dispensed</span>
            <Pill className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {loadingMetrics ? '...' : metrics.total_units_dispensed}
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">Cumulative medication units</span>
        </div>

        <div className="bg-white dark:bg-[#0F243E] border border-slate-200 dark:border-[#1E3A5F] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Dispensary Events</span>
            <History className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {loadingMetrics ? '...' : metrics.total_dispensations}
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">Batch-logged fulfillment events</span>
        </div>

        <div className="bg-white dark:bg-[#0F243E] border border-slate-200 dark:border-[#1E3A5F] rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total Patients Served</span>
            <Shield className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
            {loadingMetrics ? '...' : metrics.total_prescriptions_served}
          </div>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">Unique prescriptions fulfilled</span>
        </div>
      </div>

      {/* QR Code Scanner & Prescription Verification Terminal */}
      <div className="bg-white dark:bg-[#0F243E] border border-slate-200 dark:border-[#1E3A5F] rounded-2xl p-6 shadow-sm">
        <div className="max-w-2xl">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-teal-600" />
            Prescription Verification & Dispensing Terminal
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Scan patient QR code or paste prescription token to verify validity and unlock full clinical posology.
          </p>

          <form onSubmit={handleSearch} className="mt-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <Input
                type="text"
                placeholder="Scan or enter token e.g. rx_9f8c12a7d4e5..."
                className="pl-9 font-mono text-sm"
                value={searchToken}
                onChange={(e) => setSearchToken(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={searching || !searchToken.trim()}
              className="bg-teal-600 hover:bg-teal-700 text-white shrink-0 gap-1.5"
            >
              {searching ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Verifying...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" /> Verify Token
                </>
              )}
            </Button>
          </form>

          {lookupError && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{lookupError}</span>
            </div>
          )}
        </div>

        {/* Active Prescription Verification Result */}
        {activePrescription && (
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-[#1E3A5F] space-y-6">
            
            {/* Header & Clinical Trust Badges */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-[#112239] p-4 rounded-xl border border-slate-200 dark:border-[#1E3A5F]">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-600 text-white text-xs">
                    Cryptographically Verified
                  </Badge>
                  <span className="font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {activePrescription.qrToken}
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                  <span>Prescribed for: <strong>{activePrescription.patientMaskedName || 'Patient'}</strong></span>
                  <span>&bull;</span>
                  <span>Issued: {new Date(activePrescription.issuedAt).toLocaleDateString()}</span>
                  <span>&bull;</span>
                  <span>Expires: {new Date(activePrescription.expiresAt).toLocaleDateString()}</span>
                </div>
              </div>

              <div className="text-left sm:text-right text-xs">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  {activePrescription.issuingDoctor?.name} ({activePrescription.issuingDoctor?.cadre})
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  {activePrescription.issuingFacility?.name} &bull; Reg: {activePrescription.issuingDoctor?.licenseNumber}
                </div>
              </div>
            </div>

            {/* Prescriber Allergy Override Note if present */}
            {activePrescription.overrideJustification && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 rounded-lg text-xs flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block">Clinical Allergy Override Recorded by Prescriber:</strong>
                  <span>{activePrescription.overrideJustification}</span>
                </div>
              </div>
            )}

            {/* Unmasked Posology & Items Fulfillment Form */}
            <form onSubmit={handleDispense} className="space-y-4">
              <div className="border border-slate-200 dark:border-[#1E3A5F] rounded-xl overflow-hidden">
                <div className="bg-slate-100 dark:bg-[#132A4A] px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 grid grid-cols-12 gap-2">
                  <div className="col-span-12 sm:col-span-4">Medication & Posology</div>
                  <div className="col-span-4 sm:col-span-2 text-center">Prescribed / Dispensed</div>
                  <div className="col-span-4 sm:col-span-2">Quantity to Dispense</div>
                  <div className="col-span-4 sm:col-span-2">Batch Number</div>
                  <div className="col-span-12 sm:col-span-2">Expiry Date</div>
                </div>

                <div className="divide-y divide-slate-200 dark:divide-[#1E3A5F]">
                  {(activePrescription.items || []).map((item) => {
                    const remaining = Math.max(0, item.quantityPrescribed - (item.quantityDispensed || 0));
                    const isFullyFilled = remaining === 0;
                    const itemState = dispenseItemsState[item.id] || { quantity: 0, batchNumber: '', expiryDate: '' };

                    return (
                      <div key={item.id} className={`p-4 grid grid-cols-12 gap-3 items-center text-xs ${isFullyFilled ? 'bg-slate-50/60 dark:bg-slate-900/40 opacity-75' : ''}`}>
                        
                        {/* Medication Info */}
                        <div className="col-span-12 sm:col-span-4">
                          <div className="font-bold text-slate-900 dark:text-white text-sm">
                            {item.medicationName}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                            {item.dosage} &bull; {item.frequency} &bull; {item.duration}
                          </div>
                        </div>

                        {/* Status / Quantities */}
                        <div className="col-span-4 sm:col-span-2 text-center">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {item.quantityDispensed} / {item.quantityPrescribed}
                          </span>
                          {isFullyFilled ? (
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5 flex items-center justify-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Filled
                            </div>
                          ) : (
                            <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
                              {remaining} remaining
                            </div>
                          )}
                        </div>

                        {/* Quantity Input */}
                        <div className="col-span-4 sm:col-span-2">
                          <Input
                            type="number"
                            min="0"
                            max={remaining}
                            disabled={isFullyFilled || dispensing}
                            value={itemState.quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              setDispenseItemsState(prev => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  quantity: Math.min(remaining, Math.max(0, val))
                                }
                              }));
                            }}
                            className="text-xs h-8"
                          />
                        </div>

                        {/* Batch Number Input */}
                        <div className="col-span-4 sm:col-span-2">
                          <Input
                            type="text"
                            placeholder="e.g. BATCH-01"
                            disabled={isFullyFilled || dispensing}
                            value={itemState.batchNumber}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDispenseItemsState(prev => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  batchNumber: val
                                }
                              }));
                            }}
                            className="text-xs h-8 font-mono"
                          />
                        </div>

                        {/* Expiry Date Input */}
                        <div className="col-span-12 sm:col-span-2">
                          <Input
                            type="date"
                            disabled={isFullyFilled || dispensing}
                            value={itemState.expiryDate}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDispenseItemsState(prev => ({
                                ...prev,
                                [item.id]: {
                                  ...prev[item.id],
                                  expiryDate: val
                                }
                              }));
                            }}
                            className="text-xs h-8"
                          />
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Instructions & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-slate-500 dark:text-slate-400">Prescriber Clinical Instructions</Label>
                  <div className="p-3 bg-slate-50 dark:bg-[#112239] rounded-lg text-xs text-slate-700 dark:text-slate-300 min-h-[50px]">
                    {activePrescription.instructions || 'Standard dosage as labeled.'}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="dispenseNotes" className="text-xs text-slate-500 dark:text-slate-400">Pharmacist Dispensing Notes</Label>
                  <Input
                    id="dispenseNotes"
                    placeholder="e.g. Patient counseled on completing full antibiotic course"
                    value={dispenseNotes}
                    onChange={(e) => setDispenseNotes(e.target.value)}
                    disabled={dispensing}
                    className="text-xs"
                  />
                </div>
              </div>

              {/* Success / Error Alerts */}
              {dispenseSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-lg text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{dispenseSuccess}</span>
                </div>
              )}

              {dispenseError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 rounded-lg text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{dispenseError}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActivePrescription(null);
                    setSearchToken('');
                    setDispenseError('');
                    setDispenseSuccess('');
                  }}
                  disabled={dispensing}
                >
                  Clear
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={dispensing || isExpired}
                  className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5"
                >
                  {dispensing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Recording Dispensation...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" /> Confirm Dispensation
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Pharmacy Fulfillment Audit Trail Table */}
      <div className="bg-white dark:bg-[#0F243E] border border-slate-200 dark:border-[#1E3A5F] rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-teal-600" />
              Recent Pharmacy Dispensation History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Multi-tenant isolated record of all fulfillments executed under {orgInfo?.name || 'this pharmacy'}.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${loadingHistory ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {loadingHistory ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading fulfillment history...</div>
        ) : dispensations.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 dark:bg-[#112239] rounded-xl">
            No dispensations recorded yet. Search and dispense a verified prescription above to log your first transaction.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#1E3A5F] text-slate-500 dark:text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3">Prescription Token</th>
                  <th className="py-2.5 px-3">Medication</th>
                  <th className="py-2.5 px-3">Batch Number</th>
                  <th className="py-2.5 px-3">Item Expiry</th>
                  <th className="py-2.5 px-3">Qty Dispensed</th>
                  <th className="py-2.5 px-3">Pharmacist</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E3A5F]">
                {dispensations.slice(0, 15).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      {new Date(log.created_at).toLocaleString('en-KE', { 
                        dateStyle: 'short', 
                        timeStyle: 'short' 
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-800 dark:text-slate-200 font-medium">
                      {log.qr_token ? `${log.qr_token.slice(0, 12)}...` : 'Prescription'}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                      {log.medication_name || 'Standard Medication'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                      {log.batch_number || 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                      {log.item_expiry_date ? new Date(log.item_expiry_date).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-teal-700 dark:text-teal-400">
                      {log.quantity_dispensed}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                      {log.pharmacist_name || user.name}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
