import { Component,OnInit,Input,Output,EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RatingPhrase } from '../model/ratingPhrase';
@Component({
  selector: 'app-rating-phrase',
  imports: [CommonModule],
  templateUrl: './rating-phrase.component.html',
  styleUrl: './rating-phrase.component.scss'
})
export class RatingPhraseComponent implements OnInit {
 @Input() ratingPhrase:RatingPhrase  | null =null
 @Output() valueReturned = new EventEmitter<string>();

 closeWindow()
 {
  this.valueReturned.emit("close");
 }
 async ngOnInit() {
  console.log("in RatingPhraseComponent");
 }
}
