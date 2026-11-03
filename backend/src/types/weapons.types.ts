// One kind of weapon (GET /api/weapons/types), e.g. launcher, drone, fighter.
export interface WeaponType {
  id: number;
  code: string; // 'launcher'
  name: string; // 'Missile launcher'
}

// One weapon with its type and side (GET /api/weapons). The country comes from the side.
export interface Weapon {
  id: number;
  name: string; // 'Burkan-2H'
  range_km: number; // the radius drawn on the map
  source: string | null;
  description: string | null;
  weapon_type_id: number;
  type_code: string; // 'launcher'
  type_name: string; // 'Missile launcher'
  side_id: number;
  side_name: string; // 'Houthis'
  side_color: string; // '#A52714'
  country_code: string; // 'YE'
}

// What the admin sends to add or change a weapon.
export interface WeaponInput {
  name: string;
  weaponTypeId: number;
  sideId: number;
  rangeKm: number;
  source: string | null;
  description: string | null;
}