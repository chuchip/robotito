import { Injectable, resolveForwardRef } from '@angular/core';
import { HttpClient,HttpHeaders  } from '@angular/common/http';
import { firstValueFrom,Observable } from 'rxjs';
import { PersistenceService } from './persistence.service';
@Injectable({
  providedIn: 'root'
})
export class ApiBackService {
  labelContext=""
  
  private readonly backendUrl = 'http://localhost:5000'; // Change this to your backend

  constructor(private http: HttpClient,private persistence:PersistenceService ) {}

  async text_to_sound(inputText:string) : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/audio/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'uuid': this.persistence.uuid },
      body: JSON.stringify({ text: inputText,user:this.persistence.user }),
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
  async change_language(language: string, voice: string): Promise<any> {
    const url = `${this.backendUrl}/audio/language`;

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    const body = { language, voice };

    return  await firstValueFrom(this.http.post(url, body, { headers }));
  }
/*
  async change_language(language:string,voice: string) : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/audio/language`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: language,voice: voice }),
    });
   return response
  }
*/
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
  async context_send(label: string, context: string,rememberContext:string): Promise<any> {
    const url = `${this.backendUrl}/context`;
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });
    const body = { user: this.persistence.user, label: label,
       context: context, contextRemember: rememberContext };

    try {
      return await firstValueFrom(this.http.post(url, body, { headers }));
    } catch (error) {
      console.error('context_send failed!:', error);
      throw error;
    }
  }
  
  async context_get():  Promise<any> {   
    try {
      return await firstValueFrom(this.http.get(`${this.backendUrl}/context/user/${this.persistence.user}`));
    } catch (error) {
      console.error('get-contexts failed!:', error);
      throw error;
    }
  }
  async context_delete(label:string):  Promise<Response> {          
    const response = await fetch(`${this.backendUrl}/context`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'user': this.persistence.user,'label':label }),
    });    
    return  response;
  }

  async conversation_user():  Promise<any> {    
    try {
      return await firstValueFrom(this.http.get(`${this.backendUrl}/conversation/user/${this.persistence.user}`));
    } catch (error) {
      console.error('conversation_user failed!:', error);
      throw error;
    }      
  }
  async saveConversation(id:string,type:string,msg:string)
  {
    try {
      const payload={msg:msg,type:type,user:this.persistence.user}
      return await firstValueFrom(this.http.post<{ id: string;}>(`${this.backendUrl}/conversation/id/${id}`,payload));
    } catch (error) {
      console.error('conversation_user failed!:', error);
      throw error;
    }          
  }
  async initConversation(msg:string)
  {
    try {
      const payload={msg:msg,user:this.persistence.user}
      return await firstValueFrom(this.http.post<{ id: string;}>(`${this.backendUrl}/conversation/init`,payload));
    } catch (error) {
      console.error('Init conversation failed!:', error);
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
  cleanText(text:string):string
  {   
    const caracteresPermitidos = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ñáéíóúüÁÉÍÓÚÜ .,\'"?!¿:-\n';
    let textoLimpio = '';

    for (const char of text) {
      if (caracteresPermitidos.includes(char)) {
        textoLimpio += char;
      }
    }
    //console.log(textoLimpio)
    return textoLimpio;
  }
}
