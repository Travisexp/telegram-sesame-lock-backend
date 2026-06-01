export const CATALOG = {
  Cleaning: [
    'Dishwashing Liquid',
    'Garbage Bags',
    'Paper Towels',
    'Surface Spray'
  ],
  Drinks: [
    'Raw C Coconut Water Pure Natural',
    'Raw C Coconut Water',
    'Coca-Cola Zero Sugar Glass Bottle',
    'Coca-Cola Classic Soft Drink Bottles',
    'Coca-Cola Classic Soft Drink Cans',
    'Coca-Cola Classic Soft Drink Multipack Cans',
    'Coca-Cola Zero Sugar Soft Drink Cans',
    'Coca-Cola Zero Sugar Soft Drink Multipack Cans',
    'Solo Original Lemon Soft Drink Cans Multipack',
    'Red Bull Energy Drink Cans',
    'Woolworths Soda Water',
    "Bickford's Raspberry Cordial"
  ],
  Food: [
    'Chicken Breast 10kg',
    'Beef Mince 5kg',
    'Eggs',
    'Milk',
    'Bread',
    'Rice'
  ],
  Supplies: [
    'Disposable Gloves',
    'Takeaway Containers',
    'Napkins',
    'Receipt Rolls'
  ]
};

export function categoryNames() {
  return Object.keys(CATALOG);
}

export function getCategoryItems(category) {
  return CATALOG[category] || [];
}

export function getCatalogItem(category, index) {
  return getCategoryItems(category)[Number(index)] || '';
}
