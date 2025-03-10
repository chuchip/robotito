import { bootstrapApplication } from '@angular/platform-browser';

import { AppComponent } from './app/app.component';
import { provideHttpClient,withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { importProvidersFrom } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { authInterceptor } from './app/interceptors/auth-interceptor.service';

const appConfig = {
  providers: [
    provideHttpClient(),
    provideAnimations(), importProvidersFrom(MatTooltipModule) // Add provideHttpClient here  
  ]
};
bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
}).catch(err => console.error(err));