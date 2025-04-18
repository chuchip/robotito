import { Component ,OnInit ,Input} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiBackService } from '../services/api-back.service';
import {LoadingComponent} from "../loading/loading.component"
import { PersistenceService } from '../services/persistence.service';
@Component({
  selector: 'app-summary',
  imports: [CommonModule,LoadingComponent],
  templateUrl: './summary.component.html',
  styleUrl: './summary.component.scss'
})
export class SummaryComponent implements OnInit {
  @Input() selectLanguage=""
  
  summarySentences:{sentence:string,status:string,explication:string,correction:string}[]=[]
  isLoading=true
  rating: string="";
  explication_rating:string=""

  constructor(public back: ApiBackService,public persistence: PersistenceService)
  {
    console.log("In summary Component")
   
  }
  async ngOnInit() {
    console.log("SummaryComponent initialized");
   
    // Add any additional logic you want to execute after the component is constructed  
    const data = await this.back.summary_conversation("resume")
    this.rating = data.rating
    this.explication_rating=data.explication
    let response2=await this.back.summary_conversation("detail")
    this.summarySentences = response2.sentences.filter((item: { status: string }) => item.status.toLowerCase() !== 'good')
    this.isLoading=false    
  }
  closeWindow()
  {
    this.persistence.showSummary=false
  }
}
