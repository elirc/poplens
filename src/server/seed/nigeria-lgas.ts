/**
 * Nigeria's 774 Local Government Areas by state — REFERENCE DATA (names only,
 * no statistics). Names follow the GRID3 Nigeria LGA boundaries (2022, via
 * geoBoundaries gbOpen NGA ADM2, CC BY 4.0), with a few spellings normalised
 * to the commonly used form. Per-state counts match the constitutional list
 * (Kano 44, Katsina 34, Oyo 33, … FCT 6; total 774).
 *
 * Entry format: "Canonical name|alias|alias…". Aliases cover the GRID3 source
 * spelling where it differs and common alternate spellings seen in NBS/DHS/NCDC
 * files; they are seeded into geo_aliases (origin 'seed') for upload matching.
 */
export const NIGERIA_LGAS_RAW: Record<string, string[]> = {
  "NG-AB": [
    "Aba North", "Aba South", "Arochukwu", "Bende", "Ikwuano",
    "Isiala Ngwa North|Isiala-Ngwa North", "Isiala Ngwa South|Isiala-Ngwa South",
    "Isuikwuato", "Obi Ngwa|Obi Nwga", "Ohafia", "Osisioma Ngwa|Osisioma",
    "Ugwunagbo", "Ukwa East", "Ukwa West", "Umu Nneochi|Umu-Nneochi",
    "Umuahia North", "Umuahia South",
  ],
  "NG-AD": [
    "Demsa", "Fufore", "Ganye", "Girei", "Gombi", "Guyuk", "Hong", "Jada",
    "Lamurde", "Madagali", "Maiha", "Mayo-Belwa|Mayo Belwa", "Michika",
    "Mubi North", "Mubi South", "Numan", "Shelleng", "Song", "Toungo",
    "Yola North", "Yola South",
  ],
  "NG-AK": [
    "Abak", "Eastern Obolo", "Eket", "Esit Eket", "Essien Udim", "Etim Ekpo",
    "Etinan", "Ibeno", "Ibesikpo Asutan", "Ibiono Ibom", "Ika", "Ikono",
    "Ikot Abasi", "Ikot Ekpene", "Ini", "Itu", "Mbo", "Mkpat Enin",
    "Nsit Atai", "Nsit Ibom", "Nsit Ubium", "Obot Akara", "Okobo", "Onna",
    "Oron", "Oruk Anam", "Udung Uko", "Ukanafun", "Uruan",
    "Urue-Offong/Oruko|Urue Offong/Oruko", "Uyo",
  ],
  "NG-AN": [
    "Aguata", "Anambra East", "Anambra West", "Anaocha", "Awka North",
    "Awka South", "Ayamelum", "Dunukofia", "Ekwusigo", "Idemili North",
    "Idemili South", "Ihiala", "Njikoka", "Nnewi North", "Nnewi South",
    "Ogbaru", "Onitsha North", "Onitsha South", "Orumba North",
    "Orumba South", "Oyi",
  ],
  "NG-BA": [
    "Alkaleri", "Bauchi", "Bogoro", "Dambam", "Darazo", "Dass", "Gamawa",
    "Ganjuwa", "Giade", "Itas/Gadau|Itas Gadau", "Jama'are|Jamaare",
    "Katagum", "Kirfi", "Misau", "Ningi", "Shira",
    "Tafawa Balewa|Tafawa-Balewa", "Toro", "Warji", "Zaki",
  ],
  "NG-BY": [
    "Brass", "Ekeremor", "Kolokuma/Opokuma", "Nembe", "Ogbia", "Sagbama",
    "Southern Ijaw", "Yenagoa|Yenegoa",
  ],
  "NG-BE": [
    "Ado", "Agatu", "Apa", "Buruku", "Gboko", "Guma", "Gwer East",
    "Gwer West", "Katsina-Ala|Katsina Ala", "Konshisha", "Kwande", "Logo",
    "Makurdi", "Obi", "Ogbadibo", "Ohimini", "Oju", "Okpokwu",
    "Oturkpo|Otukpo", "Tarka", "Ukum", "Ushongo", "Vandeikya",
  ],
  "NG-BO": [
    "Abadam", "Askira/Uba|Askira Uba", "Bama", "Bayo", "Biu", "Chibok",
    "Damboa", "Dikwa", "Gubio", "Guzamala", "Gwoza", "Hawul", "Jere",
    "Kaga", "Kala/Balge|Kala Balge", "Konduga", "Kukawa",
    "Kwaya Kusar", "Mafa", "Magumeri", "Maiduguri|Maiduguri Metropolitan|MMC",
    "Marte", "Mobbar", "Monguno", "Ngala", "Nganzai", "Shani",
  ],
  "NG-CR": [
    "Abi", "Akamkpa", "Akpabuyo", "Bakassi", "Bekwarra", "Biase", "Boki",
    "Calabar Municipal", "Calabar South", "Etung", "Ikom", "Obanliku",
    "Obubra", "Obudu", "Odukpani", "Ogoja", "Yakurr|Yakuur", "Yala",
  ],
  "NG-DE": [
    "Aniocha North", "Aniocha South", "Bomadi", "Burutu", "Ethiope East",
    "Ethiope West", "Ika North East", "Ika South", "Isoko North",
    "Isoko South", "Ndokwa East", "Ndokwa West", "Okpe", "Oshimili North",
    "Oshimili South", "Patani", "Sapele", "Udu", "Ughelli North",
    "Ughelli South", "Ukwuani", "Uvwie", "Warri North", "Warri South",
    "Warri South West|Warri South-West",
  ],
  "NG-EB": [
    "Abakaliki", "Afikpo North", "Afikpo South|Edda", "Ebonyi", "Ezza North",
    "Ezza South", "Ikwo", "Ishielu", "Ivo", "Izzi", "Ohaozara", "Ohaukwu",
    "Onicha",
  ],
  "NG-ED": [
    "Akoko-Edo|Akoko Edo", "Egor", "Esan Central", "Esan North-East",
    "Esan South-East", "Esan West", "Etsako Central", "Etsako East",
    "Etsako West", "Igueben|Iguegben", "Ikpoba-Okha|Ikpoba Okha", "Oredo",
    "Orhionmwon", "Ovia North-East", "Ovia South-West", "Owan East",
    "Owan West", "Uhunmwonde",
  ],
  "NG-EK": [
    "Ado-Ekiti|Ado Ekiti", "Efon", "Ekiti East", "Ekiti South-West",
    "Ekiti West", "Emure", "Gbonyin", "Ido-Osi|Ido Osi", "Ijero", "Ikere",
    "Ikole", "Ilejemeje", "Irepodun/Ifelodun", "Ise/Orun", "Moba", "Oye",
  ],
  "NG-EN": [
    "Aninri", "Awgu", "Enugu East", "Enugu North", "Enugu South", "Ezeagu",
    "Igbo-Etiti|Igbo Etiti", "Igbo-Eze North|Igbo Eze North",
    "Igbo-Eze South|Igbo Eze South", "Isi-Uzo|Isi Uzo", "Nkanu East",
    "Nkanu West", "Nsukka", "Oji River|Oji-River", "Udenu", "Udi",
    "Uzo-Uwani|Uzo Uwani",
  ],
  "NG-FC": [
    "Abaji", "Bwari", "Gwagwalada", "Kuje", "Kwali",
    "Abuja Municipal Area Council|Municipal Area Council|AMAC|Abuja Municipal",
  ],
  "NG-GO": [
    "Akko", "Balanga", "Billiri", "Dukku", "Funakaye", "Gombe", "Kaltungo",
    "Kwami", "Nafada", "Shongom|Shomgom", "Yamaltu/Deba|Yamaltu Deba",
  ],
  "NG-IM": [
    "Aboh Mbaise|Aboh-Mbaise", "Ahiazu Mbaise|Ahiazu-Mbaise",
    "Ehime Mbano|Ehime-Mbano", "Ezinihitte|Ezinihitte Mbaise",
    "Ideato North", "Ideato South", "Ihitte/Uboma", "Ikeduru",
    "Isiala Mbano", "Isu", "Mbaitoli|Mbatoli", "Ngor Okpala|Ngor-Okpala",
    "Njaba", "Nkwerre", "Nwangele", "Obowo", "Oguta", "Ohaji/Egbema",
    "Okigwe", "Onuimo|Unuimo", "Orlu", "Orsu", "Oru East", "Oru West",
    "Owerri Municipal", "Owerri North", "Owerri West",
  ],
  "NG-JI": [
    "Auyo", "Babura", "Biriniwa", "Birnin Kudu", "Buji", "Dutse", "Gagarawa",
    "Garki", "Gumel", "Guri", "Gwaram", "Gwiwa", "Hadejia", "Jahun",
    "Kafin Hausa", "Kaugama", "Kazaure", "Kiri Kasamma|Kiri Kasama",
    "Kiyawa", "Maigatari", "Malam Madori", "Miga", "Ringim", "Roni",
    "Sule Tankarkar", "Taura", "Yankwashi",
  ],
  "NG-KD": [
    "Birnin Gwari", "Chikun", "Giwa", "Igabi", "Ikara", "Jaba",
    "Jema'a|Jemaa", "Kachia", "Kaduna North", "Kaduna South", "Kagarko",
    "Kajuru", "Kaura", "Kauru", "Kubau", "Kudan", "Lere", "Makarfi",
    "Sabon Gari", "Sanga", "Soba", "Zangon Kataf", "Zaria",
  ],
  "NG-KN": [
    "Ajingi", "Albasu", "Bagwai", "Bebeji", "Bichi", "Bunkure", "Dala",
    "Dambatta", "Dawakin Kudu", "Dawakin Tofa", "Doguwa", "Fagge",
    "Gabasawa", "Garko", "Garun Mallam|Garun Malam", "Gaya", "Gezawa",
    "Gwale", "Gwarzo", "Kabo", "Kano Municipal", "Karaye", "Kibiya", "Kiru",
    "Kumbotso", "Kunchi", "Kura", "Madobi", "Makoda", "Minjibir",
    "Nassarawa|Nasarawa", "Rano", "Rimin Gado", "Rogo", "Shanono",
    "Sumaila", "Takai", "Tarauni", "Tofa", "Tsanyawa", "Tudun Wada",
    "Ungogo", "Warawa", "Wudil",
  ],
  "NG-KT": [
    "Bakori", "Batagarawa", "Batsari", "Baure", "Bindawa", "Charanchi",
    "Dan Musa|Danmusa", "Dandume", "Danja", "Daura", "Dutsi",
    "Dutsin-Ma|Dutsin Ma", "Faskari", "Funtua", "Ingawa", "Jibia", "Kafur",
    "Kaita", "Kankara", "Kankia", "Katsina", "Kurfi", "Kusada",
    "Mai'adua|Maiadua", "Malumfashi", "Mani", "Mashi", "Matazu", "Musawa",
    "Rimi", "Sabuwa", "Safana", "Sandamu", "Zango",
  ],
  "NG-KE": [
    "Aleiro", "Arewa Dandi|Arewa", "Argungu", "Augie", "Bagudu",
    "Birnin Kebbi", "Bunza", "Dandi", "Fakai", "Gwandu", "Jega", "Kalgo",
    "Koko/Besse|Koko-Besse", "Maiyama", "Ngaski", "Sakaba", "Shanga",
    "Suru", "Danko/Wasagu|Wasagu-Danko|Wasagu/Danko", "Yauri", "Zuru",
  ],
  "NG-KO": [
    "Adavi", "Ajaokuta", "Ankpa", "Bassa", "Dekina", "Ibaji", "Idah",
    "Igalamela-Odolu|Igalamela Odolu", "Ijumu", "Kabba/Bunu", "Kogi",
    "Lokoja", "Mopa-Muro|Mopa Muro", "Ofu", "Ogori/Magongo", "Okehi",
    "Okene", "Olamaboro", "Omala", "Yagba East", "Yagba West",
  ],
  "NG-KW": [
    "Asa", "Baruten", "Edu", "Ekiti", "Ifelodun", "Ilorin East",
    "Ilorin South", "Ilorin West", "Irepodun", "Isin", "Kaiama", "Moro",
    "Offa", "Oke Ero|Oke-Ero", "Oyun", "Pategi|Patigi",
  ],
  "NG-LA": [
    "Agege", "Ajeromi-Ifelodun|Ajeromi/Ifelodun", "Alimosho",
    "Amuwo-Odofin|Amuwo Odofin", "Apapa", "Badagry", "Epe",
    "Eti-Osa|Eti Osa", "Ibeju-Lekki|Ibeju Lekki", "Ifako-Ijaiye|Ifako/Ijaye",
    "Ikeja", "Ikorodu", "Kosofe", "Lagos Island", "Lagos Mainland",
    "Mushin", "Ojo", "Oshodi-Isolo|Oshodi/Isolo", "Somolu|Shomolu",
    "Surulere",
  ],
  "NG-NA": [
    "Akwanga", "Awe", "Doma", "Karu", "Keana", "Keffi", "Kokona", "Lafia",
    "Nasarawa|Nassarawa", "Nasarawa Eggon|Nasarawa Egon", "Obi", "Toto",
    "Wamba",
  ],
  "NG-NI": [
    "Agaie", "Agwara", "Bida", "Borgu", "Bosso", "Chanchaga", "Edati",
    "Gbako", "Gurara", "Katcha", "Kontagora", "Lapai", "Lavun", "Magama",
    "Mariga", "Mashegu", "Mokwa", "Munya", "Paikoro", "Rafi", "Rijau",
    "Shiroro", "Suleja", "Tafa", "Wushishi",
  ],
  "NG-OG": [
    "Abeokuta North", "Abeokuta South", "Ado-Odo/Ota|Ado Odo/Ota",
    "Ewekoro", "Ifo", "Ijebu East", "Ijebu North", "Ijebu North East",
    "Ijebu Ode", "Ikenne", "Imeko Afon", "Ipokia", "Obafemi Owode",
    "Odeda", "Odogbolu", "Ogun Waterside", "Remo North",
    "Sagamu|Shagamu", "Yewa North|Egbado North", "Yewa South|Egbado South",
  ],
  "NG-ON": [
    "Akoko North-East|Akoko North East", "Akoko North-West|Akoko North West",
    "Akoko South-East|Akoko South East", "Akoko South-West|Akoko South West",
    "Akure North", "Akure South", "Ese Odo", "Idanre", "Ifedore", "Ilaje",
    "Ile Oluji/Okeigbo", "Irele", "Odigbo", "Okitipupa", "Ondo East",
    "Ondo West", "Ose", "Owo",
  ],
  "NG-OS": [
    "Atakunmosa East", "Atakunmosa West", "Aiyedaade|Ayedade",
    "Aiyedire|Ayedire", "Boluwaduro", "Boripe", "Ede North", "Ede South",
    "Egbedore", "Ejigbo", "Ife Central", "Ife East", "Ife North",
    "Ife South", "Ifedayo", "Ifelodun", "Ila", "Ilesa East|Ilesha East",
    "Ilesa West|Ilesha West", "Irepodun", "Irewole", "Isokan", "Iwo",
    "Obokun", "Odo Otin", "Ola Oluwa", "Olorunda", "Oriade", "Orolu",
    "Osogbo",
  ],
  "NG-OY": [
    "Afijio", "Akinyele", "Atiba", "Atisbo", "Egbeda", "Ibadan North",
    "Ibadan North-East|Ibadan North East", "Ibadan North-West|Ibadan North West",
    "Ibadan South-East|Ibadan South East", "Ibadan South-West|Ibadan South West",
    "Ibarapa Central", "Ibarapa East", "Ibarapa North", "Ido", "Irepo",
    "Iseyin", "Itesiwaju", "Iwajowa", "Kajola", "Lagelu",
    "Ogbomosho North|Ogbomoso North", "Ogbomosho South|Ogbomoso South",
    "Ogo Oluwa", "Olorunsogo", "Oluyole", "Ona Ara", "Orelope",
    "Ori Ire", "Oyo East", "Oyo West", "Saki East", "Saki West", "Surulere",
  ],
  "NG-PL": [
    "Barkin Ladi", "Bassa", "Bokkos", "Jos East", "Jos North", "Jos South",
    "Kanam", "Kanke", "Langtang North", "Langtang South", "Mangu", "Mikang",
    "Pankshin", "Qua'an Pan|Quaan Pan", "Riyom", "Shendam", "Wase",
  ],
  "NG-RI": [
    "Abua/Odual", "Ahoada East", "Ahoada West", "Akuku-Toru|Akuku Toru",
    "Andoni", "Asari-Toru|Asari Toru", "Bonny", "Degema", "Eleme",
    "Emohua|Emuoha", "Etche", "Gokana", "Ikwerre", "Khana",
    "Obio/Akpor|Obio-Akpor", "Ogba/Egbema/Ndoni", "Ogu/Bolo|Ogu Bolo",
    "Okrika", "Omuma|Omumma", "Opobo/Nkoro", "Oyigbo",
    "Port Harcourt|Port-Harcourt", "Tai",
  ],
  "NG-SO": [
    "Binji", "Bodinga", "Dange Shuni", "Gada", "Goronyo", "Gudu",
    "Gwadabawa", "Illela", "Isa", "Kebbe", "Kware", "Rabah", "Sabon Birni",
    "Shagari", "Silame", "Sokoto North", "Sokoto South", "Tambuwal",
    "Tangaza", "Tureta", "Wamako|Wamakko", "Wurno", "Yabo",
  ],
  "NG-TA": [
    "Ardo Kola|Ardo-Kola", "Bali", "Donga", "Gashaka", "Gassol", "Ibi",
    "Jalingo", "Karim Lamido", "Kurmi", "Lau", "Sardauna", "Takum",
    "Ussa", "Wukari", "Yorro", "Zing",
  ],
  "NG-YO": [
    "Bade", "Bursari", "Damaturu", "Fika", "Fune", "Geidam", "Gujba",
    "Gulani", "Jakusko", "Karasuwa", "Machina", "Nangere", "Nguru",
    "Potiskum", "Tarmuwa", "Yunusari", "Yusufari",
  ],
  "NG-ZA": [
    "Anka", "Bakura", "Birnin Magaji/Kiyaw|Birnin Magaji-Kiyaw",
    "Bukkuyum", "Bungudu", "Gummi", "Gusau", "Kaura Namoda", "Maradun",
    "Maru", "Shinkafi", "Talata Mafara", "Tsafe", "Zurmi",
  ],
};

export interface LgaRef {
  stateCode: string;
  code: string;
  name: string;
  aliases: string[];
}

/** Upper-case, hyphen-separated slug used in LGA codes (NG-KN-GWALE). */
export function lgaSlug(name: string): string {
  return name
    .toUpperCase()
    .replace(/['’]/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * geo_aliases.normalized form — identical to normalizeForAlias in
 * src/server/search/normalize.ts: diacritics stripped, lower-case, every run of
 * non-alphanumerics (incl. apostrophes, hyphens, slashes) → one space.
 * "Akwa-Ibom" → "akwa ibom", "Jama'are" → "jama are".
 */
export function normalizePlaceName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Parsed LGA list for one state, codes `${stateCode}-${slug}`. */
export function lgasForState(stateCode: string): LgaRef[] {
  const raw = NIGERIA_LGAS_RAW[stateCode];
  if (!raw) throw new Error(`No LGA list for ${stateCode}`);
  return raw.map((entry) => {
    const [name, ...aliases] = entry.split("|");
    return { stateCode, code: `${stateCode}-${lgaSlug(name)}`, name, aliases };
  });
}

export function allLgas(): LgaRef[] {
  return Object.keys(NIGERIA_LGAS_RAW).flatMap(lgasForState);
}
