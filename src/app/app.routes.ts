import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/review', pathMatch: 'full' },
  {
    path: 'review',
    loadComponent: () =>
      import('./components/review/review.component').then((m) => m.ReviewComponent),
  },
  {
    path: 'add',
    loadComponent: () =>
      import('./components/add-word/add-word.component').then((m) => m.AddWordComponent),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./components/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'progress',
    loadComponent: () =>
      import('./components/progress/progress.component').then((m) => m.ProgressComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./components/settings/settings.component').then((m) => m.SettingsComponent),
  },
];
