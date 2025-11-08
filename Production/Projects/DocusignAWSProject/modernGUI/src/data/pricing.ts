export type FrontLoadSize = '2' | '4' | '6' | '8' | '10';
export type PickupsPerWeek = 1 | 2 | 3 | 4 | 5 | 6;

interface FrontLoadRateEntry {
  service: Partial<Record<PickupsPerWeek, number>>;
  landfill: Partial<Record<PickupsPerWeek, number>>;
}

type FrontLoadRateTable = Record<FrontLoadSize, FrontLoadRateEntry>;

const toCurrency = (value: number) => Math.round(value * 100) / 100;

export const frontLoadCityRates: FrontLoadRateTable = {
  '2': {
    service: { 1: 60.9, 2: 105.19, 3: 157.23, 4: 209.28, 5: 260.21, 6: 265.74 },
    landfill: { 1: 19.18, 2: 33.14, 3: 49.53, 4: 65.92, 5: 81.97, 6: 83.71 }
  },
  '4': {
    service: { 1: 111.84, 2: 194.88, 3: 262.42, 4: 331.07, 5: 374.25, 6: 385.06 },
    landfill: { 1: 35.23, 2: 61.39, 3: 82.66, 4: 104.29, 5: 117.89, 6: 121.29 }
  },
  '6': {
    service: { 1: 143.94, 2: 226.99, 3: 307.82, 4: 389.75, 5: 469.47, 6: 544.77 },
    landfill: { 1: 45.34, 2: 71.5, 3: 96.96, 4: 122.77, 5: 147.88, 6: 171.6 }
  },
  '8': {
    service: { 1: 151.7, 2: 272.38, 3: 387.54, 4: 500.48, 5: 620.06, 6: 714.18 },
    landfill: { 1: 47.78, 2: 85.8, 3: 122.07, 4: 157.65, 5: 195.32, 6: 224.97 }
  },
  '10': {
    service: { 1: 178.27, 2: 338.82, 3: 473.08, 4: 620.06, 5: 768.9, 6: 884.7 },
    landfill: { 1: 56.16, 2: 106.73, 3: 149.02, 4: 195.32, 5: 242.2, 6: 278.68 }
  }
};

export const frontLoadOutsideCityRates: FrontLoadRateTable = {
  '2': {
    service: { 1: 71.98, 2: 114.05, 3: 177.16, 4: undefined, 5: undefined, 6: undefined },
    landfill: { 1: 22.67, 2: 35.93, 3: 55.81, 4: undefined, 5: undefined, 6: undefined }
  },
  '4': {
    service: { 1: 121.8, 2: 194.88, 3: 262.42, 4: undefined, 5: undefined, 6: undefined },
    landfill: { 1: 38.37, 2: 61.39, 3: 82.66, 4: undefined, 5: undefined, 6: undefined }
  },
  '6': {
    service: { 1: 145.05, 2: 226.99, 3: 307.82, 4: undefined, 5: undefined, 6: undefined },
    landfill: { 1: 45.69, 2: 71.5, 3: 96.96, 4: undefined, 5: undefined, 6: undefined }
  },
  '8': {
    service: { 1: 261.31, 2: 285.67, 3: 387.54, 4: undefined, 5: undefined, 6: undefined },
    landfill: { 1: 82.31, 2: 90.0, 3: 122.07, 4: undefined, 5: undefined, 6: undefined }
  },
  '10': {
    service: { 1: 293.43, 2: 322.21, 3: undefined, 4: undefined, 5: undefined, 6: undefined },
    landfill: { 1: 92.43, 2: 101.5, 3: undefined, 4: undefined, 5: undefined, 6: undefined }
  }
};

export const frontLoadFees = {
  city: {
    delivery: 50,
    extraPickup: 50,
    fuelSurchargeRate: 0.1,
    promoDiscountRate: 0.25 // applies to service portion only during promo window
  },
  outsideCity: {
    delivery: 65,
    extraPickup: 50,
    fuelSurchargeRate: 0.1,
    promoDiscountRate: 0 // promos typically city-only unless specified
  }
};

export type RollOffSize = '10' | '15' | '20' | '30' | '40';

export const rollOffRates = {
  delivery: { '10': 100, '15': 100, '20': 100, '30': 100, '40': 100 } as Record<RollOffSize, number>,
  hauling: { '10': 165, '15': 195, '20': 235, '30': 265, '40': 295 } as Record<RollOffSize, number>,
  disposalPerTon: 51.5,
  fuelSurchargeRate: 0.1,
  adminFeePerTon: 1,
  monthlyRentalIdle: 260,
  disposalScenarios: {
    Standard: 51.5,
    'Outside City Limits': 86.5,
    'Outside County': 216.5,
    'Special Waste': 221.5,
    Food: 221.5
  } as Record<string, number>,
  materialRates: {
    Cardboard: 0,
    Concrete: 51.5,
    'Construction Debris': 51.5,
    Food: 221.5,
    Metal: 0,
    Sludge: 51.5,
    Tires: 10,
    Trash: 51.5
  } as Record<string, number>
};

export function roundCurrency(value: number): number {
  return toCurrency(value);
}
