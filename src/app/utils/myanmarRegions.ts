/** Myanmar states/regions and their townships — checkout cascading selects. */

export const MYANMAR_REGIONS = [
  "Yangon",
  "Mandalay",
  "Naypyidaw",
  "Ayeyarwady",
  "Bago",
  "Chin",
  "Kachin",
  "Kayah",
  "Kayin",
  "Magway",
  "Mon",
  "Rakhine",
  "Sagaing",
  "Shan",
  "Tanintharyi",
] as const;

export type MyanmarRegion = (typeof MYANMAR_REGIONS)[number];

const REGION_TOWNSHIPS: Record<MyanmarRegion, readonly string[]> = {
  Yangon: [
    "Ahlone",
    "Bahan",
    "Botataung",
    "Cocokyun",
    "Dagon",
    "Dagon Myothit (East)",
    "Dagon Myothit (North)",
    "Dagon Myothit (Seikkan)",
    "Dagon Myothit (South)",
    "Dala",
    "Dawbon",
    "East Dagon",
    "Hlaing",
    "Hlaingthaya",
    "Insein",
    "Kamayut",
    "Kawhmu",
    "Kayan",
    "Kyauktada",
    "Kyauktan",
    "Kyimyindaing",
    "Kungyangon",
    "Lanmadaw",
    "Latha",
    "Mayangon",
    "Mingala Taungnyunt",
    "Mingaladon",
    "North Dagon",
    "North Okkalapa",
    "Pabedan",
    "Pazundaung",
    "Sanchaung",
    "Seikgyi Kanaungto",
    "Shwepyithar",
    "South Dagon",
    "South Okkalapa",
    "Tamwe",
    "Taikkyi",
    "Thaketa",
    "Thingangyun",
    "Thongwa",
    "Twantay",
    "Yankin",
  ],
  Mandalay: [
    "Amarapura",
    "Chanayethazan",
    "Chanmyathazi",
    "Kyaukse",
    "Kyaukpadaung",
    "Madaya",
    "Mahaaungmyay",
    "Mahlaing",
    "Meiktila",
    "Mogok",
    "Myingyan",
    "Myittha",
    "Nyaung-U",
    "Patheingyi",
    "Pyigyitagun",
    "Pyin Oo Lwin",
    "Pyinmana",
    "Singu",
    "Tada-U",
    "Taungtha",
    "Thabeikkyin",
    "Wundwin",
    "Yamethin",
    "Ye-U",
  ],
  Naypyidaw: [
    "Dekkhinathiri",
    "Lewe",
    "Ottarathiri",
    "Poke Ba Thi Ri",
    "Pyinmana",
    "Tatkon",
    "Zabuthiri",
    "Zeyarthiri",
  ],
  Ayeyarwady: [
    "Bogale",
    "Danubyu",
    "Hinthada",
    "Kyaiklat",
    "Labutta",
    "Maubin",
    "Myanaung",
    "Myaungmya",
    "Ngapudaw",
    "Pathein",
    "Pyapon",
    "Wakema",
    "Yegyi",
    "Zalun",
  ],
  Bago: [
    "Bago",
    "Daik-U",
    "Kawa",
    "Kyaukkyi",
    "Kyauktaga",
    "Nyaunglebin",
    "Okpho",
    "Padaung",
    "Paungde",
    "Phyu",
    "Pyay",
    "Shwegyin",
    "Taungoo",
    "Thanatpin",
    "Tharyarwady",
    "Waw",
    "Zigon",
  ],
  Chin: [
    "Falam",
    "Hakha",
    "Kanpetlet",
    "Matupi",
    "Mindat",
    "Paletwa",
    "Tedim",
    "Thantlang",
    "Tonzang",
  ],
  Kachin: [
    "Bhamo",
    "Chipwi",
    "Hpakant",
    "Injangyang",
    "Machanbaw",
    "Mansi",
    "Mohnyin",
    "Momauk",
    "Myitkyina",
    "Putao",
    "Shwegu",
    "Sumprabum",
    "Tanai",
    "Waingmaw",
  ],
  Kayah: [
    "Bawlakhe",
    "Demoso",
    "Hpasawng",
    "Hpruso",
    "Loikaw",
    "Mese",
    "Shadaw",
  ],
  Kayin: [
    "Hlaingbwe",
    "Hpa-An",
    "Kawkareik",
    "Kyainseikgyi",
    "Myawaddy",
    "Thandaunggyi",
  ],
  Magway: [
    "Chauk",
    "Gangaw",
    "Magway",
    "Minbu",
    "Myothit",
    "Natmauk",
    "Ngape",
    "Pakokku",
    "Pauk",
    "Pwintbyu",
    "Salin",
    "Seikphyu",
    "Sidoktaya",
    "Taungdwingyi",
    "Thayet",
    "Yenangyaung",
  ],
  Mon: [
    "Bilin",
    "Chaungzon",
    "Kyaikto",
    "Kyaikmaraw",
    "Mawlamyine",
    "Mudon",
    "Paung",
    "Thaton",
    "Ye",
  ],
  Rakhine: [
    "Ann",
    "Buthidaung",
    "Gwa",
    "Kyaukpyu",
    "Kyauktaw",
    "Maungdaw",
    "Minbya",
    "Mrauk-U",
    "Myebon",
    "Pauktaw",
    "Ponnagyun",
    "Ramree",
    "Rathedaung",
    "Sittwe",
    "Taungup",
    "Thandwe",
  ],
  Sagaing: [
    "Ayadaw",
    "Banmauk",
    "Budalin",
    "Chaung-U",
    "Hkamti",
    "Homalin",
    "Indaw",
    "Kale",
    "Katha",
    "Kawlin",
    "Khin-U",
    "Mawlaik",
    "Mingin",
    "Monywa",
    "Myaung",
    "Myinmu",
    "Pinlebu",
    "Sagaing",
    "Shwebo",
    "Tabayin",
    "Tamu",
    "Taze",
    "Wetlet",
    "Ye-U",
    "Yinmabin",
  ],
  Shan: [
    "Hopang",
    "Hseni",
    "Kalaw",
    "Kengtung",
    "Kunhing",
    "Kyaukme",
    "Lashio",
    "Lawksawk",
    "Loilen",
    "Mong Hsat",
    "Mong Kung",
    "Mong Pan",
    "Mong Ping",
    "Mong Ton",
    "Mong Yai",
    "Mong Yang",
    "Muse",
    "Namhsan",
    "Namtu",
    "Nawnghkio",
    "Pindaya",
    "Pinlaung",
    "Tachileik",
    "Taunggyi",
    "Ywangan",
  ],
  Tanintharyi: [
    "Bokpyin",
    "Dawei",
    "Kawthoung",
    "Kyunsu",
    "Launglon",
    "Myeik",
    "Palaw",
    "Tanintharyi",
    "Thayetchaung",
    "Yebyu",
  ],
};

const REGION_LOOKUP = new Map(MYANMAR_REGIONS.map((r) => [r.toLowerCase(), r]));

const TOWNSHIP_TO_REGION = new Map<string, MyanmarRegion>();
for (const region of MYANMAR_REGIONS) {
  for (const township of REGION_TOWNSHIPS[region]) {
    TOWNSHIP_TO_REGION.set(township.toLowerCase(), region);
  }
}

function normalizeRegionKey(value?: string): MyanmarRegion | undefined {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  const hit = REGION_LOOKUP.get(trimmed.toLowerCase());
  return hit;
}

/** Infer region when only a saved township/city is known. */
export function resolveMyanmarRegionForTownship(township?: string): MyanmarRegion | undefined {
  const trimmed = String(township || "").trim();
  if (!trimmed) return undefined;
  return TOWNSHIP_TO_REGION.get(trimmed.toLowerCase());
}

export function myanmarRegionSelectOptions(currentRegion?: string): string[] {
  const trimmed = String(currentRegion || "").trim();
  if (!trimmed) return [...MYANMAR_REGIONS];
  const known = normalizeRegionKey(trimmed);
  if (known) return [...MYANMAR_REGIONS];
  return [trimmed, ...MYANMAR_REGIONS];
}

/** Townships for a region; keeps unknown saved township when it does not match list yet. */
export function myanmarTownshipSelectOptions(
  region?: string,
  currentTownship?: string
): string[] {
  const regionKey = normalizeRegionKey(region);
  if (!regionKey) return [];

  const townships = [...REGION_TOWNSHIPS[regionKey]];
  const trimmed = String(currentTownship || "").trim();
  if (!trimmed) return townships;

  const inList = townships.some((t) => t.toLowerCase() === trimmed.toLowerCase());
  if (inList) return townships;
  return [trimmed, ...townships];
}

export function isTownshipInMyanmarRegion(region?: string, township?: string): boolean {
  const regionKey = normalizeRegionKey(region);
  const trimmed = String(township || "").trim();
  if (!regionKey || !trimmed) return false;
  return REGION_TOWNSHIPS[regionKey].some((t) => t.toLowerCase() === trimmed.toLowerCase());
}

/** Backward-compatible aliases used elsewhere. */
export const MYANMAR_STATES = MYANMAR_REGIONS;

export function myanmarStateSelectOptions(currentState?: string): string[] {
  return myanmarRegionSelectOptions(currentState);
}

export function myanmarCitySelectOptions(region?: string, currentCity?: string): string[] {
  return myanmarTownshipSelectOptions(region, currentCity);
}
