import { Component,Input } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import CommonModule

@Component({
  selector: 'app-sound-indicator',
  imports: [CommonModule], 
  templateUrl: './sound-indicator.component.html',
  styleUrl: './sound-indicator.component.scss'
})
export class SoundIndicatorComponent {
  @Input() isRecording: boolean = false;
}
