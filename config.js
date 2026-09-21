/* ============================================================
   CONFIG.JS — the only file you normally edit
   ============================================================ */
const CONFIG = {
  jsonbinId:  "6a410f90da38895dfe0b6035",
  jsonbinKey: "$2a$10$GkaVoeERdWZKR6zbFgJvauDlU2QqRxih8vwP07eNclrVSGBIkMwmy",

  forms: {
    opd:      "https://forms.cloud.microsoft/r/ebT3Acy687?origin=lprLink",
    hospital: "https://forms.cloud.microsoft/r/f5J7rexRQg?origin=lprLink"
  },

  refreshIntervalMinutes: 5,

  /* Bed capacity (fixed) */
  totalBedsDefault: 63,   // General inpatient beds (excludes ICU, CCU, PICU)
  icuBeds:          26,
  ccuBeds:          14,
  picuBeds:         7     // PICU & NICU combined
};
