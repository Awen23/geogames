export interface Landmark {
  name: string;
  lat: number;
  lon: number;
  imageUrl: string;
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
      {
        name: 'Bundeshaus',
        lat: 46.9467,
        lon: 7.4443,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Bundeshaus_Bern_2009.jpg/400px-Bundeshaus_Bern_2009.jpg',
      },
      {
        name: 'Zytglogge',
        lat: 46.9481,
        lon: 7.4487,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Zytglogge_%28Bern%29_from_north.jpg/400px-Zytglogge_%28Bern%29_from_north.jpg',
      },
    ],
  },
  {
    id: 'osaka',
    name: 'Osaka',
    lat: 34.6937,
    lon: 135.5023,
    zoom: 12,
    landmarks: [
      {
        name: 'Osaka Castle',
        lat: 34.6873,
        lon: 135.5262,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Osaka_Castle_in_November_2019.jpg/400px-Osaka_Castle_in_November_2019.jpg',
      },
      {
        name: 'Dōtonbori',
        lat: 34.6689,
        lon: 135.5014,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Dotonbori_at_night_0668.jpg/400px-Dotonbori_at_night_0668.jpg',
      },
    ],
  },
  {
    id: 'tegucigalpa',
    name: 'Tegucigalpa',
    lat: 14.0723,
    lon: -87.2025,
    zoom: 13,
    landmarks: [
      {
        name: 'Catedral de Comayagüela',
        lat: 14.0989,
        lon: -87.2062,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Catedral_de_Tegucigalpa.jpg/400px-Catedral_de_Tegucigalpa.jpg',
      },
      {
        name: 'Basílica de Suyapa',
        lat: 14.0777,
        lon: -87.1757,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Basilica_de_Suyapa.JPG/400px-Basilica_de_Suyapa.JPG',
      },
    ],
  },
  {
    id: 'kinshasa',
    name: 'Kinshasa',
    lat: -4.3217,
    lon: 15.3222,
    zoom: 12,
    landmarks: [
      {
        name: 'Cathédrale Notre-Dame du Congo',
        lat: -4.3215,
        lon: 15.3229,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Cath%C3%A9drale_Notre-Dame_du_Congo.JPG/400px-Cath%C3%A9drale_Notre-Dame_du_Congo.JPG',
      },
      {
        name: 'Palais de la Nation',
        lat: -4.3183,
        lon: 15.2987,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Palais_de_la_Nation_Kinshasa.jpg/400px-Palais_de_la_Nation_Kinshasa.jpg',
      },
    ],
  },
  {
    id: 'bishkek',
    name: 'Bishkek',
    lat: 42.8746,
    lon: 74.5958,
    zoom: 13,
    landmarks: [
      {
        name: 'Ala-Too Square',
        lat: 42.8741,
        lon: 74.5958,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Ala_Too_Square_Bishkek.jpg/400px-Ala_Too_Square_Bishkek.jpg',
      },
      {
        name: 'White House (Government)',
        lat: 42.8753,
        lon: 74.5948,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Government_House_Bishkek.jpg/400px-Government_House_Bishkek.jpg',
      },
    ],
  },
  {
    id: 'perth',
    name: 'Perth',
    lat: -31.9505,
    lon: 115.8605,
    zoom: 12,
    landmarks: [
      {
        name: 'Perth CBD Skyline',
        lat: -31.9534,
        lon: 115.8601,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Perth_CBD_from_Kings_Park_Oct_2022.jpg/400px-Perth_CBD_from_Kings_Park_Oct_2022.jpg',
      },
      {
        name: 'Bell Tower',
        lat: -31.9583,
        lon: 115.8605,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Bell_Tower_Perth_July_2021.jpg/400px-Bell_Tower_Perth_July_2021.jpg',
      },
    ],
  },
];
