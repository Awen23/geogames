import { createBrowserRouter } from 'react-router-dom';
import { Home } from './pages/Home';
import { WhereMost } from './pages/WhereMost';
import { GeoPlace } from './pages/GeoPlace';
import { LayerLab } from './pages/LayerLab';
import { CityReveal } from './pages/CityReveal';

export const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/games/where-most', element: <WhereMost /> },
  { path: '/games/geoplace', element: <GeoPlace /> },
  { path: '/games/city-reveal', element: <CityReveal /> },
  { path: '/layer-lab', element: <LayerLab /> },
]);
