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
  question_summary1 =`Your output is to an API.
   Response to user and metadata will be extracted from output json.
    Create only valid json complying to schema.    
    // json output schema
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "message": {
      "type": "object",
      "properties": {
        "rating": {
          "type": "string",
          "description": "General Rating  ove the errors in the sentences ",
          "example": "Good"
        },
        "explication": {
          "type": "string",
          "description": "Explication why you give this rating",
          "example": "It's a good job but ..."
        },
      },
      "required": [
        "rating",
        "description",        
      ]
    }
    }
  Check all these sentences searching for grammatical errors, 
   giving a final brief feedback without talk about specific sentences.
   It's very important that you don't worry about punctuation or meaning or even missing spaces.
   The phrases sentences were written for someone at level B2, so don't be too harsh. `
  question_summaary2=`Your output is to an API. Response to user and metadata will be extracted from output json.
    Create only valid json complying to schema.     
// json output schema
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "feedback": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "sentence": { "type": "string",  "description": "Original setence ", },
          "status": { "type": "string", "description": "Good if it's OK.", },
          "explication": { "type": "string", "description": "Explication why you give this status", },
          "correction": { "type": "string", "description": "Give an description what was bad", }
        },
        "required": ["sentence", "status", "explication", "correction"]
      }
    }
  },
  "required": ["feedback"]
}

    Check all these sentences searching for grammatical errors.
    It's very important that you don't worry about punctuation or meaning or even missing spaces. 
    The phrases sentences were written for someone at level B2, so don't be too harsh.
      `
  constructor(public back: ApiBackService,public persistence: PersistenceService)
  {
    console.log("In summary Component")
   
  }
  async ngOnInit() {
    console.log("SummaryComponent initialized");
   
    // Add any additional logic you want to execute after the component is constructed  
    const data = await this.back.summary_conversation(this.question_summary1)
    const cleaned = data.summary.replace(/```json|```/g, '').trim();
    let response1 = JSON.parse(cleaned);
    this.rating = response1.message.rating;
    this.explication_rating=response1.message.explication
    console.log(response1.message)
    let response2=await this.back.summary_conversation(this.question_summaary2)
    const cleaned2 = response2.summary.replace(/```json|```/g, '').trim();
    console.log(cleaned2)
    let response2_json = JSON.parse(cleaned2);
    console.log(response2_json)
    this.summarySentences = response2_json.feedback.filter((item: { status: string }) => item.status.toLowerCase() !== 'good');
    this.isLoading=false    
  }
  closeWindow()
  {
    this.persistence.showSummary=false
  }
}
