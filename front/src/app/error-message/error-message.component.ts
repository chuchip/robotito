import { Component, Input, Output, EventEmitter, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import CommonModule for ngIf

@Component({
  selector: 'app-error-message',  
  imports: [CommonModule], // Add CommonModule here
  templateUrl: './error-message.component.html',
  styleUrls: ['./error-message.component.scss']
})
export class ErrorMessageComponent implements OnDestroy {
  @Input() message: string | null = null;
  @Input() showDismissButton: boolean = true;
  @Input() autoDismiss: boolean = false;
  @Input() autoDismissDuration: number = 5000; // 5 seconds

  @Output() dismissed = new EventEmitter<void>();

  private dismissTimeout: any;

  ngOnChanges() {
    console.log('ngOnChanges called with message:', this.message);
    if (this.autoDismiss && this.message) {
      this.clearAutoDismiss();
      this.dismissTimeout = setTimeout(() => {
        this.dismiss();
      }, this.autoDismissDuration);
    } else if (!this.message) {
      this.clearAutoDismiss();
    }
  }

  ngOnDestroy() {
    this.clearAutoDismiss();
  }

  dismiss() {
    this.message = null; // Clear the message to hide the component
    this.dismissed.emit();
    this.clearAutoDismiss();
  }

  private clearAutoDismiss() {
    if (this.dismissTimeout) {
      clearTimeout(this.dismissTimeout);
      this.dismissTimeout = null;
    }
  }
}