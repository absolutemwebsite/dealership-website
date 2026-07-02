// ============================================================================
//  DEALERSHIP CONFIGURATION
//  Single source of truth for business identity used across the whole platform.
//  Values marked  ⚠ FILL IN  are blank on purpose — no placeholder data.
//  Fill them before going live. Do NOT invent values.
// ============================================================================

const DEALERSHIP = {
  // --- Identity ---
  legalName:   'GP Auto Sales Ltd.',                 // used on legal documents
  brandName:   'Absolute Motor Cars',                // used for branding / headers
  dbaLine:     'GP AUTO SALES LTD  DBA 1 ABSOLUTE MOTOR CARS', // exact BOS header line
  tagline:     '',                                   // ⚠ FILL IN (e.g. "Where customers become family") — optional

  // --- Contact / location (from BOS template — confirmed) ---
  address:     '16099 Fraser Hwy',
  city:        'Surrey',
  province:    'B.C.',
  provinceFull:'British Columbia',
  postalCode:  'V4N 0G2',
  phone:       '778.855.4903',
  phoneE164:   '17788554903',                        // for tel: and WhatsApp links — ⚠ CONFIRM country code
  email:       '',                                   // ⚠ FILL IN — where financing/contact notifications go
  websites:    ['GPAUTOBC.COM', 'GPAUTOBC.CA'],

  // --- Social ---
  instagram:   '',                                   // ⚠ FILL IN (handle, e.g. @absolutemotorcars)

  // --- Hours ---
  hours:       '',                                   // ⚠ FILL IN (e.g. "Open Daily 10am–7pm")

  // --- Registration / tax numbers (from BOS template — confirmed) ---
  dealerReg:   '30721',
  gstNumber:   '868674789',
  pstNumber:   '1015-1724',

  // --- Tax rates (BC) ---
  gstRate:     0.05,
  pstRate:     0.07,

  // --- Branding ---
  accentColor: '#e0120c',                            // logo red — confirmed
  theme:       'dark',

  // --- Inspection report (Mechanical Fitness Assessment) ---
  inspection: {
    facilityName:   '',                              // ⚠ FILL IN
    facilityNumber: '',                              // ⚠ FILL IN
    dealerLegalName:'GP Auto Sales Ltd.',            // confirmed
    dealerAddress:  '16099 Fraser Hwy, Surrey, B.C. V4N 0G2', // confirmed
    technicianName: '',                              // ⚠ FILL IN (printed on reports)
  },
};

module.exports = { DEALERSHIP };
