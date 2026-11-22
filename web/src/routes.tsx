import { createBrowserRouter } from 'react-router-dom';
import { Home } from './pages/Home';
import { WhereMost } from './pages/WhereMost';
import { GeoPlace } from './pages/GeoPlace';
import { CityReveal } from './pages/CityReveal';
import { ErrorPage } from './pages/ErrorPage';

export const router = createBrowserRouter([
  {
    // Pathless parent so one errorElement covers every page (and unknown URLs).
    errorElement: <ErrorPage />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/games/where-most', element: <WhereMost /> },
      { path: '/games/geoplace', element: <GeoPlace /> },
      { path: '/games/city-reveal', element: <CityReveal /> },
    ],
  },
]);
