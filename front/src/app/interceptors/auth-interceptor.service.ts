import {  HttpInterceptorFn,HttpErrorResponse  } from '@angular/common/http';
import { PersistenceService } from '../services/persistence.service';
import { inject } from '@angular/core';
import { ErrorHandlerService } from '../services/error-handler.service'; // Import your new error service
import { catchError, Observable, throwError } from 'rxjs';
import { Router } from '@angular/router';
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const persistenceService = inject(PersistenceService); // Inject the UUID service
  const errorHandlerService = inject(ErrorHandlerService); // Inject your error service

  const router = inject(Router); // Inject the Router service
  const uuid = persistenceService.uuid; // Retrieve UUID

  const modifiedReq = req.clone({
    setHeaders: {
   
      'Authorization': persistenceService.getAuthorization(), // Replace with dynamic token if needed
      'uuid': uuid // Dynamically set UUID
    }
  });

  return next(modifiedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'An unknown error occurred!';

      if (error.error instanceof ErrorEvent) {
        // Client-side errors
        errorMessage = `Error: ${error.error.message}`;
      } else {
        // Server-side errors
        if (error.status) {
          errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
        } else {
          errorMessage = `An unexpected error occurred: ${error.message}`;
        }

        switch (error.status) {
          case 400:
            errorMessage = 'Bad Request: The server could not understand the request.';
            // Often, you'd want to display specific validation errors from the server here
            if (error.error && error.error.errors) {
              const validationErrors = Object.values(error.error.errors).flat();
              errorMessage += `\nDetails: ${validationErrors.join(', ')}`;
            }
            break;
          case 401:
            errorMessage = 'Unauthorized: Please log in again.';            
            break;
          case 403:
            errorMessage = 'Forbidden: You do not have permission to access this resource.';
            break;
          case 404:
            errorMessage = 'Not Found: The requested resource could not be found.';
            break;
          case 409:
            errorMessage = 'Conflict: The request could not be completed due to a conflict.';
            if (error.error && error.error.message) {
              errorMessage = error.error.message; // Use server-provided conflict message
            }
            break;
          case 500:
            errorMessage = 'Internal Server Error: Something went wrong on the server.';
            break;
          case 503:
            errorMessage = 'Service Unavailable: The server is currently unable to handle the request.';
            break;
          default:
            // For other status codes, you might have a generic message or parse server response
            if (error.error && error.error.message) {
              errorMessage = `Error ${error.status}: ${error.error.message}`;
            }
            break;
        }
      }
      errorHandlerService.showError(errorMessage);
      router.navigate(['/login']);
      // Re-throw the error so that subscribing components can also handle it if needed
      return throwError(() => new Error(errorMessage));
    })
  )
};