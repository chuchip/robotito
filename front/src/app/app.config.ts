import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import {ApiBackService} from "./services/api-back.service"
import { provideHttpClient,withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { PersistenceService } from './services/persistence.service';
import { SoundService } from './services/sound.service';
import { authInterceptor } from './interceptors/auth-interceptor.service';

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes), provideHttpClient(withInterceptors([authInterceptor])), 
    ApiBackService,PersistenceService,SoundService ]
};
