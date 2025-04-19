import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders  } from '@angular/common/http';
import { firstValueFrom,Observable } from 'rxjs';
import { PersistenceService } from './persistence.service';
import { contextDTO } from '../model/context.dto';
@Injectable()
export class ApiBackService {

  
  private readonly backendUrl = '/api'; // Change this to your backend

  constructor(private http: HttpClient,private persistence:PersistenceService ) {}

  async text_to_sound(inputText:string) : Promise<Response>  {  
    const response = await fetch(`${this.backendUrl}/audio/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'uuid': this.persistence.uuid, "Authorization": this.persistence.getAuthorization() },
      body: JSON.stringify({ text: inputText,user:this.persistence.getUser() }),
    });
   return response
  }
  async sendQuestion(text:string):  Promise<Response> 
  {
    const response= await fetch(`${this.backendUrl}/send-question`, {
      method: 'POST',
      body: JSON.stringify({ text }),
      headers: { 'Content-Type': 'application/json','uuid': this.persistence.uuid,"Authorization":this.persistence.getAuthorization() },
    });
    return response;
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

async getLanguages(): Promise<any> {
  const url = `${this.backendUrl}/audio/languages`;  
  return  await firstValueFrom(this.http.get(url));
}
async getVoices(): Promise<any> {
  const url = `${this.backendUrl}/audio/voices`;  
  return  await firstValueFrom(this.http.get(url));
}
async getVoicesLanguage(language:string): Promise<any> {
  const url = `${this.backendUrl}/audio/voices/${language}`;  
  return  await firstValueFrom(this.http.get(url));
}
async changeLanguage(language: string, voice: string): Promise<any> {
    const url = `${this.backendUrl}/audio/language`;
    const body = { language, voice };
    return  await firstValueFrom(this.http.post(url, body));
}

async clearConversation(): Promise<any> {
  try {
    return await firstValueFrom(this.http.get(`${this.backendUrl}/clear`));
  } catch (error) {
    console.error('clear_conversation failed!:', error);
    throw error;
  }
}

async getLastUser(): Promise<any> {
  try {
    return await firstValueFrom(this.http.get(`${this.backendUrl}/last_user`));
  } catch (error) {
    console.error('get_last_user failed!:', error);
    throw error;
  }
}
  
 
 // Context
  async contextSend(context:contextDTO): Promise<any> {
    const url = `${this.backendUrl}/context`;
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });
    const body = { user: this.persistence.getUser(), label: context.label, context: context.text, 
      contextRemember: context.remember };
       

    try {
      return await firstValueFrom(this.http.post(url, body, { headers }));
    } catch (error) {
      console.error('context_send failed!:', error);
      throw error;
    }
  }
  async contextSet(id:string):  Promise<any> {   
    try {
      return await firstValueFrom(this.http.put(`${this.backendUrl}/context/id/${id}`,{}));
    } catch (error) {
      console.error('get-contexts failed!:', error);
      throw error;
    }
  }
  async contextSetLabel(label:string):  Promise<any> {   
    try {
      return await firstValueFrom(this.http.put(`${this.backendUrl}/context/label/${label}`,{}));
    } catch (error) {
      console.error('get-contexts failed!:', error);
      throw error;
    }
  }
  async contextsUserList():  Promise<any> {   
    try {
      return await firstValueFrom(this.http.get(`${this.backendUrl}/context/user/${this.persistence.getUser()}`));
    } catch (error) {
      console.error('get-contexts failed!:', error);
      throw error;
    }
  }
  async contextDelete(id: string): Promise<any> {         
    try {
      if (id=="")
        return null      
      return await firstValueFrom(this.http.delete(`${this.backendUrl}/context/id/${id}`));
    } catch (error) {
      console.error('context_delete failed!:', error);
      throw error;
    }
  }

  async conversation_user():  Promise<any> {    
    try {
      return await firstValueFrom(this.http.get(`${this.backendUrl}/conversation/user/${this.persistence.getUser()}`));
    } catch (error) {
      console.error('conversation_user failed!:', error);
      throw error;
    }      
  }
  async saveConversation(id:string,type:string,msg:string)
  {
    try {
      const payload={msg:msg,type:type,user:this.persistence.getUser()}
      return await firstValueFrom(this.http.post<{ id: string;}>(`${this.backendUrl}/conversation/id/${id}`,payload));
    } catch (error) {
      console.error('conversation_user failed!:', error);
      throw error;
    }          
  }
  async initConversation(msg:string)
  {
    try {
      const payload={msg:msg,user:this.persistence.getUser()}
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
  async conversation_delete_by_id(id: string): Promise<any> {
    const url = `${this.backendUrl}/conversation/id/${id}`;
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });
  
    try {
      return await firstValueFrom(this.http.request('delete', url, { headers }));
    } catch (error) {
      console.error('conversation_delete_by_id failed!:', error);
      throw error;
    }
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
  async getLoginUser(uuid:string): Promise<any> {    
    try {
      return await firstValueFrom(this.http.get(`${this.backendUrl}/security/uuid/${uuid}`));
    } catch (error) {
      console.error('get User failed!:', error);
      throw error;
    }     
  }
  async loginUser(user:string,password:string): Promise<any> {    
    try {
      const payload={user,password}
      return await firstValueFrom(this.http.post(`${this.backendUrl}/security/login`,payload));
    } catch (error) {
      console.error('get User failed!:', error);
      throw error;
    }     
  }
  async summaryConversation(type:string): Promise<any> {    
    try {
      const payload={type:type}
      return await firstValueFrom(this.http.post(`${this.backendUrl}/summary`,payload));
    } catch (error) {
      console.error('get User failed!:', error);
      throw error;
    }     
  }
  async ratingTeacher(phrase:string): Promise<any> {    
    try {
      const payload={phrase}
      return await firstValueFrom(this.http.post(`${this.backendUrl}/rating_phrase`,payload));
    } catch (error) {
      console.error('get User failed!:', error);
      throw error;
    }     
  }
}
