import {RouterOutlet} from "@angular/router"
import { Component,OnInit } from "@angular/core";
import { ErrorMessageComponent } from "./error-message/error-message.component";
import { Observable } from 'rxjs';
import { ErrorHandlerService } from "./services/error-handler.service";
import { CommonModule } from "@angular/common";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet,ErrorMessageComponent,CommonModule ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent  implements OnInit {
  title = 'routing-app';
  errorMessage$: Observable<string | null>;
  constructor(private errorHandlerService: ErrorHandlerService) {
    this.errorMessage$ = this.errorHandlerService.errorMessage$;
    this.errorMessage$.subscribe(error => {
      if (error) {
      // Do something when a string is emitted
      console.log('Error received:', error);
      }
    });
  }
  ngOnInit(): void {}
  onErrorMessageDismissed() {
    this.errorHandlerService.clearError();
  }
}