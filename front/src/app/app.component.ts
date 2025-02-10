import { Component } from '@angular/core';
import { RecordComponent } from "./audio-recorder/audio-recorder.component";

@Component({
  selector: 'app-root',
  imports: [ RecordComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'robotito_ng';
}
