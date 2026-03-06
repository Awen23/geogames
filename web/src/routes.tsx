import { createBrowserRouter } from 'react-router-dom';
import { Home } from './pages/Home';
import { WhereMost } from './pages/WhereMost';

export const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/games/where-most', element: <WhereMost /> },
]);
