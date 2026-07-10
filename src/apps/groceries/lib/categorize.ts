// Winkel-looproute-indeling voor de boodschappenlijst: ingrediëntnamen worden
// via Nederlandse keyword-lijsten aan een gangpad-categorie toegewezen.

export const CATEGORY_ORDER = [
  "Groente & Fruit",
  "Vlees, Vis & Vega",
  "Brood & Bakkerij",
  "Zuivel & Eieren",
  "Houdbaar & Voorraad",
  "Kruiden, Olie & Sauzen",
  "Diepvries",
  "Drinken",
  "Non-food",
  "Overig",
] as const;

export type Category = (typeof CATEGORY_ORDER)[number];

const KEYWORDS: Array<[Category, string[]]> = [
  [
    "Groente & Fruit",
    [
      "ui", "knoflook", "tomaat", "paprika", "komkommer", "sla", "wortel",
      "aardappel", "courgette", "aubergine", "champignon", "spinazie",
      "broccoli", "bloemkool", "prei", "appel", "banaan", "citroen", "limoen",
      "avocado", "gember", "bosui", "peterselie", "koriander", "basilicum",
      "munt", "dille", "fruit", "groente",
    ],
  ],
  [
    "Vlees, Vis & Vega",
    [
      "kip", "gehakt", "rund", "varken", "spek", "worst", "ham", "zalm",
      "tonijn", "vis", "garnal", "tofu", "tempeh", "vega",
    ],
  ],
  [
    "Brood & Bakkerij",
    ["brood", "bol", "croissant", "wrap", "tortilla", "pita", "beschuit", "cracker"],
  ],
  [
    "Zuivel & Eieren",
    [
      "melk", "yoghurt", "kwark", "kaas", "boter", "ei", "room",
      "crème fraîche", "mozzarella", "feta", "parmezaan",
    ],
  ],
  [
    "Houdbaar & Voorraad",
    [
      "rijst", "pasta", "spaghetti", "macaroni", "noedels", "couscous",
      "bulgur", "meel", "bloem", "suiker", "bonen", "linzen", "kikkererwten",
      "tomatenblokjes", "passata", "kokosmelk", "bouillon", "noten", "pinda",
      "havermout", "muesli", "chips", "koek",
    ],
  ],
  [
    "Kruiden, Olie & Sauzen",
    [
      "olie", "azijn", "sojasaus", "ketjap", "sambal", "mosterd", "mayonaise",
      "ketchup", "saus", "pesto", "honing", "pindakaas", "jam", "zout",
      "peper", "kruiden", "paprikapoeder", "komijn", "kerrie", "kaneel",
      "oregano", "tijm", "laurier",
    ],
  ],
  ["Diepvries", ["diepvries", "ijs", "bevroren"]],
  ["Drinken", ["water", "sap", "cola", "frisdrank", "bier", "wijn", "koffie", "thee"]],
  [
    "Non-food",
    [
      "wc-papier", "keukenrol", "afwasmiddel", "wasmiddel", "schoonmaak",
      "zeep", "shampoo", "tandpasta", "folie", "zakken",
    ],
  ],
];

// Very short keywords ("ui", "ei") match far too many unrelated words as bare
// substrings (s-UI-ker, kr-UI-den, fr-UI-t), so those must match at the start
// of a word ("ui", "uien", "2 eieren"); longer keywords match as substrings.
function matches(name: string, keyword: string): boolean {
  if (keyword.length <= 2) {
    return new RegExp(`(?:^|[^a-zà-ÿ])${keyword}`, "i").test(name);
  }
  return name.includes(keyword);
}

export function categorizeIngredient(name: string): string {
  const lower = name.toLowerCase();
  for (const [category, keywords] of KEYWORDS) {
    if (keywords.some((kw) => matches(lower, kw))) return category;
  }
  return "Overig";
}
