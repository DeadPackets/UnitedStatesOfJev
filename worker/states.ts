// lean: partisan lean in points, positive = Republican. ev: electoral votes.
export const STATES: Record<string, { name: string; lean: number; ev: number }> = {
  AL: { name: "Alabama", lean: 15, ev: 9 }, AK: { name: "Alaska", lean: 8, ev: 3 }, AZ: { name: "Arizona", lean: 2, ev: 11 },
  AR: { name: "Arkansas", lean: 16, ev: 6 }, CA: { name: "California", lean: -13, ev: 54 }, CO: { name: "Colorado", lean: -4, ev: 10 },
  CT: { name: "Connecticut", lean: -7, ev: 7 }, DE: { name: "Delaware", lean: -7, ev: 3 }, FL: { name: "Florida", lean: 3, ev: 30 },
  GA: { name: "Georgia", lean: 3, ev: 16 }, HI: { name: "Hawaii", lean: -14, ev: 4 }, ID: { name: "Idaho", lean: 18, ev: 4 },
  IL: { name: "Illinois", lean: -7, ev: 19 }, IN: { name: "Indiana", lean: 11, ev: 11 }, IA: { name: "Iowa", lean: 6, ev: 6 },
  KS: { name: "Kansas", lean: 10, ev: 6 }, KY: { name: "Kentucky", lean: 16, ev: 8 }, LA: { name: "Louisiana", lean: 12, ev: 8 },
  ME: { name: "Maine", lean: -2, ev: 4 }, MD: { name: "Maryland", lean: -14, ev: 10 }, MA: { name: "Massachusetts", lean: -15, ev: 11 },
  MI: { name: "Michigan", lean: 1, ev: 15 }, MN: { name: "Minnesota", lean: -1, ev: 10 }, MS: { name: "Mississippi", lean: 11, ev: 6 },
  MO: { name: "Missouri", lean: 10, ev: 10 }, MT: { name: "Montana", lean: 11, ev: 4 }, NE: { name: "Nebraska", lean: 13, ev: 5 },
  NV: { name: "Nevada", lean: 1, ev: 6 }, NH: { name: "New Hampshire", lean: -1, ev: 4 }, NJ: { name: "New Jersey", lean: -6, ev: 14 },
  NM: { name: "New Mexico", lean: -3, ev: 5 }, NY: { name: "New York", lean: -10, ev: 28 }, NC: { name: "North Carolina", lean: 3, ev: 16 },
  ND: { name: "North Dakota", lean: 20, ev: 3 }, OH: { name: "Ohio", lean: 6, ev: 17 }, OK: { name: "Oklahoma", lean: 20, ev: 7 },
  OR: { name: "Oregon", lean: -6, ev: 8 }, PA: { name: "Pennsylvania", lean: 2, ev: 19 }, RI: { name: "Rhode Island", lean: -8, ev: 4 },
  SC: { name: "South Carolina", lean: 8, ev: 9 }, SD: { name: "South Dakota", lean: 16, ev: 3 }, TN: { name: "Tennessee", lean: 14, ev: 11 },
  TX: { name: "Texas", lean: 5, ev: 40 }, UT: { name: "Utah", lean: 13, ev: 6 }, VT: { name: "Vermont", lean: -16, ev: 3 },
  VA: { name: "Virginia", lean: -3, ev: 13 }, WA: { name: "Washington", lean: -8, ev: 12 }, WV: { name: "West Virginia", lean: 22, ev: 4 },
  WI: { name: "Wisconsin", lean: 2, ev: 10 }, WY: { name: "Wyoming", lean: 25, ev: 3 },
};
export const STATE_IDS = Object.keys(STATES);
