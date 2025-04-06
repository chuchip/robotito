
import { Component,Input } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import CommonModule

@Component({
  selector: 'app-sound-recording',
  imports: [CommonModule], 
  templateUrl: './sound-recording.component.html',
  styleUrl: './sound-recording.component.scss'
})
export class SoundRecordingComponent {
  @Input() isRecording: boolean = false;
}
