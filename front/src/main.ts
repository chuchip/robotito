import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { provideHttpClient } from '@angular/common/http'; // Import provideHttpClient
import { provideAnimations } from '@angular/platform-browser/animations';
import { importProvidersFrom } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';

const appConfig = {
  providers: [
    provideHttpClient(),
    provideAnimations(), importProvidersFrom(MatTooltipModule) // Add provideHttpClient here  
  ]
};
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
