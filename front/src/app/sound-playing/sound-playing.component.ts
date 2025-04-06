import { Component,Input } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import CommonModule

@Component({
  selector: 'app-sound-playing',
  imports: [CommonModule], 
  templateUrl: './sound-playing.component.html',
  styleUrl: './sound-playing.component.scss'
})
export class SoundPlayingComponent {
  @Input() isPlaying: boolean = false;
}
