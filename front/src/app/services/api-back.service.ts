import { Injectable, resolveForwardRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class ApiBackService {

  private readonly backendUrl = 'http://localhost:5000'; // Change this to your backend

  constructor(private http: HttpClient) {}

  async sendMessage(prompt: string) {
    const response = await fetch(`${this.backendUrl}/send-question`, {
      method: 'POST',
      body: JSON.stringify({ text: prompt }),
      headers: { 'Content-Type': 'application/json' },
    });
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
  
    if (reader) {
      let result = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        result += chunk;
        console.log('Chunk received:', chunk); // Update UI with each streamed chunk
      }
    }
    else{
      console.log("No reader")
    }
  }
  

  async sendMsg1(inputText:string): Promise<string>  {
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


  async text_to_sound(inputText:string) : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/audio/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: inputText }),
    });
   return response
  }
  uploadAudio(audioChunks:Blob[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      this.http.post<{ message: string; text: string }>(`${this.backendUrl}/audio/stt`, formData).subscribe({
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
  async change_language(language:string,voice: string) : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/audio/language`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: language,voice: voice }),
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
      return await firstValueFrom(this.http.get(`${this.backendUrl}/context/user/${user}`));
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

  async conversation_user(user:string):  Promise<any> {    
    try {
      return await firstValueFrom(this.http.get(`${this.backendUrl}/conversation/user/${user}`));
    } catch (error) {
      console.error('conversation_user failed!:', error);
      throw error;
    }      

  }
  async conversation_by_id(id:string): Promise<any> {    
    try {
      return await firstValueFrom(this.http.get(`${this.backendUrl}/conversation/id/${id}`));
    } catch (error) {
      console.error('get conversation_by_id failed!:', error);
      throw error;
    }      
  }
  async conversation_delete_by_id(id:string):  Promise<Response> {    
    const response = await fetch(`${this.backendUrl}/conversation/id/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }    
    });    
    return  response;
  }    
}
