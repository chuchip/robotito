import { Component,Input } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import CommonModule
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
@Component({
  selector: 'app-loading',
  imports: [CommonModule,MatProgressSpinnerModule,],
  templateUrl: './loading.component.html',
  styleUrl: './loading.component.scss'
})
export class LoadingComponent {
  @Input() isLoading:boolean=false
  constructor()
  {
    console.log("Loading component: "+this.isLoading)
  }
}
