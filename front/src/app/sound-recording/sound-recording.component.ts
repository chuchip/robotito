
import { Component,Input,Output,EventEmitter  } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import CommonModule

@Component({
  selector: 'app-sound-recording',
  imports: [CommonModule], 
  templateUrl: './sound-recording.component.html',
  styleUrl: './sound-recording.component.scss'
})
export class SoundRecordingComponent {
  @Input() isRecording: boolean = false;
  @Output() valueReturned = new EventEmitter<string>();

  stopRecording()
  {
    this.valueReturned.emit("stop");
  }
  sendRecorded()
  {
    this.valueReturned.emit("send");
  }
}

