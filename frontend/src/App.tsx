   import MapPage from './pages/MapPage'
   import AdminPage from './pages/AdminPage'

   export default function App() { 
     if (window.location.pathname === '/admin') return <AdminPage />
     return <MapPage />
   }