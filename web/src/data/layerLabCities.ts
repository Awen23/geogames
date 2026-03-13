export interface Landmark {
  /** Internal label — not shown in game markers; must not contain the city name */
  label: string;
  lat: number;
  lon: number;
  /** English Wikipedia article title — used to fetch a thumbnail via the REST summary API */
  wikiTitle: string;
}

export interface CuratedLabel {
  /** Text displayed on the map — must not contain the city name */
  text: string;
  lat: number;
  lon: number;
}

export interface LabCity {
  id: string;
  name: string;
  lat: number;
  lon: number;
  zoom: number;
  landmarks: Landmark[];
  /** 6 notable streets/squares spread across different districts, visible at any zoom */
  curatedLabels: CuratedLabel[];
}

export const LAB_CITIES: LabCity[] = [
  {
    id: 'bern',
    name: 'Bern',
    lat: 46.948,
    lon: 7.4474,
    zoom: 13,
    landmarks: [
      { label: 'Federal Palace', lat: 46.9467, lon: 7.4443, wikiTitle: 'Federal Palace of Switzerland' },
      { label: 'Zytglogge', lat: 46.9481, lon: 7.4487, wikiTitle: 'Zytglogge' },
      { label: 'Cathedral', lat: 46.9482, lon: 7.4512, wikiTitle: 'Bern Minster' },
    ],
    curatedLabels: [
      { text: 'Kramgasse', lat: 46.9481, lon: 7.4501 },          // old town center
      { text: 'Spitalgasse', lat: 46.9507, lon: 7.4441 },        // shopping street, north of old town
      { text: 'Länggassstrasse', lat: 46.9553, lon: 7.4262 },    // university district, west
      { text: 'Kirchenfeldstrasse', lat: 46.9428, lon: 7.4561 }, // museum quarter, south
      { text: 'Breitenrainplatz', lat: 46.9596, lon: 7.4478 },   // north neighbourhood square
      { text: 'Weissenbühlweg', lat: 46.9370, lon: 7.4390 },     // south residential
    ],
  },
  {
    id: 'osaka',
    name: 'Osaka',
    lat: 34.6937,
    lon: 135.5023,
    zoom: 12,
    landmarks: [
      { label: 'Castle', lat: 34.6873, lon: 135.5262, wikiTitle: 'Osaka Castle' },
      { label: 'Dōtonbori', lat: 34.6689, lon: 135.5014, wikiTitle: 'Dōtonbori' },
      { label: 'Sky Building', lat: 34.705, lon: 135.4905, wikiTitle: 'Umeda Sky Building' },
    ],
    curatedLabels: [
      { text: '御堂筋', lat: 34.6780, lon: 135.4997 },    // Midōsuji, main central boulevard
      { text: '天神橋筋', lat: 34.7010, lon: 135.5103 },  // Tenjinbashisuji, north shopping arcade
      { text: '新世界', lat: 34.6520, lon: 135.5060 },    // Shinsekai, retro south district
      { text: '堀江', lat: 34.6720, lon: 135.4936 },      // Horie, west fashion quarter
      { text: '千日前通', lat: 34.6655, lon: 135.5080 },  // Sennichimae-dori, south entertainment
      { text: '長堀通', lat: 34.6750, lon: 135.5150 },    // Nagahori-dori, east-west artery
    ],
  },
  {
    id: 'tegucigalpa',
    name: 'Tegucigalpa',
    lat: 14.0723,
    lon: -87.2025,
    zoom: 13,
    landmarks: [
      { label: 'City Panorama', lat: 14.0723, lon: -87.2025, wikiTitle: 'Tegucigalpa' },
      { label: 'Cloud Forest', lat: 14.069, lon: -87.094, wikiTitle: 'La Tigra National Park' },
      { label: 'Colonial Quarter', lat: 14.0, lon: -87.188, wikiTitle: 'Ojojona' },
    ],
    curatedLabels: [
      { text: 'Bulevar Morazán', lat: 14.0895, lon: -87.1981 },        // main east boulevard
      { text: 'Calle Real Comayagüela', lat: 14.0979, lon: -87.2126 }, // historic west district
      { text: 'Colonia Palmira', lat: 14.0901, lon: -87.1892 },        // diplomatic east quarter
      { text: 'Calle Los Próceres', lat: 14.0837, lon: -87.2004 },     // south residential
      { text: 'Bulevar Suyapa', lat: 14.0780, lon: -87.1905 },         // southeast university area
      { text: 'Avenida La Paz', lat: 14.1000, lon: -87.2100 },         // north central
    ],
  },
  {
    id: 'kinshasa',
    name: 'Kinshasa',
    lat: -4.3217,
    lon: 15.3222,
    zoom: 12,
    landmarks: [
      { label: 'City Panorama', lat: -4.3217, lon: 15.3222, wikiTitle: 'Kinshasa' },
      { label: 'Stadium', lat: -4.3261, lon: 15.3268, wikiTitle: 'Stade des Martyrs' },
      { label: 'River View', lat: -4.3088, lon: 15.305, wikiTitle: 'Congo River' },
    ],
    curatedLabels: [
      { text: 'Boulevard du 30 Juin', lat: -4.3228, lon: 15.3159 }, // main CBD avenue
      { text: 'Avenue Tombalbaye', lat: -4.3270, lon: 15.2950 },    // west of CBD
      { text: 'Matonge', lat: -4.3600, lon: 15.3400 },              // south entertainment quarter
      { text: 'Binza', lat: -4.3450, lon: 15.2850 },                // hillside residential northwest
      { text: 'Avenue de la Justice', lat: -4.3264, lon: 15.3222 }, // central avenue
      { text: 'Kintambo', lat: -4.3100, lon: 15.2780 },             // riverside northwest district
    ],
  },
  {
    id: 'bishkek',
    name: 'Bishkek',
    lat: 42.8746,
    lon: 74.5958,
    zoom: 13,
    landmarks: [
      { label: 'Ala-Too Square', lat: 42.8741, lon: 74.5958, wikiTitle: 'Ala-Too Square' },
      { label: 'White House', lat: 42.8753, lon: 74.5948, wikiTitle: 'White House (Kyrgyzstan)' },
      { label: 'Philharmonic', lat: 42.8716, lon: 74.5889, wikiTitle: 'Kyrgyz National Philharmonic' },
    ],
    curatedLabels: [
      { text: 'Чүй проспекти', lat: 42.8741, lon: 74.5890 },       // Chuy Ave, main boulevard west
      { text: 'Эркиндик бульвары', lat: 42.8741, lon: 74.6050 },   // Erkindik Blvd, central park east
      { text: 'Горький көчөсү', lat: 42.8810, lon: 74.6000 },      // Gorky St, north
      { text: 'Боконбаев көчөсү', lat: 42.8660, lon: 74.5953 },    // Bokonbaev St, south
      { text: 'Манас проспекти', lat: 42.8741, lon: 74.5720 },      // Manas Ave, far west
      { text: 'Жибек Жолу', lat: 42.8700, lon: 74.6120 },           // Jibek Jolu, Silk Road St, east
    ],
  },
  {
    id: 'perth',
    name: 'Perth',
    lat: -31.9505,
    lon: 115.8605,
    zoom: 12,
    landmarks: [
      { label: 'Kings Park', lat: -31.9618, lon: 115.8327, wikiTitle: 'Kings Park, Western Australia' },
      { label: 'Elizabeth Quay', lat: -31.9598, lon: 115.8591, wikiTitle: 'Elizabeth Quay' },
      { label: 'Cricket Ground', lat: -31.9606, lon: 115.8642, wikiTitle: 'WACA Ground' },
    ],
    curatedLabels: [
      { text: 'St Georges Terrace', lat: -31.9550, lon: 115.8548 }, // CBD main street
      { text: 'Murray Street', lat: -31.9527, lon: 115.8602 },      // shopping precinct
      { text: 'Beaufort Street', lat: -31.9360, lon: 115.8616 },    // arts/café district, north
      { text: 'Canning Highway', lat: -31.9700, lon: 115.8600 },    // south riverside
      { text: 'Stirling Highway', lat: -31.9800, lon: 115.8190 },   // southwest to Fremantle
      { text: 'Fitzgerald Street', lat: -31.9270, lon: 115.8600 },  // inner north suburb
    ],
  },
];
