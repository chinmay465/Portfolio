import { createBrowserRouter, createHashRouter, type RouteObject } from 'react-router'
import Layout from './routes/Layout'
import Home from './routes/Home'
import NotFound from './routes/NotFound'

/** Each page beyond Home loads its own chunk the first time it is visited. */
const page = (load: () => Promise<{ default: React.ComponentType }>) => async () => ({ Component: (await load()).default })

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: Layout,
    ErrorBoundary: NotFound,
    children: [
      { index: true, Component: Home },
      { path: 'about', lazy: page(() => import('./routes/About')) },
      { path: 'experience', lazy: page(() => import('./routes/ExperiencePage')) },
      { path: 'projects', lazy: page(() => import('./routes/Projects')) },
      { path: 'projects/:id', lazy: page(() => import('./routes/ProjectDetail')) },
      { path: 'contact', lazy: page(() => import('./routes/Contact')) },
      { path: '*', Component: NotFound },
    ],
  },
]

/**
 * Real paths in production (Render rewrites every path to index.html). The preview
 * build sets VITE_HASH_ROUTER because it is served from a frame that can't take paths.
 */
export const router = import.meta.env.VITE_HASH_ROUTER === '1' ? createHashRouter(routes) : createBrowserRouter(routes)
