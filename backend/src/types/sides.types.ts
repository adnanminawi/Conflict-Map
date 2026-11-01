// One side of a conflict in a country, e.g. Yemen → Houthis.
export interface Side {
  id: number;
  country_code: string; // "YE"
  name: string; // "Houthis"
  color: string; // "#A52714" — legend dot + the editor's default color
}

// What the admin sends to create a side (POST /api/sides).
export interface NewSide {
  countryCode: string;
  name: string;
  color: string;
}