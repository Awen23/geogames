/**
 * One-shot script: generates api/src/data/centroids.json from world-atlas TopoJSON.
 * Run once: tsx tools/generateCentroids.ts
 */
import { feature } from 'topojson-client';
import { geoCentroid } from 'd3-geo';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// world-atlas ships countries-110m.json with numeric id = ISO numeric code
const topology = require('world-atlas/countries-110m.json');
const countries = feature(topology as never, (topology as never).objects.countries);

// ISO numeric → ISO alpha-3 mapping (subset covering all question countries + more)
// Source: https://en.wikipedia.org/wiki/ISO_3166-1
const numericToAlpha3: Record<string, string> = {
  '004': 'AFG', '008': 'ALB', '012': 'DZA', '024': 'AGO', '032': 'ARG',
  '036': 'AUS', '040': 'AUT', '050': 'BGD', '056': 'BEL', '068': 'BOL',
  '076': 'BRA', '100': 'BGR', '116': 'KHM', '120': 'CMR', '124': 'CAN',
  '144': 'LKA', '152': 'CHL', '156': 'CHN', '170': 'COL', '180': 'COD',
  '188': 'CRI', '191': 'HRV', '192': 'CUB', '196': 'CYP', '203': 'CZE',
  '208': 'DNK', '214': 'DOM', '218': 'ECU', '818': 'EGY', '222': 'SLV',
  '231': 'ETH', '246': 'FIN', '250': 'FRA', '276': 'DEU', '288': 'GHA',
  '300': 'GRC', '320': 'GTM', '332': 'HTI', '340': 'HND', '348': 'HUN',
  '356': 'IND', '360': 'IDN', '364': 'IRN', '368': 'IRQ', '372': 'IRL',
  '376': 'ISR', '380': 'ITA', '388': 'JAM', '392': 'JPN', '400': 'JOR',
  '398': 'KAZ', '404': 'KEN', '410': 'KOR', '414': 'KWT', '418': 'LAO',
  '422': 'LBN', '428': 'LVA', '440': 'LTU', '442': 'LUX', '458': 'MYS',
  '484': 'MEX', '504': 'MAR', '516': 'NAM', '524': 'NPL', '528': 'NLD',
  '554': 'NZL', '558': 'NIC', '566': 'NGA', '578': 'NOR', '586': 'PAK',
  '591': 'PAN', '600': 'PRY', '604': 'PER', '608': 'PHL', '616': 'POL',
  '620': 'PRT', '630': 'PRI', '642': 'ROU', '643': 'RUS', '646': 'RWA',
  '682': 'SAU', '694': 'SLE', '703': 'SVK', '705': 'SVN', '706': 'SOM',
  '710': 'ZAF', '724': 'ESP', '752': 'SWE', '756': 'CHE', '760': 'SYR',
  '764': 'THA', '780': 'TTO', '788': 'TUN', '792': 'TUR', '800': 'UGA',
  '804': 'UKR', '784': 'ARE', '826': 'GBR', '840': 'USA', '858': 'URY',
  '860': 'UZB', '862': 'VEN', '704': 'VNM', '887': 'YEM', '894': 'ZMB',
  '716': 'ZWE', '499': 'MNE', '807': 'MKD', '688': 'SRB', '070': 'BIH',
  '112': 'BLR', '233': 'EST', '352': 'ISL', '434': 'LBY', '496': 'MNG',
  '422': 'LBN', '504': 'MAR', '788': 'TUN', '012': 'DZA', '818': 'EGY',
  '792': 'TUR', '760': 'SYR', '368': 'IRQ', '682': 'SAU', '400': 'JOR',
  '275': 'PSE', '616': 'POL', '642': 'ROU', '703': 'SVK', '705': 'SVN',
  '191': 'HRV', '070': 'BIH', '499': 'MNE', '807': 'MKD', '688': 'SRB',
  '020': 'AND', '372': 'IRL', '470': 'MLT',
};

interface Centroid {
  lat: number;
  lon: number;
}

const centroids: Record<string, Centroid> = {};

(countries as { features: { id: string; geometry: unknown }[] }).features.forEach((f) => {
  const id = String(f.id).padStart(3, '0');
  const alpha3 = numericToAlpha3[id];
  if (!alpha3) { return; }
  const [lon, lat] = geoCentroid(f as never);
  if (isNaN(lon) || isNaN(lat)) { return; }
  centroids[alpha3] = {
    lat: Math.round(lat * 100) / 100,
    lon: Math.round(lon * 100) / 100,
  };
});

const outPath = path.resolve(process.cwd(), 'shared/centroids.json');
fs.writeFileSync(outPath, JSON.stringify(centroids, null, 2));
console.log(`Written ${Object.keys(centroids).length} centroids to ${outPath}`);
