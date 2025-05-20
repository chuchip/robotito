import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ErrorHandlerService {
  private errorMessageSubject = new Subject<string | null>();
  errorMessage$ = this.errorMessageSubject.asObservable();

  showError(message: string) {
    this.errorMessageSubject.next(message);
    // Optional: Auto-clear after some time if your component doesn't do it
    setTimeout(() => this.clearError(), 5000);
  }

  clearError() {
    this.errorMessageSubject.next(null);
  }
}