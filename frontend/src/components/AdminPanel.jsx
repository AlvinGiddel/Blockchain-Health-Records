import React from 'react';
import SuperAdminPanel from './SuperAdminPanel';
import RegularAdminPanel from './RegularAdminPanel';

export default function AdminPanel({ user }) {
  // If user is Platform Super Admin, render SaaS Multi-Tenancy & Licensing Command Center
  if (user?.role === 'super_admin') {
    return <SuperAdminPanel user={user} />;
  }

  // Otherwise, render the Tenant / Hospital Administrator Command Center with clinical operations
  return <RegularAdminPanel user={user} />;
}
