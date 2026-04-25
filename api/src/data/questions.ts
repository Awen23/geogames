import type { Question } from '@shared/types';
import { loadQuestionData } from './csvLoader';

function loadQuestion(csvFile: string, year: number): Pick<Question, 'ranking' | 'coveredIsoCodes'> {
  return loadQuestionData(csvFile, year);
}

const beerData = loadQuestion('beer-consumption-per-person.csv', 2020);
const milkData = loadQuestion('per-capita-milk-consumption.csv', 2020);
const meatData = loadQuestion('meat-supply-per-person.csv', 2020);

export const questions: Question[] = [
  {
    id: 'beer-per-capita-2020',
    prompt: 'Which country drinks the most beer per person?',
    description: 'Average annual per capita beer consumption, measured in litres of pure alcohol. 1 litre of pure alcohol ≈ 20 litres of beer.',
    metric: 'Beer consumption per capita',
    unit: 'L pure alcohol/person/yr',
    icon: '🍺',
    source: 'WHO Global Health Observatory via Our World in Data',
    sourceUrl: 'https://ourworldindata.org/grapher/beer-consumption-per-person?time=2020',
    mapEmbedUrl: 'https://ourworldindata.org/grapher/beer-consumption-per-person?tab=map&time=2020',
    ranking: beerData.ranking,
    coveredIsoCodes: beerData.coveredIsoCodes,
  },
  {
    id: 'milk-per-capita-2020',
    prompt: 'Which country drinks the most milk per person?',
    description: 'Average per capita milk supply, measured in kilograms per person per year. Includes dairy products made from milk, but excludes butter.',
    metric: 'Milk supply per capita',
    unit: 'kg/person/year',
    icon: '🥛',
    source: 'FAO via Our World in Data',
    sourceUrl: 'https://ourworldindata.org/grapher/per-capita-milk-consumption?time=2020',
    mapEmbedUrl: 'https://ourworldindata.org/grapher/per-capita-milk-consumption?tab=map&time=2020',
    ranking: milkData.ranking,
    coveredIsoCodes: milkData.coveredIsoCodes,
  },
  {
    id: 'meat-per-capita-2020',
    prompt: 'Which country eats the most meat per person?',
    description: 'Average total meat supply per person, measured in kilograms per year.',
    metric: 'Meat supply per capita',
    unit: 'kg/person/year',
    icon: '🥩',
    source: 'FAO via Our World in Data',
    sourceUrl: 'https://ourworldindata.org/grapher/meat-supply-per-person?time=2020',
    mapEmbedUrl: 'https://ourworldindata.org/grapher/meat-supply-per-person?tab=map&time=2020',
    ranking: meatData.ranking,
    coveredIsoCodes: meatData.coveredIsoCodes,
  },
];
