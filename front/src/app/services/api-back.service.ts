import { Injectable, resolveForwardRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class ApiBackService {

  private readonly backendUrl = 'http://localhost:5000'; // Change this to your backend

  constructor(private http: HttpClient) {}

 
  async sendMsg(inputText:string): Promise<string>  {
    return new Promise((resolve, reject) => {  
      const payload = { text: inputText };
      this.http.post<{ message: string; text: string }>(`${this.backendUrl}/send-question`, payload).subscribe({
        next: (response) => {
          console.log('Send Msg OK:', response.text);
          resolve(response.text);
        },
        error: (error) => {
          console.error('Send Msg failed:', error);
          reject(error);
        }
      });     
    });
  }

  text_to_sound1(inputText:string) {
    const audioElement = new Audio();
    audioElement.src = `${this.backendUrl}/tts`;  // Flask endpoint
    audioElement.play();  //
  }
 

  async text_to_sound(inputText:string) : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: inputText }),
    });
   return response
  }
  async change_language(language:string) : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/language`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: language }),
    });
   return response
  }
  async clear_conversation() : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/clear`, {
      method: 'GET'      
    });
   return response
  }
  async get_last_user() : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/last_user`, {
      method: 'GET'      
    });
   return response
  }
  
  uploadAudio(audioChunks:Blob[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      this.http.post<{ message: string; text: string }>(`${this.backendUrl}/upload-audio`, formData).subscribe({
        next: (response) => {
          console.log('Upload successful:', response.text);
          resolve(response.text);
        },
        error: (error) => {
          console.error('Upload failed:', error);
          reject(error);
        }
      });

     
    });
  }

  // Context
  async context_send(user:string,label:string,context:string):  Promise<Response> {          
    const response = await fetch(`${this.backendUrl}/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'user': user,'label':label,'context':context }),
    });    
    return  response;
  }
  async context_get(user:string):  Promise<any> {   
    try {
      return await firstValueFrom(this.http.get(`${this.backendUrl}/context?user=${user}`));
    } catch (error) {
      console.error('get-contexts failed!:', error);
      throw error;
    }
  }
  async context_delete(user:string,label:string):  Promise<Response> {          
    const response = await fetch(`${this.backendUrl}/context`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'user': user,'label':label }),
    });    
    return  response;
  }

}
