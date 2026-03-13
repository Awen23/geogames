export interface Landmark {
  /** Internal label — not shown in game markers; must not contain the city name */
  label: string;
  lat: number;
  lon: number;
  /** English Wikipedia article title — used to fetch a thumbnail via the REST summary API */
  wikiTitle: string;
}

export interface LabCity {
  id: string;
  name: string;
  lat: number;
  lon: number;
  zoom: number;
  landmarks: Landmark[];
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
  },
];
