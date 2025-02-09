import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { provideHttpClient } from '@angular/common/http'; // Import provideHttpClient

const appConfig = {
  providers: [
    provideHttpClient(), // Add provideHttpClient here  
  ]
};
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
