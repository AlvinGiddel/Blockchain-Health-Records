import React, { useState, useEffect, useRef } from 'react';
import {
  Shield, CheckCircle2, QrCode, UserCheck, Building2,
  ArrowRight, Sparkles, Heart, Phone, Mail, MapPin,
  Menu, X, Pill, Users, TrendingUp, Star, Zap
} from 'lucide-react';
import logoSvg from '../assets/logo.svg';
import dashboardMockup from '../assets/dashboard_mockup.jpg';
import { ThemeToggle } from './ui/theme-toggle';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { safeFetch } from '../utils/api';

/* ── Scroll-reveal wrapper ──────────────────────────────────────────── */
function Reveal({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { setVisible(entry.isIntersecting); },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-all duration-[400ms] ease-out ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */
export default function LandingPage({ onNavigateLogin, onGoToDashboard, isLoggedIn }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [facilityCount, setFacilityCount] = useState(null);

  useEffect(() => {
    let active = true;
    safeFetch('/api/organizations/active')
      .then(d => { if (active && Array.isArray(d)) setFacilityCount(d.length); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const scroll = (id) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fmt = (n) => `KES ${n.toLocaleString('en-KE')}`;

  const tiers = [
    {
      id: 'plan_starter', name: 'Starter', price: 15000, popular: false,
      best: 'Small private clinics & solo practitioners',
      practitioners: 'Up to 5 practitioners',
      features: [
        { label: 'Tamper-evident patient records', on: true },
        { label: 'Universal Health Passport (QR)', on: true },
        { label: 'KMPDC & NCK auto-verification', on: true },
        { label: 'Digital prescription writing', on: true },
        { label: 'Basic ledger audit log', on: true },
        { label: 'QR prescription token (pharmacy)', on: false },
        { label: 'Cross-facility referral attestation', on: false },
        { label: 'Automated compliance reports', on: false },
        { label: 'Emergency break-glass access', on: false },
        { label: 'Custom EHR / HMIS bridge', on: false },
        { label: 'Dedicated node sync', on: false },
        { label: '24/7 incident hotline', on: false },
      ],
    },
    {
      id: 'plan_professional', name: 'Professional', price: 30000, popular: true,
      best: 'Mid-size clinics & specialist centres',
      practitioners: 'Up to 30 practitioners',
      features: [
        { label: 'Tamper-evident patient records', on: true },
        { label: 'Universal Health Passport (QR)', on: true },
        { label: 'KMPDC & NCK auto-verification', on: true },
        { label: 'Digital prescription writing', on: true },
        { label: 'Basic ledger audit log', on: true },
        { label: 'QR prescription token (pharmacy)', on: true },
        { label: 'Cross-facility referral attestation', on: false, soon: true },
        { label: 'Automated compliance reports', on: true },
        { label: 'Emergency break-glass access', on: false },
        { label: 'Custom EHR / HMIS bridge', on: false },
        { label: 'Dedicated node sync', on: false },
        { label: '24/7 incident hotline', on: false },
      ],
    },
    {
      id: 'plan_enterprise', name: 'Enterprise', price: 60000, popular: false,
      best: 'Hospitals, county networks & multi-department facilities',
      practitioners: 'Unlimited practitioners',
      features: [
        { label: 'Tamper-evident patient records', on: true },
        { label: 'Universal Health Passport (QR)', on: true },
        { label: 'KMPDC & NCK auto-verification', on: true },
        { label: 'Digital prescription writing', on: true },
        { label: 'Basic ledger audit log', on: true },
        { label: 'QR prescription token (pharmacy)', on: true },
        { label: 'Cross-facility referral attestation', on: false, soon: true },
        { label: 'Automated compliance reports', on: true },
        { label: 'Emergency break-glass access', on: true },
        { label: 'Custom EHR / HMIS bridge', on: true },
        { label: 'Dedicated node sync', on: true },
        { label: '24/7 incident hotline', on: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-[#0B192C] text-[#0B2545] dark:text-white font-sans antialiased">

      {/* ============================================================== */}
      {/* NAV                                                             */}
      {/* ============================================================== */}
      <header className="sticky top-0 z-50 bg-white/90 dark:bg-[#0B192C]/90 backdrop-blur-md border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
          <button onClick={() => scroll('hero')} className="flex items-center gap-2 shrink-0">
            <img src={logoSvg} alt="Block Health Chain" className="h-8 w-8" />
            <span className="font-extrabold text-base tracking-tight text-[#0B2545] dark:text-white hidden sm:block">
              Block Health Chain
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#475569] dark:text-slate-300">
            {[
              { label: 'Features', id: 'features' },
              { label: 'Pricing', id: 'pricing' },
            ].map(({ label, id }) => (
              <button key={id} onClick={() => scroll(id)} className="hover:text-[#0F766E] dark:hover:text-[#2DD4BF] transition-colors">
                {label}
              </button>
            ))}
            <button onClick={() => scroll('pharmacy-pricing')} className="flex items-center gap-1 hover:text-[#0F766E] dark:hover:text-[#2DD4BF] transition-colors">
              <Pill className="w-3 h-3" /> Pharmacy
            </button>
            <button onClick={() => scroll('contact')} className="hover:text-[#0F766E] dark:hover:text-[#2DD4BF] transition-colors">
              Contact
            </button>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            {isLoggedIn ? (
              <Button onClick={onGoToDashboard} className="bg-[#0F766E] hover:bg-[#115E59] text-white text-sm font-semibold px-4 py-2 rounded-lg">
                Go to Dashboard
              </Button>
            ) : (
              <>
                <button onClick={() => onNavigateLogin()} className="text-sm font-medium text-[#475569] dark:text-slate-300 hover:text-[#0F766E]">
                  Sign in
                </button>
                <Button onClick={() => onNavigateLogin('?register=clinic')} className="bg-[#0F766E] hover:bg-[#115E59] text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm">
                  Register Facility
                </Button>
              </>
            )}
          </div>

          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <button onClick={() => setMobileMenuOpen(v => !v)} className="p-2 rounded-lg text-[#475569] dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#1E3A5F]">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#E2E8F0] dark:border-[#1E3A5F] bg-white dark:bg-[#0B192C] px-4 py-4 space-y-1">
            {['features', 'pricing', 'contact'].map(id => (
              <button key={id} onClick={() => scroll(id)} className="block w-full text-left px-3 py-2.5 text-sm font-medium text-[#475569] dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#112239] rounded-lg capitalize">
                {id}
              </button>
            ))}
            <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E3A5F] space-y-2">
              <Button variant="outline" onClick={() => { setMobileMenuOpen(false); onNavigateLogin(); }} className="w-full justify-center border-[#CBD5E1] dark:border-[#1E3A5F]">Sign in</Button>
              <Button onClick={() => { setMobileMenuOpen(false); onNavigateLogin('?register=clinic'); }} className="w-full bg-[#0F766E] text-white justify-center">Register Facility</Button>
              <button onClick={() => { setMobileMenuOpen(false); onNavigateLogin('?register=pharmacy'); }} className="w-full text-center text-xs font-semibold text-[#0F766E] py-1.5 hover:underline">
                Register your pharmacy →
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ============================================================== */}
      {/* HERO — Split layout                                             */}
      {/* ============================================================== */}
      <section id="hero" className="relative overflow-hidden bg-white dark:bg-[#0B192C] pt-16 pb-24 lg:pt-24 lg:pb-32">
        <div
          className="absolute inset-0 opacity-[0.035] dark:opacity-[0.055] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle, #0F766E 1px, transparent 1px)', backgroundSize: '28px 28px' }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

            {/* Left: Copy */}
            <div className="space-y-8 text-center lg:text-left">
              <Reveal>
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF] border border-[#0F766E]/20">
                  <Zap className="w-3.5 h-3.5" /> Kenya's Blockchain Health Records Platform
                </span>
              </Reveal>

              <Reveal delay={80}>
                <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold tracking-tight leading-[1.12] text-[#0B2545] dark:text-white">
                  Secure health records{' '}
                  <span className="text-[#0F766E] dark:text-[#2DD4BF]">every Kenyan</span>{' '}
                  clinic deserves
                </h1>
              </Reveal>

              <Reveal delay={150}>
                <p className="text-lg text-[#475569] dark:text-slate-300 max-w-xl mx-auto lg:mx-0 leading-relaxed">
                  Tamper-proof electronic health records, KMPDC-verified practitioners, QR health passports, and a pharmacy dispensing portal — built for Kenya's healthcare ecosystem.
                </p>
              </Reveal>

              <Reveal delay={220}>
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
                  <Button
                    size="lg"
                    onClick={() => onNavigateLogin('?register=clinic')}
                    className="w-full sm:w-auto bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold px-7 py-3.5 rounded-xl shadow-md flex items-center justify-center gap-2 group text-base"
                  >
                    Register your clinic
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => onNavigateLogin()}
                    className="w-full sm:w-auto border-[#CBD5E1] dark:border-[#1E3A5F] text-[#0B2545] dark:text-white hover:bg-slate-50 dark:hover:bg-[#112239] px-6 py-3.5 rounded-xl text-base"
                  >
                    Sign in to portal
                  </Button>
                </div>
                <button
                  onClick={() => onNavigateLogin('?register=pharmacy')}
                  className="flex items-center justify-center lg:justify-start gap-1.5 text-sm text-[#0F766E] dark:text-[#2DD4BF] font-semibold hover:underline pt-1"
                >
                  <Pill className="w-4 h-4" /> Are you a pharmacy? Register here →
                </button>
              </Reveal>

              <Reveal delay={300}>
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-2">
                  {[
                    { label: 'KMPDC', sub: 'Practitioner Verified' },
                    { label: 'NCK', sub: 'Nurse Verified' },
                    { label: 'PPB', sub: 'Pharmacy Verified' },
                    { label: 'KDPA 2019', sub: 'Compliant' },
                  ].map(b => (
                    <div key={b.label} className="flex items-center gap-2 bg-[#F8FAFC] dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-lg px-3 py-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#1D9E75] shrink-0" />
                      <div>
                        <p className="text-[10px] font-bold text-[#0B2545] dark:text-white leading-none">{b.label}</p>
                        <p className="text-[9px] text-[#64748B] dark:text-slate-400 leading-none mt-0.5">{b.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>

            {/* Right: Product mockup */}
            <Reveal delay={200} className="hidden lg:block">
              <div className="relative">
                <div className="absolute -inset-6 bg-[#0F766E]/10 dark:bg-[#0F766E]/15 rounded-3xl blur-2xl pointer-events-none" />
                <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-[#E2E8F0] dark:border-[#1E3A5F] ring-1 ring-black/5">
                  <img src={dashboardMockup} alt="Block Health Chain dashboard — patient health records" className="w-full object-cover" />
                </div>
                <div className="absolute -bottom-4 -left-4 bg-white dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#0B2545] dark:text-white">Blockchain-sealed</p>
                    <p className="text-[10px] text-[#64748B] dark:text-slate-400">Every record cryptographically signed</p>
                  </div>
                </div>
                <div className="absolute -top-4 -right-4 bg-white dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-xl px-4 py-2.5 shadow-lg flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#1D9E75]/10 text-[#1D9E75] flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-[#0B2545] dark:text-white">KMPDC Verified</p>
                    <p className="text-[10px] text-[#64748B] dark:text-slate-400">All practitioners authenticated</p>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* STATS STRIP                                                     */}
      {/* ============================================================== */}
      <section className="border-y border-[#E2E8F0] dark:border-[#1E3A5F] bg-[#F8FAFC] dark:bg-[#07182D] py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: facilityCount !== null ? facilityCount : '—', label: 'Active facilities' },
              { value: '100%', label: 'Tamper-proof integrity' },
              { value: 'KMPDC + NCK + PPB', label: 'Statutory registries' },
              { value: '7-day', label: 'Clinic free trial' },
            ].map((s, i) => (
              <Reveal key={i} delay={i * 60}>
                <p className="text-2xl font-extrabold text-[#0F766E] dark:text-[#2DD4BF]">{s.value}</p>
                <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">{s.label}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* WHO THIS IS FOR                                                 */}
      {/* ============================================================== */}
      <section className="py-20 bg-white dark:bg-[#0B192C]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-[#0F766E] dark:text-[#2DD4BF] mb-3">Built for Kenya's healthcare ecosystem</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0B2545] dark:text-white">
              One platform, three segments
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { icon: <Building2 className="w-6 h-6" />, colorClass: 'bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF] border-[#0F766E]/15', title: 'Hospitals & Clinics', desc: 'Register your facility, onboard KMPDC-verified practitioners, issue QR health passports, and maintain a cryptographic audit trail ready for Ministry of Health inspections.', cta: 'Register your clinic →', action: () => onNavigateLogin('?register=clinic') },
              { icon: <Pill className="w-6 h-6" />, colorClass: 'bg-[#1D9E75]/10 text-[#1D9E75] border-[#1D9E75]/15', badge: 'New — Phase 2', title: 'Licensed Pharmacies', desc: 'Scan prescription QR tokens for full posology disclosure, track batch numbers and expiry dates, and maintain a complete PPB-compliant dispensation audit trail.', cta: 'Register your pharmacy →', action: () => onNavigateLogin('?register=pharmacy') },
              { icon: <Heart className="w-6 h-6" />, colorClass: 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900', title: 'Patients', desc: 'Own your complete health history as a portable, cryptographically-sealed QR passport. Share it with any BHC-connected facility — no paper, no repeating tests.', cta: 'Create patient account →', action: () => onNavigateLogin('?register=patient') },
            ].map((card, i) => (
              <Reveal key={i} delay={i * 80}>
                <div className="relative group h-full bg-[#F8FAFC] dark:bg-[#0F243E] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl p-7 flex flex-col gap-5 hover:shadow-md hover:-translate-y-1 transition-all duration-200 cursor-pointer" onClick={card.action}>
                  {card.badge && <span className="absolute top-4 right-4 text-[9px] font-bold bg-[#0F766E] text-white px-2 py-0.5 rounded-full">{card.badge}</span>}
                  <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${card.colorClass}`}>{card.icon}</div>
                  <div>
                    <h3 className="text-base font-bold text-[#0B2545] dark:text-white mb-2">{card.title}</h3>
                    <p className="text-xs text-[#475569] dark:text-slate-300 leading-relaxed">{card.desc}</p>
                  </div>
                  <span className="mt-auto text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] group-hover:underline">{card.cta}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* FEATURES — 3 alternating spotlights                            */}
      {/* ============================================================== */}
      <section id="features" className="py-20 bg-[#F8FAFC] dark:bg-[#07182D] border-y border-[#E2E8F0] dark:border-[#1E3A5F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
          <Reveal className="text-center max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-widest text-[#0F766E] dark:text-[#2DD4BF] mb-3">Core capabilities</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#0B2545] dark:text-white">
              Everything your facility needs, nothing it doesn't
            </h2>
          </Reveal>

          {/* Spotlight 1: Universal Health Passport */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <Reveal>
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF] border border-[#0F766E]/20">
                  <QrCode className="w-3.5 h-3.5" /> Universal Health Passport
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-[#0B2545] dark:text-white tracking-tight">
                  Every patient carries their entire medical history in a QR code
                </h3>
                <p className="text-[#475569] dark:text-slate-300 leading-relaxed">
                  Patients receive a cryptographically-sealed QR health passport. Any BHC-connected facility can scan it to instantly view authenticated consultation history, allergies, blood type, and active prescriptions — eliminating duplicate tests and paper record hunting.
                </p>
                <ul className="space-y-2.5">
                  {['Encrypted patient dossier — tamper-evident on blockchain', 'Cross-facility continuity with zero paper', 'Allergy alerts and critical vitals always accessible', 'Patient controls what they share and with whom'].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#475569] dark:text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-[#1D9E75] shrink-0 mt-0.5" />{f}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="bg-white dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl p-8 shadow-sm flex flex-col items-center gap-5">
                <div className="w-24 h-24 bg-[#0F766E]/10 rounded-2xl flex items-center justify-center">
                  <QrCode className="w-14 h-14 text-[#0F766E] dark:text-[#2DD4BF]" />
                </div>
                <div className="w-full space-y-0">
                  {[{ label: 'Patient', value: 'Jane Wanjiku' }, { label: 'Blood Type', value: 'B+' }, { label: 'Allergies', value: 'Penicillin (Severe)' }, { label: 'Last Visit', value: 'Kenyatta National Hospital' }].map(row => (
                    <div key={row.label} className="flex justify-between items-center py-2 border-b border-[#E2E8F0] dark:border-[#1E3A5F] last:border-0">
                      <span className="text-xs text-[#64748B] dark:text-slate-400">{row.label}</span>
                      <span className="text-xs font-semibold text-[#0B2545] dark:text-white">{row.value}</span>
                    </div>
                  ))}
                </div>
                <span className="text-[10px] text-[#94A3B8] dark:text-slate-500">Cryptographically sealed · Blockchain verified</span>
              </div>
            </Reveal>
          </div>

          {/* Spotlight 2: Verified Practitioners */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <Reveal delay={100} className="lg:order-2">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#1D9E75]/10 text-[#1D9E75] border border-[#1D9E75]/20">
                  <UserCheck className="w-3.5 h-3.5" /> Verified Practitioner Registry
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-[#0B2545] dark:text-white tracking-tight">
                  Zero tolerance for forged credentials
                </h3>
                <p className="text-[#475569] dark:text-slate-300 leading-relaxed">
                  Every doctor and nurse who joins your facility is automatically verified against the Kenya Medical Practitioners & Dentists Council (KMPDC) and Nursing Council of Kenya (NCK) registries. If their license isn't current and valid, they can't access patient records.
                </p>
                <ul className="space-y-2.5">
                  {['Real-time KMPDC & NCK registry cross-check', 'Expired or revoked licenses blocked automatically', 'Immutable practitioner audit log — every action traceable', 'Ministry of Health inspection-ready compliance records'].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#475569] dark:text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-[#1D9E75] shrink-0 mt-0.5" />{f}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal className="lg:order-1">
              <div className="bg-white dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl p-8 shadow-sm">
                <div className="flex items-start gap-4 pb-4 mb-4 border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
                  <div className="w-12 h-12 rounded-xl bg-[#1D9E75]/10 text-[#1D9E75] flex items-center justify-center shrink-0"><UserCheck className="w-6 h-6" /></div>
                  <div className="flex-1">
                    <p className="font-bold text-sm text-[#0B2545] dark:text-white">Dr. Brian Otieno</p>
                    <p className="text-xs text-[#64748B] dark:text-slate-400">KMPDC Reg. No. A43210</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1D9E75] bg-[#1D9E75]/10 px-2 py-1 rounded-full">
                    <CheckCircle2 className="w-3 h-3" /> Verified
                  </span>
                </div>
                {[{ label: 'Specialty', value: 'Internal Medicine' }, { label: 'License Status', value: 'Active — 2026', green: true }, { label: 'Records Accessed', value: '1,204 patients' }, { label: 'Last Audit', value: 'Today, 09:14 AM' }].map(row => (
                  <div key={row.label} className="flex justify-between items-center py-2 border-b border-[#E2E8F0] dark:border-[#1E3A5F] last:border-0">
                    <span className="text-xs text-[#64748B] dark:text-slate-400">{row.label}</span>
                    <span className={`text-xs font-semibold ${row.green ? 'text-[#1D9E75]' : 'text-[#0B2545] dark:text-white'}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Spotlight 3: Pharmacy Dispensing */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            <Reveal>
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900">
                  <Pill className="w-3.5 h-3.5" /> Pharmacy Dispensing Portal
                  <span className="text-[9px] font-extrabold bg-[#0F766E] text-white px-1.5 py-0.5 rounded">New</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-[#0B2545] dark:text-white tracking-tight">
                  Scan. Verify. Dispense. Audit.
                </h3>
                <p className="text-[#475569] dark:text-slate-300 leading-relaxed">
                  Pharmacists scan the prescription QR token to receive full posology disclosure — drug name, dosage, frequency, and the prescribing doctor's verified KMPDC credentials. Every dispense is logged on the blockchain with batch number and expiry date.
                </p>
                <ul className="space-y-2.5">
                  {['PPB premises license verification at registration', 'QR prescription token scanning — no paper required', 'Batch number & expiry date dispensation logging', 'Rival-fill collision prevention — duplicate dispensing blocked'].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-[#475569] dark:text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-[#1D9E75] shrink-0 mt-0.5" />{f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => onNavigateLogin('?register=pharmacy')} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline">
                  Register your pharmacy <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="bg-white dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl p-8 shadow-sm">
                <div className="mb-4 pb-4 border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-[#0B2545] dark:text-white">Prescription Verified</span>
                    <span className="text-[9px] font-bold bg-[#1D9E75]/10 text-[#1D9E75] px-1.5 py-0.5 rounded">VALID TOKEN</span>
                  </div>
                  <p className="text-[10px] text-[#64748B] dark:text-slate-400">Token: BHC-RX-20240912-A7F3</p>
                </div>
                {[{ label: 'Drug', value: 'Amoxicillin 500mg' }, { label: 'Dosage', value: '1 tab · TDS · 7 days' }, { label: 'Prescribed by', value: 'Dr. B. Otieno (KMPDC ✓)' }, { label: 'Batch No.', value: 'AMX-240601-KNY' }, { label: 'Expiry', value: 'Jun 2026' }].map(row => (
                  <div key={row.label} className="flex justify-between items-center py-2 border-b border-[#E2E8F0] dark:border-[#1E3A5F] last:border-0">
                    <span className="text-xs text-[#64748B] dark:text-slate-400">{row.label}</span>
                    <span className="text-xs font-semibold text-[#0B2545] dark:text-white">{row.value}</span>
                  </div>
                ))}
                <button className="mt-5 w-full py-2.5 rounded-xl text-xs font-bold bg-[#0F766E] text-white hover:bg-[#115E59] transition-colors">
                  Confirm Dispense &amp; Log to Ledger
                </button>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ============================================================== */}
      {/* SOCIAL PROOF                                                    */}
      {/* ============================================================== */}
      <section className="py-16 bg-white dark:bg-[#0B192C] border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="max-w-2xl mx-auto bg-[#F8FAFC] dark:bg-[#112239] border border-[#E2E8F0] dark:border-[#1E3A5F] rounded-2xl p-8 relative">
              <div className="absolute top-4 right-4">
                <span className="text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">Beta Participant</span>
              </div>
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
              </div>
              <p className="text-sm text-[#475569] dark:text-slate-300 leading-relaxed italic mb-5">
                "The KMPDC verification at registration alone was enough to justify signing up. We had a case of forged credentials three years ago — now that can't happen. The QR passport has also cut our referral intake time significantly."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#0B2545] dark:bg-[#1E3A5F] text-white flex items-center justify-center font-bold text-sm shrink-0">KH</div>
                <div>
                  <p className="text-xs font-bold text-[#0B2545] dark:text-white">Dr. K.H., Medical Director</p>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">Nairobi private clinic · Beta Participant</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================================================== */}
      {/* PRICING                                                         */}
      {/* ============================================================== */}
      <section id="pricing" className="py-20 bg-[#F8FAFC] dark:bg-[#07182D] border-b border-[#E2E8F0] dark:border-[#1E3A5F]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal className="text-center max-w-3xl mx-auto mb-14 space-y-3">
            <Badge className="bg-[#1D9E75]/10 text-[#1D9E75] dark:text-[#34D399] border-[#1D9E75]/20 text-xs font-semibold px-3 py-1">
              Transparent Pricing · Paystack Secured
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0B2545] dark:text-white tracking-tight">Choose the right plan for your facility</h2>
            <p className="text-base text-[#475569] dark:text-slate-300">All plans billed monthly. Every new clinic gets a <strong>7-day free trial</strong>. No hidden fees.</p>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
            {tiers.map((tier, i) => (
              <Reveal key={tier.id} delay={i * 80}>
                <div className={`relative flex flex-col h-full rounded-2xl p-8 ${tier.popular ? 'bg-white dark:bg-[#112239] border-2 border-[#0F766E] dark:border-[#2DD4BF] shadow-lg lg:-translate-y-3' : 'bg-white dark:bg-[#0F243E] border border-[#E2E8F0] dark:border-[#1E3A5F]'}`}>
                  {tier.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="bg-[#0F766E] text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-md">Most Popular</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${tier.popular ? 'text-[#0F766E] dark:text-[#2DD4BF]' : 'text-[#64748B] dark:text-slate-400'}`}>{tier.name}</p>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-4xl font-extrabold text-[#0B2545] dark:text-white">{fmt(tier.price)}</span>
                      <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">/month</span>
                    </div>
                    <p className="text-xs text-[#64748B] dark:text-slate-400 mb-6">{tier.best}</p>
                    <div className="pt-5 border-t border-[#E2E8F0] dark:border-[#1E3A5F] space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B2545] dark:text-slate-300 mb-3">{tier.practitioners}</p>
                      {tier.features.map((f, j) => (
                        <div key={j} className="flex items-center gap-2.5 py-1.5 text-xs">
                          {f.on ? <CheckCircle2 className="w-4 h-4 text-[#1D9E75] shrink-0" /> : <X className="w-4 h-4 text-[#CBD5E1] dark:text-[#334155] shrink-0" />}
                          <span className={f.on ? 'text-[#475569] dark:text-slate-300' : 'text-[#94A3B8] dark:text-slate-500'}>{f.label}</span>
                          {f.soon && <span className="ml-auto text-[9px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800 whitespace-nowrap">Soon</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-8 pt-4">
                    <Button onClick={() => onNavigateLogin(`?register=clinic&plan=${tier.id}`)} className={`w-full py-3 rounded-xl font-semibold text-sm ${tier.popular ? 'bg-[#0F766E] hover:bg-[#115E59] text-white shadow-sm' : 'bg-[#0B2545] hover:bg-[#112239] text-white'}`}>
                      Get Started
                    </Button>
                    <p className="text-[11px] text-center text-slate-400 mt-2">7-day free trial included</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-[#94A3B8] dark:text-slate-500">All plans billed monthly via M-Pesa or card · Paystack encrypted · Cancel anytime</p>

          {/* Pharmacy plan */}
          <div id="pharmacy-pricing" className="mt-20">
            <Reveal className="text-center mb-8 space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF] border border-[#0F766E]/20">
                <Pill className="w-3.5 h-3.5" /> Pharmacy Dispensary Portal
              </div>
              <h3 className="text-2xl font-extrabold text-[#0B2545] dark:text-white">Simple, flat pricing for licensed pharmacies</h3>
              <p className="text-sm text-[#475569] dark:text-slate-300">One plan. Everything included. 14-day trial for new pharmacies.</p>
            </Reveal>
            <Reveal delay={80}>
              <div className="max-w-lg mx-auto bg-white dark:bg-[#112239] border-2 border-[#0F766E] dark:border-[#2DD4BF] rounded-2xl p-8 shadow-lg">
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <h4 className="text-xl font-bold text-[#0B2545] dark:text-white">Pharmacy Monthly Subscription</h4>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-1">Full dispensary compliance portal with PPB license verification</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-[#0F766E]/10 text-[#0F766E] dark:text-[#2DD4BF] flex items-center justify-center shrink-0"><Pill className="w-6 h-6" /></div>
                </div>
                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-[#0B2545] dark:text-white">KES 4,500</span>
                    <span className="text-xs text-[#64748B] dark:text-[#94A3B8]">/ month</span>
                  </div>
                  <span className="text-[11px] text-[#0F766E] dark:text-[#2DD4BF] font-medium">Billed via M-Pesa or Card · Paystack Encrypted</span>
                </div>
                <ul className="space-y-2.5 mb-8 pt-4 border-t border-[#E2E8F0] dark:border-[#1E3A5F]">
                  {['PPB premises license verification & registration', 'Prescription QR token scanning & full posology disclosure', 'Batch number & expiry date dispensation tracking', 'Rival-fill collision prevention (duplicate dispensing blocked)', 'Multi-tenant isolation — your dispensations are private', 'Full dispensation audit trail & compliance read-only mode', '14-day free trial upon Super Admin approval'].map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs text-[#475569] dark:text-slate-300">
                      <CheckCircle2 className="w-4 h-4 text-[#1D9E75] shrink-0 mt-0.5" /><span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button onClick={() => onNavigateLogin('?register=pharmacy')} className="w-full py-3 rounded-xl font-semibold text-sm bg-[#0F766E] hover:bg-[#115E59] text-white shadow-sm">
                  Register your Pharmacy — Start Free Trial
                </Button>
                <p className="text-[11px] text-center text-slate-400 mt-2">14-day trial · No card required until activation</p>
              </div>
            </Reveal>
          </div>

          <Reveal className="mt-12 text-center text-xs text-[#64748B] dark:text-[#94A3B8] max-w-xl mx-auto">
            Need a county-wide deployment or custom HMIS integration? Contact our healthcare solutions desk for tailored institutional agreements.
          </Reveal>
        </div>
      </section>

      {/* ============================================================== */}
      {/* CTA BANNER                                                      */}
      {/* ============================================================== */}
      <section className="py-20 bg-white dark:bg-[#0B192C]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="bg-[#0B2545] dark:bg-[#0F243E] rounded-3xl p-10 sm:p-14 text-white relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #2DD4BF 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
              <div className="relative z-10 max-w-2xl space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-[#1D9E75]/20 text-[#34D399] border border-[#1D9E75]/40">
                  <Sparkles className="w-3.5 h-3.5" /> Clinics: 7-day Trial · Pharmacies: 14-day Trial
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Ready to secure your facility's health records?</h2>
                <p className="text-slate-300 leading-relaxed">Join forward-thinking Kenyan healthcare institutions. Protect your facility against record falsification and deliver seamless, connected patient care.</p>
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button size="lg" onClick={() => onNavigateLogin('?register=clinic')} className="bg-[#0F766E] hover:bg-[#115E59] text-white font-semibold px-6 py-3 rounded-xl shadow-md flex items-center justify-center gap-2">
                    <Building2 className="w-4 h-4" /> Register your Clinic
                  </Button>
                  <Button size="lg" onClick={() => onNavigateLogin('?register=pharmacy')} className="bg-[#1D9E75] hover:bg-[#16a37a] text-white font-semibold px-6 py-3 rounded-xl shadow-md flex items-center justify-center gap-2">
                    <Pill className="w-4 h-4" /> Register your Pharmacy
                  </Button>
                  <Button size="lg" variant="outline" onClick={() => onNavigateLogin()} className="bg-transparent border-white/30 hover:bg-white/10 text-white px-6 py-3 rounded-xl">
                    Sign In
                  </Button>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ============================================================== */}
      {/* FOOTER                                                          */}
      {/* ============================================================== */}
      <footer id="contact" className="bg-[#F8FAFC] dark:bg-[#07182D] border-t border-[#E2E8F0] dark:border-[#1E3A5F] py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <img src={logoSvg} alt="BHC" className="h-7 w-7" />
                <span className="font-extrabold text-sm text-[#0B2545] dark:text-white">Block Health Chain</span>
              </div>
              <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">Decentralized, tamper-evident health records infrastructure connecting healthcare facilities and pharmacies across the Republic of Kenya.</p>
              <p className="text-[11px] text-[#1D9E75] font-semibold flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Verified Kenyan Healthcare Node</p>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0B2545] dark:text-white">Platform</p>
              <ul className="space-y-2 text-xs text-[#64748B] dark:text-slate-300">
                {[{ label: 'Universal Health Passport', id: 'features' }, { label: 'KMPDC / NCK Verification', id: 'features' }, { label: 'Pharmacy Dispensing Portal', id: 'pharmacy-pricing' }, { label: 'Clinic Subscription Plans', id: 'pricing' }].map((item, i) => (
                  <li key={i}><button onClick={() => scroll(item.id)} className="hover:text-[#0F766E] transition-colors text-left">{item.label}</button></li>
                ))}
                <li><button onClick={() => onNavigateLogin('?register=doctor')} className="hover:text-[#0F766E] transition-colors text-left">Practitioner Registration</button></li>
              </ul>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0B2545] dark:text-white">Get Started</p>
              <ul className="space-y-2 text-xs text-[#64748B] dark:text-slate-300">
                {[{ label: 'Register a Clinic', route: '?register=clinic' }, { label: 'Register a Hospital', route: '?register=clinic' }, { label: 'Register a Pharmacy', route: '?register=pharmacy' }, { label: 'Patient Registration', route: '?register=patient' }, { label: 'Doctor Registration', route: '?register=doctor' }].map((item, i) => (
                  <li key={i}><button onClick={() => onNavigateLogin(item.route)} className="hover:text-[#0F766E] transition-colors text-left">{item.label}</button></li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0B2545] dark:text-white">Contact</p>
              <ul className="space-y-2.5 text-xs text-[#64748B] dark:text-slate-300">
                <li className="flex items-start gap-2"><Mail className="w-3.5 h-3.5 text-[#0F766E] shrink-0 mt-0.5" /><span>support@blockhealthchain.co.ke</span></li>
                <li className="flex items-start gap-2"><Phone className="w-3.5 h-3.5 text-[#0F766E] shrink-0 mt-0.5" /><span>+254 700 000 000</span></li>
                <li className="flex items-start gap-2"><MapPin className="w-3.5 h-3.5 text-[#0F766E] shrink-0 mt-0.5" /><span>Nairobi, Kenya</span></li>
              </ul>
              <div className="pt-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[#0B2545] dark:text-white mb-2">Regulatory Standards</p>
                <p className="text-xs text-[#64748B] dark:text-slate-400 leading-relaxed">Operating under Kenya Data Protection Act 2019, KMPDC practitioner attestation guidelines, PPB premises licensing requirements, and the National Health Informatics Framework.</p>
              </div>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-[#E2E8F0] dark:border-[#1E3A5F] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#64748B] dark:text-[#94A3B8]">
            <p>&copy; {new Date().getFullYear()} Block Health Chain. All rights reserved.</p>
            <p className="text-[11px] text-[#94A3B8]">Built for Kenya's healthcare ecosystem · Clinics, Hospitals &amp; Licensed Pharmacies</p>
          </div>
        </div>
      </footer>

    </div>
  );
}
