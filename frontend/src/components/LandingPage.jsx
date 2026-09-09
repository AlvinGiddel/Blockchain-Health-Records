import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  CheckCircle2, 
  Lock, 
  FileText, 
  QrCode, 
  UserCheck, 
  Building2, 
  ArrowRight, 
  ChevronRight, 
  Activity, 
  Server, 
  Sparkles, 
  Stethoscope, 
  Heart, 
  Phone, 
  Mail, 
  MapPin, 
  Menu, 
  X, 
  ExternalLink, 
  FileCheck, 
  Clock, 
  Database,
  ArrowUpRight,
  Pill,
  Users,
  TrendingUp
} from 'lucide-react';
import logoSvg from '../assets/logo.svg';
import { ThemeToggle } from './ui/theme-toggle';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { safeFetch } from '../utils/api';

export default function LandingPage({ onNavigateLogin, onGoToDashboard, isLoggedIn }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [facilityCount, setFacilityCount] = useState(null);
  
  // Fetch live active facility count for social proof
  useEffect(() => {
    let isMounted = true;
    safeFetch('/api/organizations/active')
      .then(data => {
        if (isMounted && Array.isArray(data)) {
          setFacilityCount(data.length);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const formatKES = (amount) => {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: 'KES',
      maximumFractionDigits: 0
    }).format(amount);
  };


  const scrollToSection = (id) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#07182D] text-[#0F172A] dark:text-[#F8FAFC] font-sans antialiased transition-colors duration-200">
      
      {/* ========================================================================= */}
      {/* 1. HEADER                                                                 */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-50 bg-white/95 dark:bg-[#0B192C]/95 backdrop-blur-md border-b border-[#E2E8F0] dark:border-[#1E3A5F] transition-colors duration-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          
          {/* Logo Brand with seal + pulse motif */}
          <div 
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="relative">
              <img 
                src={logoSvg} 
                alt="Block Health Chain" 
                className="w-9 h-9 rounded-xl transition-transform duration-200 group-hover:scale-105" 
              />
              <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1D9E75] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-[#1D9E75]"></span>
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-base font-extrabold tracking-tight text-[#0B2545] dark:text-white leading-tight">
                BLOCK HEALTH CHAIN
              </span>
              <span className="text-[11px] font-semibold text-[#0F766E] dark:text-[#2DD4BF] tracking-wider uppercase">
                Clinical Trust Network
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[#475569] dark:text-slate-300">
            <button 
              onClick={() => scrollToSection('features')}
              className="hover:text-[#0F766E] dark:hover:text-[#2DD4BF] transition-colors cursor-pointer"
            >
              Features
            </button>
            <button 
              onClick={() => scrollToSection('security')}
              className="hover:text-[#0F766E] dark:hover:text-[#2DD4BF] transition-colors cursor-pointer"
            >
              Trust & Security
            </button>
            <button 
              onClick={() => scrollToSection('pharmacy-pricing')}
              className="hover:text-[#0F766E] dark:hover:text-[#2DD4BF] transition-colors cursor-pointer flex items-center gap-1"
            >
              <Pill className="w-3.5 h-3.5" /> Pharmacy
            </button>
            <button 
              onClick={() => scrollToSection('pricing')}
              className="hover:text-[#0F766E] dark:hover:text-[#2DD4BF] transition-colors cursor-pointer"
            >
              Pricing
            </button>
            <button 
              onClick={() => scrollToSection('contact')}
              className="hover:text-[#0F766E] dark:hover:text-[#2DD4BF] transition-colors cursor-pointer"
            >
              Contact
            </button>
          </nav>

          {/* Right Action Bar */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />

            {isLoggedIn ? (
              <Button
                onClick={onGoToDashboard}
                className="bg-[#0F766E] hover:bg-[#115E59] text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm flex items-center gap-2"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => onNavigateLogin()}
                  className="border-[#CBD5E1] dark:border-[#1E3A5F] bg-white dark:bg-[#112239] text-[#0B2545] dark:text-white hover:bg-slate-100 dark:hover:bg-[#1B314F] text-sm font-medium px-4"
                >
                  Log in
                </Button>
                <Button
                  onClick={() => onNavigateLogin('?register=clinic')}
                  className="bg-[#0F766E] hover:bg-[#115E59] text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm"
                >
                  Register Facility
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu & Theme Toggle */}
          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-[#475569] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#112239] transition-colors"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden border-b border-[#E2E8F0] dark:border-[#1E3A5F] bg-white dark:bg-[#0B192C] px-4 pt-3 pb-5 space-y-3">
            <div className="flex flex-col space-y-2 text-sm font-medium text-[#475569] dark:text-slate-300">
              <button 
                onClick={() => scrollToSection('features')}
                className="text-left py-2 px-3 rounded-md hover:bg-slate-50 dark:hover:bg-[#112239]"
              >
                Features
              </button>
              <button 
                onClick={() => scrollToSection('security')}
                className="text-left py-2 px-3 rounded-md hover:bg-slate-50 dark:hover:bg-[#112239]"
              >
                Trust & Security
              </button>
              <button 
                onClick={() => scrollToSection('pharmacy-pricing')}
                className="text-left py-2 px-3 rounded-md hover:bg-slate-50 dark:hover:bg-[#112239] flex items-center gap-2"
              >
                <Pill className="w-3.5 h-3.5 text-[#0F766E]" /> Pharmacy Portal
              </button>
              <button 
                onClick={() => scrollToSection('pricing')}
                className="text-left py-2 px-3 rounded-md hover:bg-slate-50 dark:hover:bg-[#112239]"
              >
                Pricing
              </button>
              <button 
                onClick={() => scrollToSection('contact')}
                className="text-left py-2 px-3 rounded-md hover:bg-slate-50 dark:hover:bg-[#112239]"
              >
                Contact
              </button>
            </div>
            <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E3A5F] flex flex-col gap-2">
              {isLoggedIn ? (
                <Button
                  onClick={onGoToDashboard}
                  className="w-full bg-[#0F766E] text-white justify-center"
                >
                  Go to Dashboard
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => { setMobileMenuOpen(false); onNavigateLogin(); }}
                    className="w-full justify-center border-[#CBD5E1] dark:border-[#1E3A5F] bg-white dark:bg-[#112239] text-[#0B2545] dark:text-white hover:bg-slate-100 dark:hover:bg-[#1B314F]"
                  >
                    Log in to Portal
                  </Button>
                  <Button
                    onClick={() => { setMobileMenuOpen(false); onNavigateLogin('?register=clinic'); }}
                    className="w-full bg-[#0F766E] text-white justify-center"
                  >
                    Register your clinic
                  </Button>
                  <button
                    onClick={() => { setMobileMenuOpen(false); onNavigateLogin('?register=pharmacy'); }}
                    className="text-center text-xs text-[#0F766E] dark:text-[#2DD4BF] font-semibold py-1.5 hover:underline"
                  >
                    Register your pharmacy →
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ========================================================================= */}
      {/* 2. HERO SECTION                                                           */}
      {/* ========================================================================= */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
        {/* Soft background ambient gradient */}
        <div className="absolute inset-0 bg-radial from-[#0F766E]/5 via-transparent to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Column: Value Proposition & CTAs */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#E8F7F2] dark:bg-[#064E3B]/50 text-[#1D9E75] dark:text-[#34D399] border border-[#A3E3CD] dark:border-[#065F46]">
                <Shield className="w-3.5 h-3.5" />
                <span>Statutory Health Cryptographic Network &bull; Kenya Edition</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-[#0B2545] dark:text-white tracking-tight leading-[1.15]">
                Blockchain-secured health records for Kenyan clinics, hospitals, and pharmacies
              </h1>

              <p className="text-base sm:text-lg text-[#475569] dark:text-slate-300 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                Connect patient histories seamlessly across healthcare facilities while ensuring records are 100% tamper-evident, encrypted, and compliant with statutory Kenyan medical practice standards.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5 pt-2">
                <Button
                  size="lg"
                  onClick={() => onNavigateLogin('?register=clinic')}
                  className="w-full sm:w-auto bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold text-base px-7 py-3.5 rounded-xl shadow-md transition-all duration-150 flex items-center justify-center gap-2 group"
                >
                  <span>Register your clinic</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => onNavigateLogin()}
                  className="w-full sm:w-auto border-[#CBD5E1] dark:border-[#1E3A5F] bg-white dark:bg-[#112239] text-[#0B2545] dark:text-white hover:bg-slate-100 dark:hover:bg-[#1B314F] font-medium text-base px-6 py-3.5 rounded-xl shadow-xs"
                >
                  Log in to portal
                </Button>
              </div>

              {/* Pharmacy secondary CTA */}
              <div className="flex items-center justify-center lg:justify-start">
                <button
                  onClick={() => onNavigateLogin('?register=pharmacy')}
                  className="inline-flex items-center gap-1.5 text-sm text-[#0F766E] dark:text-[#2DD4BF] font-semibold hover:underline"
                >
                  <Pill className="w-4 h-4" />
                  Are you a pharmacy? Register here →
                </button>
              </div>

              {/* Trust Indicators */}
              <div className="pt-6 grid grid-cols-3 gap-4 border-t border-[#E2E8F0] dark:border-[#1E3A5F] max-w-lg mx-auto lg:mx-0 text-left">
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-[#0B2545] dark:text-white">100%</p>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">Tamper-Proof Audit</p>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-[#0F766E] dark:text-[#2DD4BF]">KMPDC & NCK</p>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">Council Verification</p>
                </div>
                <div>
                  <p className="text-xl sm:text-2xl font-bold text-[#1D9E75] dark:text-[#34D399]">PPB Verified</p>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">Pharmacy Network</p>
                </div>
              </div>

            </div>

            {/* Right Column: Obviously Fake / Synthetic Demo Clinical Record Specimen */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-md bg-white dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl p-6 shadow-xl relative overflow-hidden">
                
                {/* Demo Specimen Watermark Tag */}
                <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#1D9E75]"></span>
                    <span className="text-xs font-bold text-[#0B2545] dark:text-white uppercase tracking-wider">
                      SPECIMEN PREVIEW
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800">
                    Synthetic Demo Data Only
                  </span>
                </div>

                {/* Patient Summary Header */}
                <div className="mt-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-bold text-[#0B2545] dark:text-white">
                      Jane W. Doe <span className="text-xs font-normal text-slate-500">(F, 34)</span>
                    </h2>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">
                      Universal Health ID: <span className="font-mono">KEN-BHC-00429</span>
                    </p>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-[#07182D] rounded-lg border border-[#E2E8F0] dark:border-[#1E3A5F]">
                    <QrCode className="w-7 h-7 text-[#0B2545] dark:text-[#38BDF8]" />
                  </div>
                </div>

                {/* Clinical Note Specimen */}
                <div className="mt-4 p-3.5 bg-slate-50 dark:bg-[#07182D] rounded-xl border border-slate-200 dark:border-[#1E3A5F] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Outpatient Consultation</span>
                    <span className="text-slate-500">Nairobi Demonstration Clinic</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Patient reviewed for acute pharyngitis. Prescribed Amoxicillin 500mg TDS x 5 days. Vital signs stable (BP 120/80, Pulse 72 bpm).
                  </p>
                  <div className="pt-2 border-t border-slate-200 dark:border-[#1E3A5F] flex items-center justify-between text-[11px]">
                    <span className="text-[#0F766E] dark:text-[#2DD4BF] font-medium flex items-center gap-1">
                      <Stethoscope className="w-3 h-3" /> Dr. Alex Mwangi, MD
                    </span>
                    <span className="text-[#1D9E75] font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> KMPDC License #A4109
                    </span>
                  </div>
                </div>

                {/* Cryptographic Proof Strip */}
                <div className="mt-4 p-3 bg-[#E8F7F2]/60 dark:bg-[#064E3B]/30 border border-[#A3E3CD] dark:border-[#065F46] rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#1D9E75] dark:text-[#34D399] flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" /> Cryptographically Sealed on Ledger
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">Block #1,842</span>
                  </div>
                  <p className="text-[10px] font-mono text-slate-600 dark:text-slate-300 truncate">
                    Merkle Root: 0x9f83a1b42c8d7e6f50123456789abcdef...
                  </p>
                </div>

                <div className="mt-3 text-center">
                  <span className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                    Tamper-evident proof validated across independent clinical nodes
                  </span>
                </div>

              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. WHO THIS IS FOR (new)                                                  */}
      {/* ========================================================================= */}
      <section className="py-14 bg-[#0B2545] dark:bg-[#0F243E] border-b border-[#1E3A5F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-[#2DD4BF] mb-10">
            Built for Kenya's healthcare ecosystem
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Hospitals & Clinics */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-4 hover:bg-white/10 transition-colors duration-200 group">
              <div className="w-12 h-12 rounded-xl bg-[#0F766E]/20 text-[#2DD4BF] flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-1">Hospitals & Clinics</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Register your facility, onboard licensed practitioners, issue tamper-proof QR health passports, and maintain a cryptographic audit trail ready for Ministry of Health inspections.
                </p>
              </div>
              <button
                onClick={() => onNavigateLogin('?register=clinic')}
                className="mt-auto text-xs font-semibold text-[#2DD4BF] hover:underline flex items-center gap-1 group-hover:gap-2 transition-all"
              >
                Register your clinic <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Pharmacies */}
            <div className="bg-white/5 border border-[#0F766E]/40 rounded-2xl p-6 flex flex-col gap-4 hover:bg-white/10 transition-colors duration-200 group relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-[#0F766E] text-white text-[10px] font-bold px-3 py-0.5 rounded-full shadow">
                  New — Phase 2
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-[#1D9E75]/20 text-[#34D399] flex items-center justify-center">
                <Pill className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-1">Licensed Pharmacies</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Scan patient prescription QR codes, verify PPB premises licenses, dispense with batch and expiry tracking, and maintain a full dispensation audit trail — all in one compliance-ready portal.
                </p>
              </div>
              <button
                onClick={() => onNavigateLogin('?register=pharmacy')}
                className="mt-auto text-xs font-semibold text-[#2DD4BF] hover:underline flex items-center gap-1 group-hover:gap-2 transition-all"
              >
                Register your pharmacy <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Patients */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col gap-4 hover:bg-white/10 transition-colors duration-200 group">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center">
                <Heart className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white mb-1">Patients</h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Own your complete health history as a portable, cryptographically-sealed QR passport. Share it with any BHC-connected facility without repeating tests or carrying paper records.
                </p>
              </div>
              <button
                onClick={() => onNavigateLogin('?register=patient')}
                className="mt-auto text-xs font-semibold text-[#2DD4BF] hover:underline flex items-center gap-1 group-hover:gap-2 transition-all"
              >
                Create patient account <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. TRUST & SECURITY SECTION                                               */}
      {/* ========================================================================= */}
      <section id="security" className="py-20 bg-white dark:bg-[#0B192C] border-b border-[#E2E8F0] dark:border-[#1E3A5F] transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <Badge className="bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF] border-[#0F766E]/20 text-xs font-semibold px-3 py-1">
              Institutional Security & Compliance
            </Badge>
            <h2 className="text-3xl font-extrabold text-[#0B2545] dark:text-white tracking-tight">
              Enterprise security built for hospital administrators
            </h2>
            <p className="text-base text-[#475569] dark:text-slate-300 leading-relaxed">
              Medical facility directors need absolute certainty that patient records are protected from unauthorized tampering, ransomware, and regulatory liability.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            {/* Pillar 1 */}
            <div className="bg-[#F8FAFC] dark:bg-[#112239] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-xs space-y-3">
              <div className="w-12 h-12 rounded-xl bg-[#E8F7F2] dark:bg-[#064E3B]/40 text-[#1D9E75] flex items-center justify-center">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0B2545] dark:text-white">
                Cryptographic Record Sealing
              </h3>
              <p className="text-xs text-[#475569] dark:text-slate-300 leading-relaxed">
                Every consultation, prescription, and lab entry is permanently sealed the moment it is submitted. Backdating, silent edits, or altered dosage histories are mathematically impossible.
              </p>
            </div>

            {/* Pillar 2 */}
            <div className="bg-[#F8FAFC] dark:bg-[#112239] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-xs space-y-3">
              <div className="w-12 h-12 rounded-xl bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF] flex items-center justify-center">
                <UserCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0B2545] dark:text-white">
                KMPDC & NCK Verification
              </h3>
              <p className="text-xs text-[#475569] dark:text-slate-300 leading-relaxed">
                Doctors and nurses must possess validated regulatory council licenses before writing clinical entries. Unlicensed staff cannot author patient records, shielding your hospital from liability.
              </p>
            </div>

            {/* Pillar 3 */}
            <div className="bg-[#F8FAFC] dark:bg-[#112239] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-xs space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0B2545] dark:text-white">
                Multi-Tenant Data Isolation
              </h3>
              <p className="text-xs text-[#475569] dark:text-slate-300 leading-relaxed">
                Your hospital data is compartmentalized with strict cryptographic boundaries. Other institutions cannot browse your files unless explicitly authorized by verified patient consent.
              </p>
            </div>

            {/* Pillar 4 */}
            <div className="bg-[#F8FAFC] dark:bg-[#112239] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-xs space-y-3">
              <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Server className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-[#0B2545] dark:text-white">
                High-Availability Node Sync
              </h3>
              <p className="text-xs text-[#475569] dark:text-slate-300 leading-relaxed">
                Ledger synchronization safeguards your clinical archive against local hardware failure and ransomware lockouts, ensuring 99.9% clinical care continuity.
              </p>
            </div>

          </div>

          {/* Regulatory Reassurance Callout */}
          <div className="mt-12 bg-slate-50 dark:bg-[#07182D] rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1 text-center md:text-left">
              <h4 className="text-base font-bold text-[#0B2545] dark:text-white">
                Kenya Data Protection Act (2019) & Ministry of Health Compliance
              </h4>
              <p className="text-xs text-[#475569] dark:text-slate-400 max-w-2xl leading-relaxed">
                Designed to adhere to statutory Kenyan personal health information mandates, patient rights to consent, and lawful clinical record retention guidelines.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] text-[#0F766E] dark:text-[#2DD4BF]">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#1D9E75]" />
                Audited &amp; Compliant
              </span>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. FEATURES OVERVIEW SECTION                                              */}
      {/* ========================================================================= */}
      <section id="features" className="py-20 bg-[#F8FAFC] dark:bg-[#07182D] border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <Badge className="bg-[#0B2545]/10 dark:bg-white/10 text-[#0B2545] dark:text-white border-[#0B2545]/20 text-xs font-semibold px-3 py-1">
              Core Capabilities
            </Badge>
            <h2 className="text-3xl font-extrabold text-[#0B2545] dark:text-white tracking-tight">
              A comprehensive clinical suite for modern healthcare
            </h2>
            <p className="text-base text-[#475569] dark:text-slate-300 leading-relaxed">
              Everything your clinic or hospital needs to streamline patient registration, document clinical care, and verify credentials across facilities.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Feature 1 */}
            <div className="bg-white dark:bg-[#112239] p-8 rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF] flex items-center justify-center">
                  <QrCode className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-[#0B2545] dark:text-white">
                  Universal Health Passport (QR-Enabled)
                </h3>
                <p className="text-sm text-[#475569] dark:text-slate-300 leading-relaxed">
                  Patients carry an encrypted QR health passport on their smartphone or printed card. When visiting another clinic, the attending doctor scans the passport to instantly view critical allergy notes, blood group, and authenticated consultation history.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#E2E8F0] dark:border-[#1E3A5F] flex items-center text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF]">
                <span>Zero duplicate tests &bull; Instant cross-facility continuity</span>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-white dark:bg-[#112239] p-8 rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-[#1D9E75]/10 text-[#1D9E75] flex items-center justify-center">
                  <UserCheck className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-[#0B2545] dark:text-white">
                  Verified Practitioner Registry
                </h3>
                <p className="text-sm text-[#475569] dark:text-slate-300 leading-relaxed">
                  Automated validation against the Kenya Medical Practitioners and Dentists Council (KMPDC) and Nursing Council of Kenya (NCK) official registries. Maintain an indisputable roster of licensed doctors, clinical officers, and nurses.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#E2E8F0] dark:border-[#1E3A5F] flex items-center text-xs font-semibold text-[#1D9E75] dark:text-[#34D399]">
                <span>Automated license checking &bull; Anti-quack protection</span>
              </div>
            </div>

            {/* Feature 3: Pharmacy Dispensing Portal */}
            <div className="bg-white dark:bg-[#112239] p-8 rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                    <Pill className="w-6 h-6" />
                  </div>
                  <span className="text-[10px] font-bold bg-[#0F766E] text-white px-2 py-0.5 rounded-full">New</span>
                </div>
                <h3 className="text-xl font-bold text-[#0B2545] dark:text-white">
                  Pharmacy Dispensing Portal
                </h3>
                <p className="text-sm text-[#475569] dark:text-slate-300 leading-relaxed">
                  Pharmacists scan prescription QR tokens for full posology disclosure, dispense with batch number and expiry date tracking, and maintain a complete dispensation audit trail with rival-fill collision prevention.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#E2E8F0] dark:border-[#1E3A5F] flex items-center text-xs font-semibold text-teal-600 dark:text-teal-400">
                <span>PPB premises verification &bull; 14-day pharmacy trial</span>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-white dark:bg-[#112239] p-8 rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <FileCheck className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-[#0B2545] dark:text-white">
                  Automated Licensing &amp; Compliance Audit
                </h3>
                <p className="text-sm text-[#475569] dark:text-slate-300 leading-relaxed">
                  Real-time visibility into your facility's license tenure, automated renewal receipts powered by Paystack, and exportable audit reports ready for health ministry quality inspections.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#E2E8F0] dark:border-[#1E3A5F] flex items-center text-xs font-semibold text-amber-600 dark:text-amber-400">
                <span>Self-serve renewals &bull; Comprehensive inspection readiness</span>
              </div>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. SOCIAL PROOF BANNER (new)                                              */}
      {/* ========================================================================= */}
      <section className="py-14 bg-white dark:bg-[#0B192C] border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Live facility count strip */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 mb-12 text-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF] flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-extrabold text-[#0B2545] dark:text-white">
                  {facilityCount !== null ? facilityCount : '—'}
                </p>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">Active facilities on network</p>
              </div>
            </div>
            <div className="hidden sm:block w-px h-10 bg-[#E2E8F0] dark:bg-[#1E3A5F]" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1D9E75]/10 text-[#1D9E75] flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-extrabold text-[#0B2545] dark:text-white">100%</p>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">Tamper-proof record integrity</p>
              </div>
            </div>
            <div className="hidden sm:block w-px h-10 bg-[#E2E8F0] dark:bg-[#1E3A5F]" />
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-xl font-extrabold text-[#0B2545] dark:text-white">KMPDC + NCK + PPB</p>
                <p className="text-xs text-[#64748B] dark:text-[#94A3B8]">Statutory registries integrated</p>
              </div>
            </div>
          </div>

          {/* Testimonial placeholder */}
          <div className="max-w-2xl mx-auto bg-[#F8FAFC] dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl p-8 relative">
            <div className="absolute top-4 right-4">
              <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                Beta Participant
              </span>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-[#0B2545] dark:bg-[#1E3A5F] text-white flex items-center justify-center font-bold text-sm shrink-0">
                KH
              </div>
              <div>
                <p className="text-sm text-[#475569] dark:text-slate-300 leading-relaxed italic">
                  "The KMPDC verification at registration alone was enough to justify signing up. We had a case of forged credentials three years ago — now that can't happen. The QR passport has also cut our referral intake time significantly."
                </p>
                <div className="mt-3">
                  <p className="text-xs font-bold text-[#0B2545] dark:text-white">Dr. K.H., Medical Director</p>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Nairobi-based private clinic &bull; Beta Participant</p>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. PRICING SECTION — Netflix-style tiered                                 */}
      {/* ========================================================================= */}
      <section id="pricing" className="py-20 bg-white dark:bg-[#0B192C] border-b border-[#E2E8F0] dark:border-[#1E3A5F] transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <Badge className="bg-[#1D9E75]/10 text-[#1D9E75] dark:text-[#34D399] border-[#1D9E75]/20 text-xs font-semibold px-3 py-1">
              Transparent Pricing &bull; Paystack Secured
            </Badge>
            <h2 className="text-3xl font-extrabold text-[#0B2545] dark:text-white tracking-tight">
              Choose the right plan for your facility
            </h2>
            <p className="text-base text-[#475569] dark:text-slate-300 leading-relaxed">
              All plans billed monthly. Every new clinic registration receives a <strong>7-day free trial</strong>. No hidden fees.
            </p>
          </div>

          {/* ── 3-Tier Clinic Plan Cards ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">

            {/* ── STARTER ── */}
            <div className="relative flex flex-col rounded-2xl p-8 bg-[#F8FAFC] dark:bg-[#0F243E] border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-xs">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#64748B] dark:text-slate-400 mb-1">Starter</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-extrabold text-[#0B2545] dark:text-white">KES 15,000</span>
                  <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">/month</span>
                </div>
                <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">Best for small private clinics & solo practitioners</p>

                <div className="mt-6 pt-5 border-t border-[#E2E8F0] dark:border-[#1E3A5F] space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B2545] dark:text-slate-300 mb-3">Up to 5 practitioners</p>
                  {[
                    { label: 'Tamper-evident patient records', included: true },
                    { label: 'Universal Health Passport (QR)', included: true },
                    { label: 'KMPDC & NCK auto-verification', included: true },
                    { label: 'Digital prescription writing', included: true },
                    { label: 'Basic ledger audit log', included: true },
                    { label: 'QR prescription token (pharmacy)', included: false },
                    { label: 'Cross-facility referral attestation', included: false, soon: false },
                    { label: 'Automated compliance reports', included: false },
                    { label: 'Emergency break-glass access', included: false },
                    { label: 'Custom EHR / HMIS bridge', included: false },
                    { label: 'Dedicated node sync', included: false },
                    { label: '24/7 incident hotline', included: false },
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-1.5 text-xs">
                      {f.included
                        ? <CheckCircle2 className="w-4 h-4 text-[#1D9E75] shrink-0" />
                        : <X className="w-4 h-4 text-[#CBD5E1] dark:text-[#334155] shrink-0" />
                      }
                      <span className={f.included ? 'text-[#475569] dark:text-slate-300' : 'text-[#94A3B8] dark:text-slate-500'}>
                        {f.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-8 pt-4">
                <Button
                  onClick={() => onNavigateLogin('?register=clinic&plan=plan_starter')}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-[#0B2545] hover:bg-[#112239] text-white"
                >
                  Get Started
                </Button>
                <p className="text-[11px] text-center text-slate-400 mt-2">7-day free trial included</p>
              </div>
            </div>

            {/* ── PROFESSIONAL (highlighted) ── */}
            <div className="relative flex flex-col rounded-2xl p-8 bg-white dark:bg-[#112239] border-2 border-[#0F766E] dark:border-[#2DD4BF] shadow-lg lg:-translate-y-3">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="bg-[#0F766E] text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-md">
                  Most Popular
                </span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#0F766E] dark:text-[#2DD4BF] mb-1">Professional</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-extrabold text-[#0B2545] dark:text-white">KES 30,000</span>
                  <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">/month</span>
                </div>
                <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">Best for mid-size clinics & specialist centres</p>

                <div className="mt-6 pt-5 border-t border-[#E2E8F0] dark:border-[#1E3A5F] space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B2545] dark:text-slate-300 mb-3">Up to 30 practitioners</p>
                  {[
                    { label: 'Tamper-evident patient records', included: true },
                    { label: 'Universal Health Passport (QR)', included: true },
                    { label: 'KMPDC & NCK auto-verification', included: true },
                    { label: 'Digital prescription writing', included: true },
                    { label: 'Basic ledger audit log', included: true },
                    { label: 'QR prescription token (pharmacy)', included: true },
                    { label: 'Cross-facility referral attestation', included: false, soon: true },
                    { label: 'Automated compliance reports', included: true },
                    { label: 'Emergency break-glass access', included: false },
                    { label: 'Custom EHR / HMIS bridge', included: false },
                    { label: 'Dedicated node sync', included: false },
                    { label: '24/7 incident hotline', included: false },
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-1.5 text-xs">
                      {f.included
                        ? <CheckCircle2 className="w-4 h-4 text-[#1D9E75] shrink-0" />
                        : <X className="w-4 h-4 text-[#CBD5E1] dark:text-[#334155] shrink-0" />
                      }
                      <span className={f.included ? 'text-[#475569] dark:text-slate-300' : 'text-[#94A3B8] dark:text-slate-500'}>
                        {f.label}
                      </span>
                      {f.soon && (
                        <span className="ml-1 text-[9px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                          Soon
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-8 pt-4">
                <Button
                  onClick={() => onNavigateLogin('?register=clinic&plan=plan_professional')}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-[#0F766E] hover:bg-[#115E59] text-white shadow-sm"
                >
                  Get Started
                </Button>
                <p className="text-[11px] text-center text-slate-400 mt-2">7-day free trial included</p>
              </div>
            </div>

            {/* ── ENTERPRISE ── */}
            <div className="relative flex flex-col rounded-2xl p-8 bg-[#F8FAFC] dark:bg-[#0F243E] border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-xs">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-[#64748B] dark:text-slate-400 mb-1">Enterprise</p>
                <div className="flex items-baseline gap-1 mt-2">
                  <span className="text-4xl font-extrabold text-[#0B2545] dark:text-white">KES 60,000</span>
                  <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">/month</span>
                </div>
                <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">Best for hospitals, county networks & multi-department facilities</p>

                <div className="mt-6 pt-5 border-t border-[#E2E8F0] dark:border-[#1E3A5F] space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B2545] dark:text-slate-300 mb-3">Unlimited practitioners</p>
                  {[
                    { label: 'Tamper-evident patient records', included: true },
                    { label: 'Universal Health Passport (QR)', included: true },
                    { label: 'KMPDC & NCK auto-verification', included: true },
                    { label: 'Digital prescription writing', included: true },
                    { label: 'Basic ledger audit log', included: true },
                    { label: 'QR prescription token (pharmacy)', included: true },
                    { label: 'Cross-facility referral attestation', included: false, soon: true },
                    { label: 'Automated compliance reports', included: true },
                    { label: 'Emergency break-glass access', included: true },
                    { label: 'Custom EHR / HMIS bridge', included: true },
                    { label: 'Dedicated node sync', included: true },
                    { label: '24/7 incident hotline', included: true },
                  ].map((f, i) => (
                    <div key={i} className="flex items-center gap-2.5 py-1.5 text-xs">
                      {f.included
                        ? <CheckCircle2 className="w-4 h-4 text-[#1D9E75] shrink-0" />
                        : <X className="w-4 h-4 text-[#CBD5E1] dark:text-[#334155] shrink-0" />
                      }
                      <span className={f.included ? 'text-[#475569] dark:text-slate-300' : 'text-[#94A3B8] dark:text-slate-500'}>
                        {f.label}
                      </span>
                      {f.soon && (
                        <span className="ml-1 text-[9px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 whitespace-nowrap">
                          Soon
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-8 pt-4">
                <Button
                  onClick={() => onNavigateLogin('?register=clinic&plan=plan_enterprise')}
                  className="w-full py-3 rounded-xl font-semibold text-sm bg-[#0B2545] hover:bg-[#112239] text-white"
                >
                  Get Started
                </Button>
                <p className="text-[11px] text-center text-slate-400 mt-2">7-day free trial included</p>
              </div>
            </div>

          </div>

          {/* Billing note */}
          <p className="mt-6 text-center text-xs text-[#94A3B8] dark:text-slate-500">
            All plans billed monthly via M-Pesa or card &bull; Paystack encrypted &bull; Cancel anytime
          </p>

          {/* ── Pharmacy Plan ── */}
          <div id="pharmacy-pricing" className="mt-20">
            <div className="text-center mb-8 space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF] border border-[#0F766E]/20">
                <Pill className="w-3.5 h-3.5" /> Pharmacy Dispensary Portal
              </div>
              <h3 className="text-2xl font-extrabold text-[#0B2545] dark:text-white">Simple, flat pricing for licensed pharmacies</h3>
              <p className="text-sm text-[#475569] dark:text-slate-300">One plan. Everything included. 14-day trial for new pharmacies.</p>
            </div>

            <div className="max-w-lg mx-auto bg-white dark:bg-[#112239] border-2 border-[#0F766E] dark:border-[#2DD4BF] rounded-2xl p-8 shadow-lg">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h4 className="text-xl font-bold text-[#0B2545] dark:text-white">Pharmacy Monthly Subscription</h4>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">Full dispensary compliance portal with PPB license verification</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF] flex items-center justify-center shrink-0">
                  <Pill className="w-6 h-6" />
                </div>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-[#0B2545] dark:text-white">KES 4,500</span>
                  <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">/ month</span>
                </div>
                <span className="text-[11px] text-[#0F766E] dark:text-[#2DD4BF] font-medium">
                  Billed via M-Pesa or Card &bull; Paystack Encrypted
                </span>
              </div>

              <ul className="space-y-2.5 mb-8 pt-4 border-t border-[#E2E8F0] dark:border-[#1E3A5F]">
                {[
                  'PPB premises license verification & registration',
                  'Prescription QR token scanning & full posology disclosure',
                  'Batch number & expiry date dispensation tracking',
                  'Rival-fill collision prevention (duplicate dispensing blocked)',
                  'Multi-tenant isolation — your dispensations are private',
                  'Full dispensation audit trail & compliance read-only mode',
                  '14-day free trial upon Super Admin approval'
                ].map((f, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-[#475569] dark:text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-[#1D9E75] shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                onClick={() => onNavigateLogin('?register=pharmacy')}
                className="w-full py-3 rounded-xl font-semibold text-sm bg-[#0F766E] hover:bg-[#115E59] text-white shadow-sm"
              >
                Register your Pharmacy — Start Free Trial
              </Button>
              <p className="text-[11px] text-center text-slate-400 mt-2">
                14-day trial &bull; No card required until activation
              </p>
            </div>
          </div>

          {/* Enterprise contact note */}
          <div className="mt-12 text-center text-xs text-[#64748B] dark:text-[#94A3B8] max-w-xl mx-auto">
            Need a county-wide deployment or a custom HMIS integration contract? Contact our healthcare solutions desk for tailored institutional agreements.
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* 6. HOW IT WORKS SECTION                                                   */}
      {/* ========================================================================= */}
      <section id="how-it-works" className="py-20 bg-[#F8FAFC] dark:bg-[#07182D] border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-3">
            <Badge className="bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF] border-[#0F766E]/20 text-xs font-semibold px-3 py-1">
              Onboarding Process
            </Badge>
            <h2 className="text-3xl font-extrabold text-[#0B2545] dark:text-white tracking-tight">
              Get your healthcare facility live in 4 steps
            </h2>
            <p className="text-base text-[#475569] dark:text-slate-300 leading-relaxed">
              Whether you're a hospital, clinic, or licensed pharmacy — we uphold strict medical compliance without imposing bureaucratic complexity on your team.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            
            {/* Step 1 */}
            <div className="bg-white dark:bg-[#112239] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-xs space-y-3 relative">
              <div className="w-10 h-10 rounded-xl bg-[#0B2545] text-white flex items-center justify-center font-bold text-sm">
                1
              </div>
              <h3 className="text-base font-bold text-[#0B2545] dark:text-white">
                Register Your Facility
              </h3>
              <p className="text-xs text-[#475569] dark:text-slate-300 leading-relaxed">
                Submit your facility name, administrator contact, and regulatory credentials — clinic registration number or PPB premises license for pharmacies — in under 2 minutes.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white dark:bg-[#112239] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-xs space-y-3 relative">
              <div className="w-10 h-10 rounded-xl bg-[#0F766E] text-white flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h3 className="text-base font-bold text-[#0B2545] dark:text-white">
                Review & Node Setup
              </h3>
              <p className="text-xs text-[#475569] dark:text-slate-300 leading-relaxed">
                Platform Super Administrators verify medical licensing and provision your isolated cryptographic ledger node and organization keys.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white dark:bg-[#112239] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-xs space-y-3 relative">
              <div className="w-10 h-10 rounded-xl bg-[#1D9E75] text-white flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h3 className="text-base font-bold text-[#0B2545] dark:text-white">
                Onboard Your Team
              </h3>
              <p className="text-xs text-[#475569] dark:text-slate-300 leading-relaxed">
                Doctors and nurses register with automatic KMPDC / NCK council verification. Pharmacists join with PPB premises credentials linked to your facility.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-white dark:bg-[#112239] p-6 rounded-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] shadow-xs space-y-3 relative">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                4
              </div>
              <h3 className="text-base font-bold text-[#0B2545] dark:text-white">
                Deliver Compliant Care
              </h3>
              <p className="text-xs text-[#475569] dark:text-slate-300 leading-relaxed">
                Issue QR health passports, record encrypted visits, dispense prescriptions with full audit trails, and verify complete patient histories with zero fear of falsification.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* 7. CTA & FOOTER SECTION                                                   */}
      {/* ========================================================================= */}
      <footer id="contact" className="bg-white dark:bg-[#0B192C] transition-colors duration-200">
        
        {/* Registration Call to Action Banner */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
          <div className="bg-[#0B2545] dark:bg-[#0F243E] rounded-3xl p-8 sm:p-12 text-white relative overflow-hidden shadow-xl">
            <div className="relative z-10 max-w-2xl space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#1D9E75]/20 text-[#34D399] border border-[#1D9E75]/40">
                <Sparkles className="w-3.5 h-3.5" /> Clinics: 7-day Trial &bull; Pharmacies: 14-day Trial
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Ready to secure your facility's health records?
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                Join forward-thinking Kenyan healthcare institutions. Protect your facility against record falsification and deliver seamless, connected patient care.
              </p>
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <Button
                  size="lg"
                  onClick={() => onNavigateLogin('?register=clinic')}
                  className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold text-sm px-6 py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
                >
                  <Building2 className="w-4 h-4" />
                  <span>Register your Clinic</span>
                </Button>
                <Button
                  size="lg"
                  onClick={() => onNavigateLogin('?register=pharmacy')}
                  className="bg-[#1D9E75] hover:bg-[#16a37a] text-white font-semibold text-sm px-6 py-3 rounded-xl shadow-md flex items-center justify-center gap-2"
                >
                  <Pill className="w-4 h-4" />
                  <span>Register your Pharmacy</span>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => onNavigateLogin()}
                  className="bg-transparent border-white/30 hover:bg-white/10 text-white font-medium text-sm px-6 py-3 rounded-xl"
                >
                  Sign In
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Contact & Legal Details */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 border-t border-[#E2E8F0] dark:border-[#1E3A5F]">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            
            {/* Col 1: Brand & Mission */}
            <div className="md:col-span-1 space-y-3">
              <div className="flex items-center gap-2.5">
                <img src={logoSvg} alt="Logo" className="w-7 h-7 rounded-lg" />
                <span className="font-extrabold text-sm text-[#0B2545] dark:text-white">
                  BLOCK HEALTH CHAIN
                </span>
              </div>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
                Decentralized, tamper-evident health records infrastructure connecting healthcare facilities and pharmacies across the Republic of Kenya.
              </p>
              <p className="text-[11px] text-[#1D9E75] font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Verified Kenyan Healthcare Node
              </p>
            </div>

            {/* Col 2: Navigation Links */}
            <div className="space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0B2545] dark:text-white">
                Platform
              </p>
              <ul className="space-y-2 text-xs text-[#64748B] dark:text-slate-300">
                <li>
                  <button onClick={() => scrollToSection('features')} className="hover:text-[#0F766E]">
                    Universal Health Passport
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('security')} className="hover:text-[#0F766E]">
                    KMPDC / NCK Verification
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('pharmacy-pricing')} className="hover:text-[#0F766E]">
                    Pharmacy Dispensing Portal
                  </button>
                </li>
                <li>
                  <button onClick={() => scrollToSection('pricing')} className="hover:text-[#0F766E]">
                    Clinic Subscription Plans
                  </button>
                </li>
                <li>
                  <button onClick={() => onNavigateLogin('?register=doctor')} className="hover:text-[#0F766E]">
                    Practitioner Registration
                  </button>
                </li>
              </ul>
            </div>

            {/* Col 3: Contact Details */}
            <div className="space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0B2545] dark:text-white">
                Health Informatics Desk
              </p>
              <ul className="space-y-2 text-xs text-[#64748B] dark:text-slate-300">
                <li className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                  <span>Upper Hill Medical District, Nairobi, Kenya</span>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                  <span>support@blockhealthchain.ke</span>
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                  <a href="tel:0706296617" className="hover:text-[#0F766E] transition-colors">
                    0706296617 / WhatsApp Desk
                  </a>
                </li>
              </ul>
            </div>

            {/* Col 4: Regulatory & Compliance */}
            <div className="space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0B2545] dark:text-white">
                Regulatory Standards
              </p>
              <p className="text-xs text-[#64748B] dark:text-slate-400 leading-relaxed">
                Operating under Kenya Data Protection Act 2019 provisions for sensitive health information, KMPDC practitioner attestation guidelines, PPB premises licensing requirements, and the National Health Informatics Framework.
              </p>
            </div>

          </div>

          <div className="mt-8 pt-6 border-t border-[#E2E8F0] dark:border-[#1E3A5F] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#64748B] dark:text-[#94A3B8]">
            <p>&copy; {new Date().getFullYear()} Block Health Chain. All rights reserved.</p>
            <p className="text-[11px] text-[#94A3B8]">
              Built for Kenya's healthcare ecosystem &bull; Clinics, Hospitals & Licensed Pharmacies
            </p>
          </div>

        </div>

      </footer>

    </div>
  );
}
