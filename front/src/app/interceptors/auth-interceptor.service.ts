import {  HttpInterceptorFn } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PersistenceService } from '../services/persistence.service';
import { inject } from '@angular/core';


export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const persistenceService = inject(PersistenceService); // Inject the UUID service
  const uuid = persistenceService.uuid; // Retrieve UUID

  const modifiedReq = req.clone({
    setHeaders: {
      'Authorization': persistenceService.getAuthorization(), // Replace with dynamic token if needed
      'uuid': uuid // Dynamically set UUID
    }
  });

  return next(modifiedReq);
};