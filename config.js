/* ============================================================
   CONFIG.JS — the only file you normally edit
   ============================================================ */
const CONFIG = {
  jsonbinId:  "6a410f90da38895dfe0b6035",
  jsonbinKey: "$2a$10$GkaVoeERdWZKR6zbFgJvauDlU2QqRxih8vwP07eNclrVSGBIkMwmy",

  forms: {
    opd:      "PASTE_OPD_FORM_LINK_HERE",
    hospital: "PASTE_HOSPITAL_FORM_LINK_HERE"
  },

  refreshIntervalMinutes: 5,

  /* Bed capacity (fixed) */
  totalBedsDefault: 63,   // General inpatient beds (excludes ICU, CCU, PICU)
  icuBeds:          26,
  ccuBeds:          14,
  picuBeds:         7     // PICU & NICU combined
};
