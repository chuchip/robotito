import { Injectable } from '@angular/core';
import { HttpClient,HttpHeaders  } from '@angular/common/http';
import { firstValueFrom,Observable } from 'rxjs';
import { PersistenceService } from './persistence.service';
import { contextDTO } from '../model/context.dto';
@Injectable()
export class ApiBackService {

  
  private readonly backendUrl = '/api'; // Change this to your backend

  constructor(private http: HttpClient,private persistence:PersistenceService ) {}

  /** Headers used for the one remaining raw `fetch()` call (streaming). */
  private getAuthHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'uuid': this.persistence.uuid,
      'Authorization': this.persistence.getAuthorization(),
    };
  }

  async text_to_sound(inputText:string,voice:string="") : Promise<Blob>  {
    const body = { text: inputText, user: this.persistence.getUser(), voice_name: voice };
    return await firstValueFrom(
      this.http.post(`${this.backendUrl}/audio/tts`, body, { responseType: 'blob' })
    );
  }
  async sendQuestion(text:string):  Promise<Response>
  {
    // Still uses fetch() because HttpClient buffers the full response body;
    // LLM streaming requires reading chunks as they arrive via ReadableStream.
    return await fetch(`${this.backendUrl}/send-question`, {
      method: 'POST',
      body: JSON.stringify({ text }),
      headers: this.getAuthHeaders(),
    });
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

async changeHumanVoice(voice: string): Promise<any> {
    const url = `${this.backendUrl}/audio/human_voice`;
    const body = { voice };
    return await firstValueFrom(this.http.post(url, body));
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
  async contextSetUrl(url: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.put(`${this.backendUrl}/context/url`, { url }));
    } catch (error) {
      console.error('context_set_url failed!:', error);
      throw error;
    }
  }
  async contextGetUrl(): Promise<any> {
    try {
      return await firstValueFrom(this.http.get(`${this.backendUrl}/context/url`));
    } catch (error) {
      console.error('context_get_url failed!:', error);
      throw error;
    }
  }
  async contextClearUrl(): Promise<any> {
    try {
      return await firstValueFrom(this.http.delete(`${this.backendUrl}/context/url`));
    } catch (error) {
      console.error('context_clear_url failed!:', error);
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
      return await firstValueFrom(this.http.post<{ id: string; name?: string | null }>(`${this.backendUrl}/conversation/id/${id}`,payload));
    } catch (error) {
      console.error('conversation_user failed!:', error);
      throw error;
    }          
  }
  async renameConversation(id: string, name: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.put(`${this.backendUrl}/conversation/id/${id}/name`, { name }));
    } catch (error) {
      console.error('renameConversation failed!:', error);
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
    const caracteresPermitidos = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ñáéíóúüÁÉÍÓÚÜ .,\'"?!¿:-\n\r';
    let textoLimpio = '';

    for (const char of text) {
      if (caracteresPermitidos.includes(char)) {
        textoLimpio += char;
      }
    }   
  
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
  async logoutUser(): Promise<any> {
    try {
      return await firstValueFrom(this.http.post(`${this.backendUrl}/security/logout`, {}));
    } catch (error) {
      console.error('logoutUser failed!:', error);
      // Swallow errors: the client should proceed with logout regardless.
      return null;
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
      console.error('ratingTeacher failed!:', error);
      throw error;
    }     
  }
  async setMaxLengthAnswer(maxLength:string): Promise<any> {    
    try {    
      const payload={}
      return await firstValueFrom(this.http.put(`${this.backendUrl}/max_length_answer/${maxLength}`,payload));
    } catch (error) {
      console.error('setMaxLengthAnswer failed!:', error);
      throw error;
    }  
  }   
  async getMaxLengthAnswer(): Promise<any> {    
    try {          
      return await firstValueFrom(this.http.get(`${this.backendUrl}/max_length_answer`));
    } catch (error) {
      console.error('getMaxLengthAnswer failed!:', error);
      throw error;
    }  
  }

  async getNotes(conversationId: string): Promise<string> {
    try {
      const result: any = await firstValueFrom(this.http.get(`${this.backendUrl}/conversation/id/${conversationId}/notes`));
      return result.notes ?? '';
    } catch (error) {
      console.error('getNotes failed!:', error);
      throw error;
    }
  }

  async saveNotes(conversationId: string, notes: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.put(`${this.backendUrl}/conversation/id/${conversationId}/notes`, { notes }));
    } catch (error) {
      console.error('saveNotes failed!:', error);
      throw error;
    }
  }

  // Dictionary methods
  async getWords(conversationId: string): Promise<any> {
    try {
      const result: any = await firstValueFrom(this.http.get(`${this.backendUrl}/conversation/id/${conversationId}/words`));
      return result.words ?? [];
    } catch (error) {
      console.error('getWords failed!:', error);
      throw error;
    }
  }

  async addWord(conversationId: string, word: string): Promise<any> {
    try {
      const result: any = await firstValueFrom(this.http.post(`${this.backendUrl}/conversation/id/${conversationId}/words`, { word }));
      return result;
    } catch (error) {
      console.error('addWord failed!:', error);
      throw error;
    }
  }

  async updateWord(conversationId: string, wordId: string, wordData: any): Promise<any> {
    try {
      return await firstValueFrom(this.http.put(`${this.backendUrl}/conversation/id/${conversationId}/words/${wordId}`, wordData));
    } catch (error) {
      console.error('updateWord failed!:', error);
      throw error;
    }
  }

  async deleteWord(conversationId: string, wordId: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.delete(`${this.backendUrl}/conversation/id/${conversationId}/words/${wordId}`));
    } catch (error) {
      console.error('deleteWord failed!:', error);
      throw error;
    }
  }

  async reviewWords(items: Array<{id?: string, word: string, expected: string, user_answer: string}>, direction: 'en->es' | 'es->en'): Promise<any> {
    try {
      const result: any = await firstValueFrom(
        this.http.post(`${this.backendUrl}/words/review`, { items, direction })
      );
      return result;
    } catch (error) {
      console.error('reviewWords failed!:', error);
      throw error;
    }
  }

  async getUserWords(): Promise<any[]> {
    try {
      const result: any = await firstValueFrom(this.http.get(`${this.backendUrl}/words`));
      return result.words ?? [];
    } catch (error) {
      console.error('getUserWords failed!:', error);
      throw error;
    }
  }

  // Long-term memory (per-user, persisted across conversations)
  async getMemory(): Promise<any> {
    try {
      return await firstValueFrom(this.http.get(`${this.backendUrl}/memory`));
    } catch (error) {
      console.error('getMemory failed!:', error);
      throw error;
    }
  }

  async saveMemoryProfile(profile: string): Promise<any> {
    try {
      return await firstValueFrom(this.http.put(`${this.backendUrl}/memory/profile`, { profile }));
    } catch (error) {
      console.error('saveMemoryProfile failed!:', error);
      throw error;
    }
  }

  async setMemoryEnabled(enabled: boolean): Promise<any> {
    try {
      return await firstValueFrom(this.http.put(`${this.backendUrl}/memory/enabled`, { enabled }));
    } catch (error) {
      console.error('setMemoryEnabled failed!:', error);
      throw error;
    }
  }

  async deleteMemoryFact(factId: number): Promise<any> {
    try {
      return await firstValueFrom(this.http.delete(`${this.backendUrl}/memory/fact/${factId}`));
    } catch (error) {
      console.error('deleteMemoryFact failed!:', error);
      throw error;
    }
  }

  async forgetAllMemory(): Promise<any> {
    try {
      return await firstValueFrom(this.http.delete(`${this.backendUrl}/memory`));
    } catch (error) {
      console.error('forgetAllMemory failed!:', error);
      throw error;
    }
  }

  async consolidateMemoryNow(): Promise<any> {
    try {
      return await firstValueFrom(this.http.post(`${this.backendUrl}/memory/consolidate`, {}));
    } catch (error) {
      console.error('consolidateMemoryNow failed!:', error);
      throw error;
    }
  }

  /** Translate a free-form snippet of text using the LLM. */
  async translatePhrase(text: string, target: string = 'Spanish'): Promise<string> {
    try {
      const result: any = await firstValueFrom(
        this.http.post(`${this.backendUrl}/translate`, { text, target })
      );
      return result?.translation ?? '';
    } catch (error) {
      console.error('translatePhrase failed!:', error);
      throw error;
    }
  }

  // Shared audio playback utility
  async playAudioFromResponse(audioBlob: Blob, playbackSpeed: number = 1): Promise<HTMLAudioElement> {
    const audioUrl = URL.createObjectURL(audioBlob);

    const audio = new Audio(audioUrl);
    audio.playbackRate = playbackSpeed;
    audio.play();

    return audio;
  }
}
