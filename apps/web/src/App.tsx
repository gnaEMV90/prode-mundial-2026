import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Auth';
import { Fixture } from './pages/Fixture';
import { Home } from './pages/Home';
import { MyPredictions } from './pages/MyPredictions';
import { Ranking } from './pages/Ranking';
import { Rules } from './pages/Rules';
import { TournamentClosed } from './pages/TournamentClosed';
import { UserPanel } from './pages/UserPanel';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'fixture', element: <Fixture /> },
      { path: 'ranking', element: <Ranking /> },
      { path: 'reglas', element: <Rules /> },
      { path: 'login', element: <Login /> },
      { path: 'registro', element: <TournamentClosed /> },
      { path: 'especiales', element: <TournamentClosed /> },
      { path: 'cuenta', element: <TournamentClosed /> },
      {
        path: 'panel',
        element: (
          <ProtectedRoute>
            <UserPanel />
          </ProtectedRoute>
        )
      },
      {
        path: 'mis-pronosticos',
        element: (
          <ProtectedRoute>
            <MyPredictions />
          </ProtectedRoute>
        )
      },
      { path: 'admin', element: <TournamentClosed /> }
    ]
  }
]);

export function App() {
  return <RouterProvider router={router} />;
}
