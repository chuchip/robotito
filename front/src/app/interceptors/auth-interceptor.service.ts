import {  HttpInterceptorFn } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PersistenceService } from '../services/persistence.service';
import { inject } from '@angular/core';


export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const uuidService = inject(PersistenceService); // Inject the UUID service
  const uuid = uuidService.uuid; // Retrieve UUID

  const modifiedReq = req.clone({
    setHeaders: {
      'Authorization': uuidService.getAuthorization(), // Replace with dynamic token if needed
      'uuid': uuid // Dynamically set UUID
    }
  });

  return next(modifiedReq);
};