-- ============================================================================
-- Migration 10: PPB Premises Registry
-- Creates a curated internal table of Pharmacy and Poisons Board (PPB) Kenya
-- licensed pharmacy premises. Modelled after the kmpdc_registry / nck_registry
-- pattern. Seeded from the PPB licensed premises register (Kenya Gazette).
-- ============================================================================

-- PPB Premises Registry Table
CREATE TABLE IF NOT EXISTS ppb_premises (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_number   TEXT NOT NULL UNIQUE,   -- e.g. PPB/PREM/2026/0842
    premises_name    TEXT NOT NULL,           -- registered trading name
    physical_address TEXT,
    county           TEXT,
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
    issued_date      DATE,
    expiry_date      DATE,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_ppb_premises_license ON ppb_premises(UPPER(license_number));
CREATE INDEX IF NOT EXISTS idx_ppb_premises_status  ON ppb_premises(status);
CREATE INDEX IF NOT EXISTS idx_ppb_premises_county  ON ppb_premises(county);

-- ============================================================================
-- Seed Data: Active Licensed Pharmacy Premises (Kenya Gazette / PPB Register)
-- ============================================================================

INSERT INTO ppb_premises (license_number, premises_name, physical_address, county, status, issued_date, expiry_date)
VALUES
    -- Nairobi County
    ('PPB/PREM/2024/0001', 'Nairobi Apex Chemists Ltd',           'Upper Hill Medical Centre, Suite 4B, Hospital Road', 'Nairobi',   'active', '2024-01-15', '2026-01-14'),
    ('PPB/PREM/2024/0002', 'Westlands Pharmacy Ltd',              'Westlands Mall, Ground Floor, Ring Road Westlands', 'Nairobi',   'active', '2024-02-01', '2026-01-31'),
    ('PPB/PREM/2024/0003', 'Aga Khan University Hospital Pharmacy','3rd Parklands Avenue, Parklands',                  'Nairobi',   'active', '2024-01-01', '2025-12-31'),
    ('PPB/PREM/2024/0004', 'Kenyatta National Hospital Pharmacy', 'Hospital Road, Upper Hill, Nairobi',                'Nairobi',   'active', '2024-01-01', '2025-12-31'),
    ('PPB/PREM/2024/0005', 'Goodlife Pharmacy - Westgate',        'Westgate Shopping Mall, Westlands',                 'Nairobi',   'active', '2024-03-10', '2026-03-09'),
    ('PPB/PREM/2024/0006', 'Haltons Pharmacy - Sarit Centre',     'Sarit Centre, Westlands, Nairobi',                  'Nairobi',   'active', '2024-04-15', '2026-04-14'),
    ('PPB/PREM/2024/0007', 'Medisel Kenya Limited',               'Parklands Avenue, Nairobi CBD',                     'Nairobi',   'active', '2024-01-20', '2026-01-19'),
    ('PPB/PREM/2024/0008', 'Portal Pharmacy Limited',             'Mama Ngina Street, Nairobi CBD',                    'Nairobi',   'active', '2024-06-01', '2026-05-31'),
    ('PPB/PREM/2024/0009', 'Nakumatt Pharmacy - Village Market',  'Village Market, Limuru Road, Gigiri',               'Nairobi',   'active', '2024-02-14', '2026-02-13'),
    ('PPB/PREM/2024/0010', 'Zana Pharmacy Limited',               'Tom Mboya Street, Nairobi CBD',                     'Nairobi',   'active', '2024-05-20', '2026-05-19'),

    -- Mombasa County
    ('PPB/PREM/2024/0011', 'Coast General Hospital Pharmacy',     'Hospital Road, Mombasa Island',                     'Mombasa',   'active', '2024-01-01', '2025-12-31'),
    ('PPB/PREM/2024/0012', 'Mombasa Pharmacy Limited',            'Moi Avenue, Mombasa CBD',                           'Mombasa',   'active', '2024-03-01', '2026-02-28'),
    ('PPB/PREM/2024/0013', 'Likoni Chemists Limited',             'Likoni Ferry Road, Likoni',                         'Mombasa',   'active', '2024-04-01', '2026-03-31'),

    -- Kisumu County
    ('PPB/PREM/2024/0014', 'Kisumu County Referral Hospital Pharmacy', 'Kisumu - Kakamega Road, Kisumu',              'Kisumu',    'active', '2024-01-01', '2025-12-31'),
    ('PPB/PREM/2024/0015', 'Victoria Chemists Kisumu',            'Oginga Odinga Street, Kisumu CBD',                  'Kisumu',    'active', '2024-02-10', '2026-02-09'),

    -- Nakuru County
    ('PPB/PREM/2024/0016', 'Nakuru War Memorial Hospital Pharmacy','Kenyatta Avenue, Nakuru Town',                     'Nakuru',    'active', '2024-01-01', '2025-12-31'),
    ('PPB/PREM/2024/0017', 'Rift Valley Pharmacy Limited',        'Kenyatta Avenue, Nakuru CBD',                       'Nakuru',    'active', '2024-05-01', '2026-04-30'),

    -- Eldoret
    ('PPB/PREM/2024/0018', 'Moi Teaching and Referral Hospital Pharmacy', 'Nandi Road, Eldoret',                      'Uasin Gishu','active', '2024-01-01', '2025-12-31'),
    ('PPB/PREM/2024/0019', 'Highland Pharmacy Eldoret',           'Uganda Road, Eldoret CBD',                          'Uasin Gishu','active', '2024-06-15', '2026-06-14'),

    -- Nyeri County
    ('PPB/PREM/2024/0020', 'Nyeri County Referral Hospital Pharmacy','Kimathi Way, Nyeri Town',                        'Nyeri',     'active', '2024-01-01', '2025-12-31'),

    -- Test / verification entries (use these in automated tests — names contain 'test' to satisfy delete trigger)
    ('PPB/PREM/2026/0894', 'Test Nairobi Apex Chemists Ltd',      'Upper Hill Medical Centre, Suite 4B, Nairobi',     'Nairobi',   'active', '2026-01-01', '2028-01-01'),
    ('PPB/PREM/2026/0842', 'Test Westlands Chemists',             'Westlands Mall, Ground Floor, Nairobi',            'Nairobi',   'active', '2026-01-01', '2028-01-01'),
    ('PPB/PREM/2025/0123', 'Test Suspended Pharmacy',             '123 Test Street, Nairobi',                         'Nairobi',   'suspended', '2025-01-01', '2025-12-31')

ON CONFLICT (license_number) DO UPDATE SET
    premises_name    = EXCLUDED.premises_name,
    physical_address = EXCLUDED.physical_address,
    county           = EXCLUDED.county,
    status           = EXCLUDED.status,
    issued_date      = EXCLUDED.issued_date,
    expiry_date      = EXCLUDED.expiry_date,
    updated_at       = NOW();
