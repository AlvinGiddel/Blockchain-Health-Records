import React, { useState, useEffect } from 'react';
import { Shield, LayoutDashboard, FileText, Globe, LogOut, UserCheck, Sun, Moon, Menu, X, ArrowLeft, Clock, AlertTriangle } from 'lucide-react';
import logoSvg from './assets/logo.svg';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import MedicalRecords from './components/MedicalRecords';
import BlockchainExplorer from './components/BlockchainExplorer';
import AdminPanel from './components/AdminPanel';
import ResetPassword from './components/ResetPassword';
import Profile from './components/Profile';
import Settings from './components/Settings';
import PublicCertificateView from './components/PublicCertificateView';
import PaystackRenewalModal from './components/PaystackRenewalModal';
import { safeFetch } from './utils/api';
import { Toaster } from './components/ui/sonner';
import clinicalBg from './assets/clinical_login_bg.jpg';
import { useTheme } from './context/ThemeContext';
import { ThemeToggle } from './components/ui/theme-toggle';
import LandingPage from './components/LandingPage';


// Helper to normalize pathnames (strips trailing slashes, handles empty/root)
const normalizePath = (raw) => {
  if (!raw) return '/';
  const clean = raw.trim().replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
};

export default function App() {
  // Routing state for public marketing page vs clinical login vs authenticated workspace
  const [currentPath, setCurrentPath] = useState(() => {
    return normalizePath(window.location.pathname);
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(normalizePath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path, search = '') => {
    const norm = normalizePath(path);
    const targetUrl = norm + (search ? (search.startsWith('?') ? search : `?${search}`) : '');
    window.history.pushState({}, '', targetUrl);
    setCurrentPath(norm);
  };

  // Session storage switched from sessionStorage to localStorage. Note: This is a JWT-in-localStorage tradeoff (XSS exposure) accepted for this project.
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || '');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [resetToken, setResetToken] = useState(null);
  const [isTrialExpired, setIsTrialExpired] = useState(() => {
    const savedUser = localStorage.getItem('user');
    const u = savedUser ? JSON.parse(savedUser) : null;
    return u && u.organizationStatus === 'expired';
  });
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showPaystackModal, setShowPaystackModal] = useState(false);

  // Server status & network failure tracking
  const consecutiveFailuresRef = React.useRef(0);

  // Sidebar layout states
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Resize state
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved, 10) : 280;
  });
  const [isResizing, setIsResizing] = useState(false);

  const startResizing = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      let newWidth = e.clientX;
      if (newWidth < 200) newWidth = 200;
      if (newWidth > 450) newWidth = 450;
      setSidebarWidth(newWidth);
      localStorage.setItem('sidebarWidth', String(newWidth));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Helper to toggle sidebar responsive state
  const toggleSidebar = () => {
    if (window.innerWidth <= 768) {
      setMobileSidebarOpen(prev => !prev);
    } else {
      setSidebarCollapsed(prev => {
        const newVal = !prev;
        localStorage.setItem('sidebarCollapsed', String(newVal));
        return newVal;
      });
    }
  };

  // Helper to change active tab and auto-close mobile drawer
  const handleNavClick = (tab) => {
    setActiveTab(tab);
    setMobileSidebarOpen(false);
  };

  // Get active section display title
  const getTabTitle = () => {
    if (!user) return 'Blockchain Health Records';
    switch (activeTab) {
      case 'dashboard':
        return (user.role === 'admin' || user.role === 'super_admin') ? 'Admin Panel' : 'Dashboard';
      case 'records':
        return user.role === 'patient' ? 'My Health Folder' : 'Patient Dossiers';
      case 'blockchain':
        return 'Ledger Explorer';
      case 'profile':
        return 'My Profile';
      case 'settings':
        return 'Account Settings';
      default:
        return 'Blockchain Health Records';
    }
  };

  // Helper to get initials for the user profile avatar
  const getInitials = (name) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const [publicRecordId, setPublicRecordId] = useState(null);

  // Global theme context
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenVal = urlParams.get('resetToken');
    if (tokenVal) {
      setResetToken(tokenVal);
    }
    const verifyId = urlParams.get('verifyRecordId');
    if (verifyId) {
      setPublicRecordId(verifyId);
    }
  }, []);

  // Navigation history states & back button handlers
  const [navHistory, setNavHistory] = useState(['dashboard']);

  // Track activeTab transitions for history stack
  useEffect(() => {
    setNavHistory(prev => {
      const last = prev[prev.length - 1];
      if (last !== activeTab) {
        return [...prev, activeTab];
      }
      return prev;
    });
  }, [activeTab]);

  // Clean selected patient state when navigating away from medical records
  useEffect(() => {
    if (activeTab !== 'records') {
      setSelectedPatient(null);
    }
  }, [activeTab]);

  // Resilient heartbeat check: monitors server health without logging out on single network glitches or server restarts
  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const checkServerStatus = async () => {
      try {
        await safeFetch('/api/health');
        if (!isMounted) return;

        // Reset consecutive network failure counter on successful response
        consecutiveFailuresRef.current = 0;
      } catch (err) {
        if (!isMounted) return;
        consecutiveFailuresRef.current += 1;
        console.warn(`[HEALTH PING WARNING] Server health check failed (${consecutiveFailuresRef.current}/3):`, err.message);

        // Only log out after 3 consecutive failures to prevent false logouts from temporary network glitches
        if (consecutiveFailuresRef.current >= 3) {
          console.error('Server unreachable after 3 consecutive health pings. Triggering session logout.');
          sessionStorage.removeItem('serverInstanceId');
          handleLogout();
          alert('The application server is unreachable after multiple connection attempts. You have been logged out.');
        }
      }
    };

    // Run check immediately on mount / user state change
    checkServerStatus();

    const interval = setInterval(checkServerStatus, 30000); // Check every 30 seconds

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user]);

  const handleBackClick = () => {
    if (navHistory.length > 1) {
      const historyCopy = [...navHistory];
      historyCopy.pop(); // Remove current tab
      const prevTab = historyCopy[historyCopy.length - 1];
      setNavHistory(historyCopy);
      setActiveTab(prevTab);
    } else {
      setActiveTab('dashboard');
      setNavHistory(['dashboard']);
    }
  };

  // Handle successful login or registration
  const handleLoginSuccess = (data) => {
    setUser(data.user);
    setToken(data.token);
    // Session storage switched from sessionStorage to localStorage. Note: This is a JWT-in-localStorage tradeoff (XSS exposure) accepted for this project.
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('token', data.token);
    sessionStorage.removeItem('serverInstanceId'); // Let next heartbeat fetch it fresh
    sessionStorage.removeItem('sessionTimedOut'); // Clear timeout flag
    setActiveTab('dashboard');
    navigate('/app');
  };

  // Handle logout
  const handleLogout = (options) => {
    setUser(null);
    setToken('');
    // Session storage switched from sessionStorage to localStorage. Note: This is a JWT-in-localStorage tradeoff (XSS exposure) accepted for this project.
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    sessionStorage.removeItem('serverInstanceId');
    if (options && options.isSuspended === true) {
      sessionStorage.setItem('suspensionNotice', options.message || 'Your hospital facility has been suspended by platform administration.');
    } else if (options && options.isTimeout === true) {
      sessionStorage.setItem('sessionTimedOut', 'true');
    } else {
      sessionStorage.removeItem('sessionTimedOut');
    }
    setActiveTab('dashboard');
    navigate('/login');
  };

  // Instant kill-switch listener: logs out users if their clinic is suspended
  useEffect(() => {
    const handleSuspended = (e) => {
      handleLogout({ isSuspended: true, message: e.detail });
    };
    window.addEventListener('tenant-suspended', handleSuspended);
    return () => window.removeEventListener('tenant-suspended', handleSuspended);
  }, []);

  // Sync trial expired status from user or custom event
  useEffect(() => {
    if (user && user.organizationStatus === 'expired') {
      setIsTrialExpired(true);
    } else {
      setIsTrialExpired(false);
    }
  }, [user]);

  useEffect(() => {
    const handleExpired = () => {
      setIsTrialExpired(true);
    };
    window.addEventListener('tenant-trial-expired', handleExpired);
    return () => window.removeEventListener('tenant-trial-expired', handleExpired);
  }, []);

  // Inactivity timeout logic to auto log out after inactivity
  useEffect(() => {
    if (!user) return;

    // Check for custom timeout (e.g. for testing/demo) or default to 15 minutes
    const savedTimeout = localStorage.getItem('inactivityTimeout');
    const INACTIVITY_TIMEOUT = savedTimeout ? parseInt(savedTimeout, 10) : 15 * 60 * 1000;
    let timeoutId;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.log('Session timed out due to inactivity.');
        handleLogout({ isTimeout: true });
      }, INACTIVITY_TIMEOUT);
    };

    // Events to track user activity
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];

    // Initialize timer
    resetTimer();

    // Bind event listeners
    activityEvents.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  // Helper when doctor selects a patient from dashboard registry
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    setActiveTab('records');
  };

  const handleUpdateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        if (user.role === 'admin' || user.role === 'super_admin') {
          return <AdminPanel user={user} />;
        }
        return <Dashboard user={user} onSelectPatient={handleSelectPatient} onUpdateUser={handleUpdateUser} onNavigate={setActiveTab} />;
      case 'records':
        return (
          <MedicalRecords
            user={user}
            selectedPatient={selectedPatient}
            onBackToRegistry={() => {
              setSelectedPatient(null);
              setActiveTab('dashboard');
            }}
          />
        );
      case 'blockchain':
        if (user.role === 'patient') {
          return <Dashboard user={user} onSelectPatient={handleSelectPatient} onUpdateUser={handleUpdateUser} onNavigate={setActiveTab} />;
        }
        return <BlockchainExplorer user={user} />;
      case 'profile':
        return <Profile user={user} onUpdateUser={handleUpdateUser} />;
      case 'settings':
        return <Settings user={user} onUpdateUser={handleUpdateUser} />;
      default:
        if (user.role === 'admin' || user.role === 'super_admin') {
          return <AdminPanel user={user} />;
        }
        return <Dashboard user={user} onSelectPatient={handleSelectPatient} onUpdateUser={handleUpdateUser} onNavigate={setActiveTab} />;
    }
  };

  // Intercept render cycle if password reset token is active in URL
  if (resetToken) {
    return (
      <div className="app-container">
        <header className="navbar">
          <div className="nav-brand">
            <img src={logoSvg} alt="Logo" style={{ width: '24px', height: '24px' }} />
            <span>BLOCKCHAIN HEALTH RECORDS</span>
          </div>
        </header>
        <main className="main-content">
          <ResetPassword
            token={resetToken}
            onResetSuccess={() => {
              setResetToken(null);
              // Clean the query parameter from URL bar
              const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
              window.history.replaceState({}, document.title, cleanUrl);
            }}
          />
        </main>
      </div>
    );
  }

  // Intercept render cycle if QR code scan verification is active in URL
  if (publicRecordId) {
    return (
      <PublicCertificateView
        recordId={publicRecordId}
        onDismiss={() => {
          setPublicRecordId(null);
          const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        }}
      />
    );
  }

  // Intercept render cycle for public marketing landing page (root route '/')
  if (currentPath === '/') {
    return (
      <>
        <LandingPage
          onNavigateLogin={(query = '') => navigate('/login', query)}
          onGoToDashboard={() => navigate('/app')}
          isLoggedIn={!!user}
        />
        <Toaster position="top-right" richColors />
      </>
    );
  }

  // If user is not authenticated, render Login/Register
  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#07182D] text-[#0F172A] dark:text-[#F8FAFC] flex flex-col font-sans relative transition-colors duration-200">
        <header className="h-16 border-b border-[#E2E8F0] dark:border-[#1E3A5F] bg-white/95 dark:bg-[#0B192C]/95 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between sticky top-0 z-50 shadow-sm transition-colors duration-200">
          <div 
            onClick={() => navigate('/')} 
            className="flex items-center gap-3 cursor-pointer group"
            title="Return to Public Overview"
          >
            <img src={logoSvg} alt="BHC Logo" className="w-8 h-8 rounded-lg group-hover:scale-105 transition-transform" />
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight text-[#0B2545] dark:text-white">BLOCK HEALTH CHAIN</span>
              <span className="text-[10px] font-medium text-[#475569] dark:text-[#94A3B8] tracking-wider uppercase">Clinical Trust Network</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="hidden sm:inline-flex items-center text-xs font-semibold text-[#0F766E] dark:text-[#2DD4BF] hover:underline mr-2 cursor-pointer"
            >
              Public Overview
            </button>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E8F7F2] dark:bg-[#064E3B]/50 text-[#1D9E75] dark:text-[#34D399] border border-[#A3E3CD] dark:border-[#065F46]">
              <span className="w-2 h-2 rounded-full bg-[#1D9E75] dark:bg-[#34D399]"></span>
              Ledger Online
            </span>

            {/* Shared High-Contrast Accessible Theme Toggle */}
            <ThemeToggle />
          </div>
        </header>
        <main 
          className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-8 relative bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${clinicalBg})` }}
        >
          {/* Adjusted 62% clinical wash overlay: authentic clinical photo visibility + high-contrast card separation */}
          <div className="absolute inset-0 bg-[#F8FAFC]/62 dark:bg-[#07182D]/75 backdrop-blur-[1px] pointer-events-none transition-colors duration-200" />
          
          {/* Elevated form container */}
          <div className="relative z-10 w-full flex justify-center">
            <Login 
              onLoginSuccess={handleLoginSuccess}
              onNavigateHome={() => navigate('/')}
            />
          </div>
        </main>
        <Toaster position="top-right" richColors />
      </div>
    );
  }

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed-layout' : ''} ${isResizing ? 'resizing' : ''}`}>
      {/* Collapsible Sidebar */}
      <aside 
        className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileSidebarOpen ? 'open' : ''}`}
        style={!sidebarCollapsed ? { width: `${sidebarWidth}px` } : {}}
      >
        <div className="sidebar-brand">
          <button className="sidebar-toggle-btn" onClick={toggleSidebar} aria-label="Toggle Sidebar" title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}>
            {mobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="brand-logo-text" onClick={() => handleNavClick('dashboard')} style={{ cursor: 'pointer' }}>
            <img src={logoSvg} alt="Logo" style={{ width: '24px', height: '24px' }} />
            <span>BLOCKCHAIN HEALTH RECORDS</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleNavClick('dashboard')}
          >
            <LayoutDashboard size={20} />
            <span>{(user.role === 'admin' || user.role === 'super_admin') ? 'Admin Panel' : 'Dashboard'}</span>
          </button>
          
          {user.role !== 'admin' && user.role !== 'super_admin' && (
            <button
              className={`sidebar-link ${activeTab === 'records' ? 'active' : ''}`}
              onClick={() => handleNavClick('records')}
            >
              <FileText size={20} />
              <span>{user.role === 'patient' ? 'My Health Folder' : 'Patient Dossiers'}</span>
            </button>
          )}
          
          {user.role !== 'patient' && (
            <button
              className={`sidebar-link ${activeTab === 'blockchain' ? 'active' : ''}`}
              onClick={() => handleNavClick('blockchain')}
            >
              <Globe size={20} />
              <span>Ledger Explorer</span>
            </button>
          )}

          <button
            className={`sidebar-link ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => handleNavClick('profile')}
          >
            <UserCheck size={20} />
            <span>My Profile</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div 
              className="user-avatar" 
              title={`${user.name} (${user.role})`}
              style={{ overflow: 'hidden', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {user.profilePhoto ? (
                <img src={user.profilePhoto} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                getInitials(user.name)
              )}
            </div>
            <div className="user-info">
              <span className="user-name" title={user.name}>{user.name}</span>
              <span className="user-role" title={user.organizationName || user.role}>
                {user.role}
                {user.organizationName ? ` • ${user.organizationName}` : ''}
              </span>
            </div>
          </div>

          <div className="sidebar-actions">
            <button
              className={`sidebar-action-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => handleNavClick('settings')}
              title="Account Settings"
            >
              <Shield size={16} />
              <span>Settings</span>
            </button>

            <ThemeToggle className="sidebar-action-btn w-full justify-start text-xs" />

            <button
              className="sidebar-action-btn"
              onClick={handleLogout}
              title="Log Out"
            >
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>
        </div>

        {/* Resize Handle */}
        {!sidebarCollapsed && (
          <div 
            className={`sidebar-resize-handle ${isResizing ? 'active' : ''}`} 
            onMouseDown={startResizing} 
          />
        )}
      </aside>

      {/* Sidebar Backdrop overlay for mobile drawer */}
      {mobileSidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileSidebarOpen(false)} />
      )}

      {/* Main Content Wrapper */}
      <div 
        className={`main-wrapper ${sidebarCollapsed ? 'collapsed' : ''}`}
        style={!sidebarCollapsed ? { marginLeft: `${sidebarWidth}px`, width: `calc(100% - ${sidebarWidth}px)` } : { marginLeft: 0, width: '100%' }}
      >
        {/* Top Minimal Header */}
        <header className="top-header" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="hamburger-btn" onClick={toggleSidebar} aria-label="Toggle Sidebar" title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}>
            <Menu size={20} />
          </button>
          {activeTab !== 'dashboard' && (
            <button 
              className="back-btn" 
              onClick={handleBackClick} 
              aria-label="Go Back"
              title="Go Back"
            >
              <ArrowLeft size={20} />
            </button>
          )}
          <h2 className="header-title">{getTabTitle()}</h2>
          <div style={{ marginLeft: 'auto' }}>
            <ThemeToggle variant="icon" />
          </div>
        </header>

        {/* Persistent Trial Expired Read-Only Grace Mode Banner */}
        {isTrialExpired && (
          <div style={{
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.16), rgba(245, 158, 11, 0.16))',
            borderBottom: '1px solid rgba(239, 68, 68, 0.4)',
            padding: '12px 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '8px', color: '#f87171' }}>
                <Clock size={20} />
              </div>
              <div>
                <strong style={{ color: '#fca5a5', fontSize: '0.95rem', display: 'block' }}>
                  ⚠️ Trial Expired — Read-Only Grace Mode Active
                </strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  Your clinic trial ({user.organizationName || 'Facility'}) has expired. You can view existing patient charts, records, and blockchain ledger history, but adding new records and booking appointments is paused.
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ fontSize: '0.82rem', padding: '6px 14px', background: '#0F766E', borderColor: '#0F766E' }}
                onClick={() => setShowUpgradeModal(true)}
              >
                Upgrade to Full License &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Workspace content */}
        <main className="main-content">
          {renderTabContent()}
        </main>

        {/* Footer info */}
        <footer className="app-footer">
          <span>Secure Electronic Health Records &bull; Blockchain Ledger Systems &bull; 2026</span>
          <span>Distributed Ledger Network &bull; Healthcare Security Node</span>
        </footer>
      </div>

      {/* Upgrade Subscription Modal */}
      {showUpgradeModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-card" style={{ maxWidth: '480px', width: '100%', padding: '28px', border: '1px solid var(--color-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={20} color="var(--color-primary)" /> Upgrade Facility License
              </h3>
              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
              >
                ✕
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: '1.6', marginBottom: '20px' }}>
              Your 14-day free trial for <strong>{user?.organizationName || 'your clinic'}</strong> has concluded. In accordance with clinical data safety guidelines, your facility is in <strong>Read-Only Grace Mode</strong>.
            </p>
            <div style={{ background: 'rgba(15, 118, 110, 0.08)', border: '1px solid rgba(15, 118, 110, 0.25)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Clinical Tier Plan: $149 / mo</div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: '1.6' }}>
                <li>Unlimited patient EHR records & SHA-256 block mining</li>
                <li>Unlimited practitioners & staff accounts</li>
                <li>Isolated cryptographic chain ledger</li>
              </ul>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontStyle: 'italic', marginBottom: '20px' }}>
              Note: Automated card billing (Paystack gateway) is currently being integrated. Please reach out to your platform Super Administrator to reactivate or extend your trial instantly.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowUpgradeModal(false)}
              >
                Continue in Read-Only
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: '#0F766E', borderColor: '#0F766E', color: '#fff' }}
                onClick={() => {
                  setShowUpgradeModal(false);
                  setShowPaystackModal(true);
                }}
              >
                Renew with Paystack (M-Pesa / Card)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Paystack Renewal Modal */}
      <PaystackRenewalModal
        organization={{
          id: user?.organization_id,
          name: user?.organizationName || 'My Health Facility',
          license_expires_at: user?.organizationExpiry || null
        }}
        user={user}
        isOpen={showPaystackModal}
        onClose={() => setShowPaystackModal(false)}
        onSuccess={() => {
          setIsTrialExpired(false);
        }}
      />
      <Toaster position="top-right" richColors />
    </div>
  );
}
