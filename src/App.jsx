import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthState } from './hooks/useAuthState';
import Login from './pages/Login';
import Home from './pages/Home';
import Movies from './pages/Movies';
import Series from './pages/Series';
import Profile from './pages/Profile';
import Layout from './components/Layout';

function App() {
  const { user, loading } = useAuthState();

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={
          user ? <Navigate to="/" replace /> : <Login />
        } />
        <Route path="/" element={
          user ? <Layout /> : <Navigate to="/login" replace />
        }>
          <Route index element={<Home />} />
          <Route path="movies" element={<Movies />} />
          <Route path="series" element={<Series />} />
          <Route path="profile" element={<Profile />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;