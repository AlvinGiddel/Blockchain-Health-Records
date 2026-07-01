import React, { useState, useEffect } from 'react';
import { Shield, LayoutDashboard, FileText, Globe, LogOut, UserCheck, Sun, Moon, Menu, X, ArrowLeft } from 'lucide-react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import MedicalRecords from './components/MedicalRecords';
import BlockchainExplorer from './components/BlockchainExplorer';
import AdminPanel from './components/AdminPanel';
import ResetPassword from './components/ResetPassword';
import Profile from './components/Profile';
import Settings from './components/Settings';


export default function App() {
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => sessionStorage.getItem('token') || '');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [resetToken, setResetToken] = useState(null);

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
        return user.role === 'admin' ? 'Admin Panel' : 'Dashboard';
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

  // Theme states & persistence
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenVal = urlParams.get('resetToken');
    if (tokenVal) {
      setResetToken(tokenVal);
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
    sessionStorage.setItem('user', JSON.stringify(data.user));
    sessionStorage.setItem('token', data.token);
    setActiveTab('dashboard');
  };

  // Handle logout
  const handleLogout = () => {
    setUser(null);
    setToken('');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('token');
    setActiveTab('dashboard');
  };

  // Helper when doctor selects a patient from dashboard registry
  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    setActiveTab('records');
  };

  const handleUpdateUser = (updatedUser) => {
    setUser(updatedUser);
    sessionStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        if (user.role === 'admin') {
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
        return <BlockchainExplorer user={user} />;
      case 'profile':
        return <Profile user={user} onUpdateUser={handleUpdateUser} />;
      case 'settings':
        return <Settings user={user} />;
      default:
        if (user.role === 'admin') {
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
            <Shield size={24} color="var(--color-primary)" />
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

  // If user is not authenticated, render Login/Register
  if (!user) {
    return (
      <div className="app-container login-page">
        <header className="navbar">
          <div className="nav-brand">
            <Shield size={24} color="var(--color-primary)" />
            <span>BLOCKCHAIN HEALTH RECORDS</span>
          </div>
        </header>
        <main className="main-content">
          <Login onLoginSuccess={handleLoginSuccess} />
        </main>
      </div>
    );
  }

  return (
    <div className={`app-layout ${isResizing ? 'resizing' : ''}`}>
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
            <Shield size={24} color="var(--color-primary)" />
            <span>BLOCKCHAIN HEALTH RECORDS</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`sidebar-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleNavClick('dashboard')}
            title={sidebarCollapsed ? (user.role === 'admin' ? 'Admin Panel' : 'Dashboard') : ''}
          >
            <LayoutDashboard size={20} />
            <span>{user.role === 'admin' ? 'Admin Panel' : 'Dashboard'}</span>
          </button>
          
          {user.role !== 'admin' && (
            <button
              className={`sidebar-link ${activeTab === 'records' ? 'active' : ''}`}
              onClick={() => handleNavClick('records')}
              title={sidebarCollapsed ? (user.role === 'patient' ? 'My Health Folder' : 'Patient Dossiers') : ''}
            >
              <FileText size={20} />
              <span>{user.role === 'patient' ? 'My Health Folder' : 'Patient Dossiers'}</span>
            </button>
          )}
          
          <button
            className={`sidebar-link ${activeTab === 'blockchain' ? 'active' : ''}`}
            onClick={() => handleNavClick('blockchain')}
            title={sidebarCollapsed ? 'Ledger Explorer' : ''}
          >
            <Globe size={20} />
            <span>Ledger Explorer</span>
          </button>

          <button
            className={`sidebar-link ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => handleNavClick('profile')}
            title={sidebarCollapsed ? 'My Profile' : ''}
          >
            <UserCheck size={20} />
            <span>My Profile</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar" title={`${user.name} (${user.role})`}>
              {getInitials(user.name)}
            </div>
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-role">{user.role}</span>
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

            <button
              className="sidebar-action-btn"
              onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

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
        style={!sidebarCollapsed ? { marginLeft: `${sidebarWidth}px`, width: `calc(100% - ${sidebarWidth}px)` } : {}}
      >
        {/* Top Minimal Header */}
        <header className="top-header" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="hamburger-btn" onClick={toggleSidebar} aria-label="Toggle Sidebar">
            {mobileSidebarOpen ? <X size={20} /> : <Menu size={20} />}
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
        </header>

        {/* Workspace content */}
        <main className="main-content">
          {renderTabContent()}
        </main>

        {/* Footer info */}
        <footer style={{ borderTop: '1px solid var(--glass-border)', padding: '20px 40px', background: 'rgba(0,0,0,0.1)', color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Secure Electronic Health Records &bull; Blockchain Ledger Systems &bull; 2026</span>
          <span>Distributed Ledger Network &bull; Healthcare Security Node</span>
        </footer>
      </div>
    </div>
  );
}
